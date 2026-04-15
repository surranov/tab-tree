import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { ITreeNode } from './types';
import { TabTracker } from './tabTracker';
import { TabTreeDataProvider, TabTreeDragAndDropController } from './treeDataProvider';
import { getDir, collectFilePaths } from './treeUtils';
import { THIRD_PARTY_COMMANDS, computeContextKeyUpdates } from './thirdPartyCommands';

async function updateThirdPartyContextKeys(): Promise<void> {
    try {
        const available = new Set(await vscode.commands.getCommands(true));
        const updates = computeContextKeyUpdates(available);
        for (const [key, value] of Object.entries(updates)) {
            await vscode.commands.executeCommand('setContext', key, value);
        }
    } catch (err) {
        console.error('[Tab Tree] updateThirdPartyContextKeys FAILED:', err);
    }
}

function findVscodeTab(filePath: string, groupIndex?: number): vscode.Tab | undefined {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (input instanceof vscode.TabInputText && input.uri.fsPath === filePath) {
                return tab;
            }
            if (input instanceof vscode.TabInputCustom && input.uri.fsPath === filePath) {
                return tab;
            }
            if (input instanceof vscode.TabInputNotebook && input.uri.fsPath === filePath) {
                return tab;
            }
            if (input instanceof vscode.TabInputTextDiff && input.modified.fsPath === filePath) {
                return tab;
            }
        }
    }

    // Fallback for non-file tabs (webview, settings, welcome, etc.):
    // match by label + group viewColumn
    if (groupIndex !== undefined) {
        const group = vscode.window.tabGroups.all.find((g) => g.viewColumn === groupIndex);
        if (group) {
            return group.tabs.find((t) => t.label === filePath);
        }
    }

    return undefined;
}

function getGitChangedFiles(cwd: string, staged: boolean): Promise<string[]> {
    const args = staged
        ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR']
        : ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'];

    return new Promise((resolve) => {
        execFile('git', args, { cwd }, (err, stdout) => {
            if (err) {
                resolve([]);
                return;
            }
            const files = stdout.trim().split('\n').filter(Boolean);
            resolve(files.map((f) => cwd + '/' + f));
        });
    });
}

async function openGitChanges(staged: boolean): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    const allFiles: string[] = [];
    for (const folder of folders) {
        const files = await getGitChangedFiles(folder.uri.fsPath, staged);
        allFiles.push(...files);
    }

    for (const filePath of allFiles) {
        const uri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('vscode.open', uri, { preview: false });
    }
}

export function activate(context: vscode.ExtensionContext): void {
    try {
        const tabTracker = new TabTracker();

        const treeDataProvider = new TabTreeDataProvider(tabTracker);

        const dragAndDropController = new TabTreeDragAndDropController();

        const treeView = vscode.window.createTreeView('tabTree', {
            treeDataProvider,
            showCollapseAll: false,
            dragAndDropController,
            canSelectMany: true,
        });

        const followEnabled = vscode.workspace.getConfiguration('tabTree').get<boolean>('followActiveFile', true);
        vscode.commands.executeCommand('setContext', 'tabTree.followActiveFile', followEnabled);

        const previewEnabled = vscode.workspace.getConfiguration('workbench.editor').get<boolean>('enablePreview', true);
        vscode.commands.executeCommand('setContext', 'tabTree.previewEnabled', previewEnabled);

        updateThirdPartyContextKeys();

        let selectedForCompare: vscode.Uri | undefined;

        let revealTimer: ReturnType<typeof setTimeout> | undefined;

        function revealActiveFile(): void {
            const config = vscode.workspace.getConfiguration('tabTree');
            if (!config.get<boolean>('followActiveFile', true)) return;

            const activePath = tabTracker.getActiveTabPath();
            if (!activePath) return;

            const node = treeDataProvider.findNodeByPath(activePath);
            if (!node) return;

            // reveal() is best-effort: if a refresh invalidates the handle
            // between our lookup and VS Code's async resolution, the promise
            // rejects with "Cannot resolve tree item for element". That is
            // benign — the next scheduleReveal will retry with a fresh node.
            Promise.resolve(
                treeView.reveal(node, { select: true, focus: false, expand: true }),
            ).catch(() => { /* swallow race-induced rejection */ });
        }

        function scheduleReveal(): void {
            if (revealTimer !== undefined) {
                clearTimeout(revealTimer);
            }
            revealTimer = setTimeout(() => {
                revealTimer = undefined;
                revealActiveFile();
            }, 150);
        }

        context.subscriptions.push(
            tabTracker,
            treeDataProvider,
            treeView,
            dragAndDropController,

            vscode.window.onDidChangeActiveTextEditor(() => scheduleReveal()),
            vscode.window.tabGroups.onDidChangeTabs(() => scheduleReveal()),

            vscode.commands.registerCommand('tabTree.focusTab', async (groupIndex: number, tabIndex: number) => {
                const groups = vscode.window.tabGroups.all;
                const groupPos = groups.findIndex((g) => g.viewColumn === groupIndex);
                if (groupPos < 0 || groupPos >= 8) return;
                if (tabIndex < 0 || tabIndex >= groups[groupPos].tabs.length) return;

                const focusGroupCommands = [
                    'workbench.action.focusFirstEditorGroup',
                    'workbench.action.focusSecondEditorGroup',
                    'workbench.action.focusThirdEditorGroup',
                    'workbench.action.focusFourthEditorGroup',
                    'workbench.action.focusFifthEditorGroup',
                    'workbench.action.focusSixthEditorGroup',
                    'workbench.action.focusSeventhEditorGroup',
                    'workbench.action.focusEighthEditorGroup',
                ];
                await vscode.commands.executeCommand(focusGroupCommands[groupPos]);
                await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
            }),

            vscode.commands.registerCommand('tabTree.closeTab', (node: ITreeNode) => {
                if (!node?.path) return;
                const tab = findVscodeTab(node.path, node.tabInfo?.groupIndex);
                if (tab) {
                    vscode.window.tabGroups.close(tab);
                }
            }),

            vscode.commands.registerCommand('tabTree.closeFolderTabs', (node: ITreeNode) => {
                if (!node) return;
                const paths = collectFilePaths(node);
                const tabs = paths.map(findVscodeTab).filter((t): t is vscode.Tab => t !== undefined);
                if (tabs.length > 0) {
                    vscode.window.tabGroups.close(tabs);
                }
            }),

            vscode.commands.registerCommand('tabTree.closeAll', () => {
                const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
                if (allTabs.length > 0) {
                    vscode.window.tabGroups.close(allTabs);
                }
            }),

            vscode.commands.registerCommand('tabTree.collapseAll', () => {
                vscode.commands.executeCommand('workbench.actions.treeView.tabTree.collapseAll');
            }),

            vscode.commands.registerCommand('tabTree.expandAll', () => {
                treeDataProvider.expandAll(treeView);
            }),

            vscode.commands.registerCommand('tabTree.collapseFolder', (node: ITreeNode) => {
                treeDataProvider.collapseFolder(node);
            }),

            treeView.onDidExpandElement((e) => treeDataProvider.handleDidExpand(e.element)),

            vscode.commands.registerCommand('tabTree.enableFollowActiveFile', () => {
                vscode.workspace.getConfiguration('tabTree').update('followActiveFile', true, vscode.ConfigurationTarget.Global);
                vscode.commands.executeCommand('setContext', 'tabTree.followActiveFile', true);
            }),

            vscode.commands.registerCommand('tabTree.disableFollowActiveFile', () => {
                vscode.workspace.getConfiguration('tabTree').update('followActiveFile', false, vscode.ConfigurationTarget.Global);
                vscode.commands.executeCommand('setContext', 'tabTree.followActiveFile', false);
            }),

            vscode.commands.registerCommand('tabTree.enablePreview', () => {
                vscode.workspace.getConfiguration('workbench.editor').update('enablePreview', true, vscode.ConfigurationTarget.Global);
                vscode.commands.executeCommand('setContext', 'tabTree.previewEnabled', true);
            }),

            vscode.commands.registerCommand('tabTree.disablePreview', () => {
                vscode.workspace.getConfiguration('workbench.editor').update('enablePreview', false, vscode.ConfigurationTarget.Global);
                vscode.commands.executeCommand('setContext', 'tabTree.previewEnabled', false);
            }),

            vscode.commands.registerCommand('tabTree.openToSide', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(node.path), { viewColumn: vscode.ViewColumn.Beside });
            }),

            vscode.commands.registerCommand('tabTree.openWith', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.openMarkdownPreview', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.openMarkdownPreviewSide', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('markdown.showPreviewToSide', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.copyName', (node: ITreeNode) => {
                if (!node?.label) return;
                vscode.env.clipboard.writeText(node.label);
            }),

            vscode.commands.registerCommand('tabTree.copyPath', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.env.clipboard.writeText(node.path);
            }),

            vscode.commands.registerCommand('tabTree.copyRelativePath', (node: ITreeNode) => {
                if (!node?.path) return;
                const root = (vscode.workspace.workspaceFolders ?? [])
                    .map((f) => f.uri.fsPath)
                    .find((r) => node.path.startsWith(r + '/'));
                const relative = root
                    ? node.path.slice(root.length + 1)
                    : node.path;
                vscode.env.clipboard.writeText(relative);
            }),

            vscode.commands.registerCommand('tabTree.openTerminalHere', (node: ITreeNode) => {
                if (!node?.path) return;
                const dir = getDir(node);
                vscode.window.createTerminal({ cwd: dir }).show();
            }),

            vscode.commands.registerCommand('tabTree.move', async (node: ITreeNode) => {
                if (!node?.path) return;
                const uri = vscode.Uri.file(node.path);
                const dest = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    openLabel: 'Move here',
                    title: `Move "${node.label}" to...`,
                });
                if (!dest || dest.length === 0) return;
                const newUri = vscode.Uri.joinPath(dest[0], node.label);
                const edit = new vscode.WorkspaceEdit();
                edit.renameFile(uri, newUri);
                await vscode.workspace.applyEdit(edit);
            }),

            vscode.commands.registerCommand('tabTree.findInFolder', (node: ITreeNode) => {
                if (!node?.path) return;
                const dir = getDir(node);
                const root = (vscode.workspace.workspaceFolders ?? [])
                    .map((f) => f.uri.fsPath)
                    .find((r) => dir.startsWith(r + '/'));
                const relative = root ? dir.slice(root.length + 1) : dir;
                vscode.commands.executeCommand('workbench.action.findInFiles', {
                    filesToInclude: relative + '/**',
                    triggerSearch: false,
                });
            }),

            vscode.commands.registerCommand('tabTree.gitStage', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('git.stage', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.gitUnstage', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('git.unstage', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.gitDiscard', async (node: ITreeNode) => {
                if (!node?.path) return;
                const confirm = await vscode.window.showWarningMessage(
                    `Discard changes in "${node.label}"?`, { modal: true }, 'Discard',
                );
                if (confirm !== 'Discard') return;
                vscode.commands.executeCommand('git.clean', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.gitViewHistory', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('timeline.focus', { uri: vscode.Uri.file(node.path) });
            }),

            vscode.commands.registerCommand('tabTree.revealInOS', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.revealInExplorer', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.openInBrowser', (node: ITreeNode) => {
                if (!node?.path) return;
                vscode.env.openExternal(vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.selectForCompare', (node: ITreeNode) => {
                if (!node?.path) return;
                selectedForCompare = vscode.Uri.file(node.path);
                vscode.window.showInformationMessage(`Selected for compare: ${node.label}`);
            }),

            vscode.commands.registerCommand('tabTree.compareWithSelected', (node: ITreeNode) => {
                if (!node?.path || !selectedForCompare) {
                    vscode.window.showWarningMessage('Select a file for compare first');
                    return;
                }
                vscode.commands.executeCommand('vscode.diff', selectedForCompare, vscode.Uri.file(node.path));
            }),

            vscode.commands.registerCommand('tabTree.rename', async (node: ITreeNode) => {
                if (!node?.path) return;
                const uri = vscode.Uri.file(node.path);
                const oldName = node.label;
                const newName = await vscode.window.showInputBox({ prompt: 'New name', value: oldName });
                if (!newName || newName === oldName) return;
                const newUri = vscode.Uri.joinPath(vscode.Uri.file(node.path.slice(0, node.path.lastIndexOf('/'))), newName);
                const edit = new vscode.WorkspaceEdit();
                edit.renameFile(uri, newUri);
                await vscode.workspace.applyEdit(edit);
            }),

            vscode.commands.registerCommand('tabTree.delete', async (node: ITreeNode) => {
                if (!node?.path) return;
                const confirm = await vscode.window.showWarningMessage(
                    `Delete "${node.label}"?`, { modal: true }, 'Delete',
                );
                if (confirm !== 'Delete') return;
                const uri = vscode.Uri.file(node.path);
                await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
            }),

            vscode.commands.registerCommand('tabTree.newFile', async (node: ITreeNode) => {
                if (!node?.path) return;
                const dir = getDir(node);
                const name = await vscode.window.showInputBox({ prompt: 'File name' });
                if (!name) return;
                const uri = vscode.Uri.joinPath(vscode.Uri.file(dir), name);
                await vscode.workspace.fs.writeFile(uri, new Uint8Array());
                vscode.commands.executeCommand('vscode.open', uri);
            }),

            vscode.commands.registerCommand('tabTree.newFolder', async (node: ITreeNode) => {
                if (!node?.path) return;
                const dir = getDir(node);
                const name = await vscode.window.showInputBox({ prompt: 'Folder name' });
                if (!name) return;
                const uri = vscode.Uri.joinPath(vscode.Uri.file(dir), name);
                await vscode.workspace.fs.createDirectory(uri);
            }),

            vscode.commands.registerCommand('tabTree.openAllGitChanges', () => openGitChanges(false)),
            vscode.commands.registerCommand('tabTree.openStagedGitChanges', () => openGitChanges(true)),

            vscode.extensions.onDidChange(() => updateThirdPartyContextKeys()),
        );

        for (const cmd of THIRD_PARTY_COMMANDS) {
            context.subscriptions.push(
                vscode.commands.registerCommand(cmd.wrapperId, async (node: ITreeNode) => {
                    if (!node?.path) return;
                    const uri = vscode.Uri.file(node.path);
                    try {
                        await vscode.commands.executeCommand(cmd.commandId, uri);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        vscode.window.showWarningMessage(`${cmd.title} failed: ${message}`);
                    }
                }),
            );
        }

    } catch (err) {
        console.error('[Tab Tree] activation FAILED:', err);
    }
}

export function deactivate(): void {
    // cleanup handled by disposables
}
