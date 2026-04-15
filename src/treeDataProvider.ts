/**
 * VS Code TreeDataProvider implementation.
 * Bridges pure tree logic (treeBuilder) with VS Code TreeView API.
 */

import * as vscode from 'vscode';
import { ETreeNodeType, ITreeNode } from './types';
import { buildTree } from './treeBuilder';
import { TabTracker } from './tabTracker';
import { getNodeId, getNonFileTabIconId } from './treeUtils';

export class TabTreeDataProvider implements vscode.TreeDataProvider<ITreeNode>, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private tree: ITreeNode[] = [];
    private readonly collapsedPaths = new Set<string>();

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ITreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly tabTracker: TabTracker) {
        this.disposables.push(
            tabTracker.onDidChange(() => this.refresh()),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('tabTree')) {
                    this.refresh();
                }
            }),
            this._onDidChangeTreeData,
        );

        this.refresh();
    }

    private refresh(): void {
        try {
            const tabs = this.tabTracker.getTabs();
            const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(
                (f) => f.uri.fsPath,
            );
            const tabGroupCount = this.tabTracker.getTabGroupCount();

            this.tree = buildTree({ tabs, workspaceRoots, tabGroupCount });
            this._onDidChangeTreeData.fire();
        } catch (err) {
            console.error('[Tab Tree] refresh FAILED:', err);
        }
    }

    getTreeItem(element: ITreeNode): vscode.TreeItem {
        const isCollapsible =
            element.type === ETreeNodeType.Folder ||
            element.type === ETreeNodeType.WorkspaceRoot ||
            element.type === ETreeNodeType.TabGroup ||
            element.type === ETreeNodeType.ExternalRoot;

        const collapsedState = isCollapsible
            ? (element.path && this.collapsedPaths.has(element.path)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.Expanded)
            : vscode.TreeItemCollapsibleState.None;

        const treeItem = new vscode.TreeItem(element.label, collapsedState);
        treeItem.id = getNodeId(element);

        if (element.type === ETreeNodeType.File && element.path) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [
                    vscode.Uri.file(element.path),
                    { viewColumn: element.tabInfo?.groupIndex },
                ],
            };
            treeItem.contextValue = 'file';
        } else if (element.type === ETreeNodeType.Folder) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.contextValue = 'folder';
        } else if (element.type === ETreeNodeType.NonFileTab) {
            treeItem.contextValue = 'nonFileTab';
            treeItem.iconPath = new vscode.ThemeIcon(getNonFileTabIconId(element));
            if (element.tabInfo) {
                treeItem.command = {
                    command: 'tabTree.focusTab',
                    title: 'Focus Tab',
                    arguments: [element.tabInfo.groupIndex, element.tabInfo.tabIndex],
                };
            }
        } else if (element.type === ETreeNodeType.WorkspaceRoot) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.contextValue = 'workspaceRoot';
        } else if (element.type === ETreeNodeType.TabGroup) {
            treeItem.contextValue = 'tabGroup';
        } else if (element.type === ETreeNodeType.ExternalRoot) {
            treeItem.contextValue = 'externalRoot';
        }

        const descriptionParts: string[] = [];
        if (element.tabInfo?.isDirty) descriptionParts.push('●');
        if (element.tabInfo?.isPinned) descriptionParts.push('pinned');
        if (element.tabInfo?.isPreview) descriptionParts.push('preview');
        if (descriptionParts.length > 0) {
            treeItem.description = descriptionParts.join(' ');
        }

        return treeItem;
    }

    getChildren(element?: ITreeNode): ITreeNode[] {
        if (!element) {
            return this.tree;
        }
        return element.children;
    }

    getParent(element: ITreeNode): ITreeNode | undefined {
        return this.findParent(this.tree, element);
    }

    private findParent(nodes: ITreeNode[], target: ITreeNode): ITreeNode | undefined {
        for (const node of nodes) {
            if (node.children.includes(target)) {
                return node;
            }
            const found = this.findParent(node.children, target);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    findNodeByPath(filePath: string): ITreeNode | undefined {
        return this.findNodeRecursive(this.tree, filePath);
    }

    private findNodeRecursive(nodes: ITreeNode[], filePath: string): ITreeNode | undefined {
        for (const node of nodes) {
            if (node.type === ETreeNodeType.File && node.path === filePath) {
                return node;
            }
            const found = this.findNodeRecursive(node.children, filePath);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    collapseFolder(node: ITreeNode): void {
        if (!node?.path) return;
        this.markCollapsedRecursive(node);
        this._onDidChangeTreeData.fire();
    }

    private markCollapsedRecursive(node: ITreeNode): void {
        const isCollapsible =
            node.type === ETreeNodeType.Folder ||
            node.type === ETreeNodeType.WorkspaceRoot;
        if (isCollapsible && node.path) {
            this.collapsedPaths.add(node.path);
        }
        for (const child of node.children) {
            this.markCollapsedRecursive(child);
        }
    }

    handleDidExpand(element: ITreeNode): void {
        if (element?.path && this.collapsedPaths.has(element.path)) {
            this.collapsedPaths.delete(element.path);
        }
    }

    expandAll(treeView: vscode.TreeView<ITreeNode>): void {
        const reveal = (nodes: ITreeNode[]): void => {
            for (const node of nodes) {
                if (node.children.length > 0) {
                    Promise.resolve(
                        treeView.reveal(node, { expand: true, select: false, focus: false }),
                    ).catch(() => { /* swallow race-induced rejection */ });
                    reveal(node.children);
                }
            }
        };
        reveal(this.tree);
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}

export class TabTreeDragAndDropController implements vscode.TreeDragAndDropController<ITreeNode>, vscode.Disposable {
    readonly dragMimeTypes = ['text/uri-list', 'text/plain'];
    readonly dropMimeTypes = ['text/uri-list'];

    private dragSources = new Map<string, number>();

    handleDrag(source: readonly ITreeNode[], dataTransfer: vscode.DataTransfer): void {
        const filePaths: string[] = [];
        for (const node of source) {
            this.collectPaths(node, filePaths);
        }

        if (filePaths.length === 0) return;

        this.dragSources.clear();
        for (const node of source) {
            this.collectDragSources(node);
        }

        const uriList = filePaths.map((p) => vscode.Uri.file(p).toString()).join('\r\n');
        dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uriList));

        const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
        const relativePaths = filePaths.map((p) => {
            const root = workspaceRoots.find((r) => p.startsWith(r + '/'));
            return root ? p.slice(root.length + 1) : p;
        });
        dataTransfer.set('text/plain', new vscode.DataTransferItem(relativePaths.join('\n')));
    }

    async handleDrop(target: ITreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const uriList = dataTransfer.get('text/uri-list');
        if (!uriList) return;

        const value = await uriList.asString();
        const uris = value.split(/\r?\n/).filter(Boolean).map((u) => vscode.Uri.parse(u));

        const targetGroupIndex =
            this.resolveTargetGroupIndex(target) ??
            vscode.window.tabGroups.activeTabGroup.viewColumn;

        const sourceByPath = new Map(this.dragSources);
        this.dragSources.clear();

        for (const uri of uris) {
            if (uri.scheme !== 'file') continue;

            await vscode.commands.executeCommand('vscode.open', uri, {
                preview: false,
                viewColumn: targetGroupIndex,
            });

            const sourceGroupIndex = sourceByPath.get(uri.fsPath);
            if (sourceGroupIndex === undefined) continue;
            if (sourceGroupIndex === targetGroupIndex) continue;

            const sourceGroup = vscode.window.tabGroups.all.find(
                (g) => g.viewColumn === sourceGroupIndex,
            );
            const sourceTab = sourceGroup?.tabs.find(
                (t) => getTabFilePath(t) === uri.fsPath,
            );
            if (sourceTab) {
                await vscode.window.tabGroups.close(sourceTab);
            }
        }
    }

    private collectDragSources(node: ITreeNode): void {
        if (node.type === ETreeNodeType.File && node.path && node.tabInfo) {
            this.dragSources.set(node.path, node.tabInfo.groupIndex);
        }
        for (const child of node.children) {
            this.collectDragSources(child);
        }
    }

    private resolveTargetGroupIndex(target: ITreeNode | undefined): number | undefined {
        if (!target) return undefined;
        if (target.tabInfo) return target.tabInfo.groupIndex;

        for (const child of target.children) {
            const groupIndex = this.resolveTargetGroupIndex(child);
            if (groupIndex !== undefined) return groupIndex;
        }
        return undefined;
    }

    private collectPaths(node: ITreeNode, paths: string[]): void {
        if (node.type === ETreeNodeType.File && node.path) {
            paths.push(node.path);
        }
        for (const child of node.children) {
            this.collectPaths(child, paths);
        }
    }

    dispose(): void {
        this.dragSources.clear();
    }
}

function getTabFilePath(tab: vscode.Tab): string | undefined {
    const input = tab.input;
    if (input instanceof vscode.TabInputText) return input.uri.fsPath;
    if (input instanceof vscode.TabInputCustom) return input.uri.fsPath;
    if (input instanceof vscode.TabInputNotebook) return input.uri.fsPath;
    if (input instanceof vscode.TabInputTextDiff) return input.modified.fsPath;
    return undefined;
}
