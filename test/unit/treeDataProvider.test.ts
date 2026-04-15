import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { TabTreeDataProvider } from '../../src/treeDataProvider';
import { TabTracker } from '../../src/tabTracker';
import { ETreeNodeType, ITabInfo, ITreeNode } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileNode(path: string, groupIndex?: number): ITreeNode {
    return {
        type: ETreeNodeType.File,
        label: path.split('/').pop() ?? path,
        path,
        children: [],
        tabInfo: groupIndex !== undefined ? {
            filePath: path,
            scheme: 'file',
            label: path.split('/').pop() ?? path,
            groupIndex,
            tabIndex: 0,
            isDirty: false,
            isPreview: false,
            isPinned: false,
            isActive: false,
            tabType: 'text' as const,
        } : undefined,
    };
}

function folderNode(path: string, children: ITreeNode[] = []): ITreeNode {
    return {
        type: ETreeNodeType.Folder,
        label: path.split('/').pop() ?? path,
        path,
        children,
    };
}

function simpleNode(type: ETreeNodeType, label: string, path = '/some/path', children: ITreeNode[] = []): ITreeNode {
    return { type, label, path, children };
}

function makeProvider(): TabTreeDataProvider {
    const tracker = new TabTracker();
    return new TabTreeDataProvider(tracker);
}

// ---------------------------------------------------------------------------
// getTreeItem — file nodes
// ---------------------------------------------------------------------------

describe('getTreeItem — file nodes', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('file node command uses vscode.open', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);

        expect(item.command?.command).toBe('vscode.open');
    });

    it('groupIndex=2 is passed in command arguments as viewColumn: 2', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 2);

        const item = provider.getTreeItem(node);
        const args = item.command?.arguments ?? [];

        expect(args[1]).toEqual({ viewColumn: 2 });
    });

    it('groupIndex=1 is passed in command arguments as viewColumn: 1', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);
        const args = item.command?.arguments ?? [];

        expect(args[1]).toEqual({ viewColumn: 1 });
    });

    it('file node without tabInfo — viewColumn is undefined', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts');

        const item = provider.getTreeItem(node);
        const args = item.command?.arguments ?? [];

        expect((args[1] as { viewColumn?: number }).viewColumn).toBeUndefined();
    });

    it('resourceUri is set from file node path', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);

        expect(item.resourceUri?.fsPath).toBe('/project/src/index.ts');
    });

    it('file node contextValue is "file"', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);

        expect(item.contextValue).toBe('file');
    });

    it('file node collapsibleState is None', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    });
});

// ---------------------------------------------------------------------------
// getTreeItem — folder nodes
// ---------------------------------------------------------------------------

describe('getTreeItem — folder nodes', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('folder collapsibleState is Expanded', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('folder has no command (not opened on click)', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        const item = provider.getTreeItem(node);

        expect(item.command).toBeUndefined();
    });

    it('folder resourceUri is set from path', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        const item = provider.getTreeItem(node);

        expect(item.resourceUri?.fsPath).toBe('/project/src');
    });

    it('folder contextValue is "folder"', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        const item = provider.getTreeItem(node);

        expect(item.contextValue).toBe('folder');
    });
});

// ---------------------------------------------------------------------------
// getTreeItem — other node types
// ---------------------------------------------------------------------------

describe('getTreeItem — other node types', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('WorkspaceRoot — collapsibleState Expanded, contextValue "workspaceRoot"', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.WorkspaceRoot, 'project', '/project');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        expect(item.contextValue).toBe('workspaceRoot');
    });

    it('TabGroup — collapsibleState Expanded, contextValue "tabGroup"', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.TabGroup, 'Group 1', '/group');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        expect(item.contextValue).toBe('tabGroup');
    });

    it('ExternalRoot — collapsibleState Expanded, contextValue "externalRoot"', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.ExternalRoot, 'External', '/external');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
        expect(item.contextValue).toBe('externalRoot');
    });

    it('NonFileTab — collapsibleState None, contextValue "nonFileTab"', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.NonFileTab, 'Settings', '/settings');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        expect(item.contextValue).toBe('nonFileTab');
    });

    it('NonFileTab with tabInfo — command uses tabTree.focusTab with groupIndex and tabIndex', () => {
        const provider = makeProvider();
        const node: ITreeNode = {
            type: ETreeNodeType.NonFileTab,
            label: 'Welcome',
            path: 'Welcome',
            children: [],
            tabInfo: {
                filePath: 'Welcome',
                scheme: 'unknown',
                label: 'Welcome',
                groupIndex: 1,
                tabIndex: 3,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType: 'unknown',
            },
        };

        const item = provider.getTreeItem(node);

        expect(item.command?.command).toBe('tabTree.focusTab');
        expect(item.command?.arguments).toEqual([1, 3]);
    });

    it('7.4 NonFileTab — iconPath is a ThemeIcon', () => {
        const provider = makeProvider();
        const node: ITreeNode = {
            type: ETreeNodeType.NonFileTab,
            label: 'Settings',
            path: 'Settings',
            children: [],
            tabInfo: {
                filePath: 'Settings',
                scheme: 'webview',
                label: 'Settings',
                groupIndex: 1,
                tabIndex: 0,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType: 'webview',
            },
        };

        const item = provider.getTreeItem(node);

        expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
        expect((item.iconPath as vscode.ThemeIcon).id).toBe('settings-gear');
    });

    it('NonFileTab without tabInfo — no command', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.NonFileTab, 'Settings', '/settings');

        const item = provider.getTreeItem(node);

        expect(item.command).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getTreeItem — decorations
// ---------------------------------------------------------------------------

describe('getTreeItem — decorations', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('preview tab (isPreview=true) gets description "preview"', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);
        node.tabInfo!.isPreview = true;

        const item = provider.getTreeItem(node);

        expect(item.description).toBe('preview');
    });

    it('regular tab (isPreview=false) gets no description', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);

        const item = provider.getTreeItem(node);

        expect(item.description).toBeUndefined();
    });

    it('10.4 dirty tab (isDirty=true) gets bullet indicator', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);
        node.tabInfo!.isDirty = true;

        const item = provider.getTreeItem(node);

        expect(item.description).toBe('●');
    });

    it('10.6 pinned tab (isPinned=true) gets "pinned" indicator', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);
        node.tabInfo!.isPinned = true;

        const item = provider.getTreeItem(node);

        expect(item.description).toBe('pinned');
    });

    it('dirty + pinned + preview — all flags combined in description', () => {
        const provider = makeProvider();
        const node = fileNode('/project/src/index.ts', 1);
        node.tabInfo!.isDirty = true;
        node.tabInfo!.isPinned = true;
        node.tabInfo!.isPreview = true;

        const item = provider.getTreeItem(node);

        expect(item.description).toBe('● pinned preview');
    });
});

// ---------------------------------------------------------------------------
// collapseFolder / handleDidExpand — 4.6
// ---------------------------------------------------------------------------

describe('collapseFolder / handleDidExpand — 4.6', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('folder is Expanded by default', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('collapseFolder marks folder as Collapsed in subsequent getTreeItem', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        provider.collapseFolder(node);
        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('collapseFolder fires onDidChangeTreeData', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');
        let fired = false;
        provider.onDidChangeTreeData(() => {
            fired = true;
        });

        provider.collapseFolder(node);

        expect(fired).toBe(true);
    });

    it('collapseFolder on node without path is a no-op', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.TabGroup, 'Group 1', '');
        let fired = false;
        provider.onDidChangeTreeData(() => {
            fired = true;
        });

        provider.collapseFolder(node);

        expect(fired).toBe(false);
    });

    it('handleDidExpand clears collapsed state so folder renders Expanded again', () => {
        const provider = makeProvider();
        const node = folderNode('/project/src');

        provider.collapseFolder(node);
        provider.handleDidExpand(node);
        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('collapse applies independently per folder path', () => {
        const provider = makeProvider();
        const a = folderNode('/project/src');
        const b = folderNode('/project/test');

        provider.collapseFolder(a);

        expect(provider.getTreeItem(a).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(provider.getTreeItem(b).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('collapseFolder is recursive — descendant folders also marked Collapsed', () => {
        const provider = makeProvider();
        const deep = folderNode('/project/src/a/b');
        const mid = folderNode('/project/src/a', [deep]);
        const root = folderNode('/project/src', [mid]);

        provider.collapseFolder(root);

        expect(provider.getTreeItem(root).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(provider.getTreeItem(mid).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
        expect(provider.getTreeItem(deep).collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('workspaceRoot collapse — same mechanism works for workspaceRoot nodes', () => {
        const provider = makeProvider();
        const node = simpleNode(ETreeNodeType.WorkspaceRoot, 'project', '/project');

        provider.collapseFolder(node);
        const item = provider.getTreeItem(node);

        expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });
});

// ---------------------------------------------------------------------------
// getChildren / getParent
// ---------------------------------------------------------------------------

describe('getChildren', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('call without argument returns root tree nodes', () => {
        vscode.__test.setWorkspaceFolders(['/project']);
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [
                    {
                        input: new vscode.TabInputText(vscode.Uri.file('/project/src/index.ts')),
                        label: 'index.ts',
                        group: { viewColumn: 1 },
                        isDirty: false,
                        isPreview: false,
                        isPinned: false,
                        isActive: true,
                    },
                ],
            },
        ]);

        const provider = makeProvider();
        const roots = provider.getChildren();

        expect(roots.length).toBeGreaterThan(0);
    });

    it('call with element returns its children', () => {
        const provider = makeProvider();
        const child1 = fileNode('/project/src/a.ts', 1);
        const child2 = fileNode('/project/src/b.ts', 1);
        const parent = folderNode('/project/src', [child1, child2]);

        const children = provider.getChildren(parent);

        expect(children).toEqual([child1, child2]);
    });
});

describe('getParent', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('returns correct parent of a nested node', () => {
        vscode.__test.setWorkspaceFolders(['/project']);
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [
                    {
                        input: new vscode.TabInputText(vscode.Uri.file('/project/src/index.ts')),
                        label: 'index.ts',
                        group: { viewColumn: 1 },
                        isDirty: false,
                        isPreview: false,
                        isPinned: false,
                        isActive: true,
                    },
                ],
            },
        ]);

        const provider = makeProvider();
        const roots = provider.getChildren();

        // find file node via recursive traversal
        function findFile(nodes: ITreeNode[]): ITreeNode | undefined {
            for (const n of nodes) {
                if (n.type === ETreeNodeType.File) return n;
                const found = findFile(n.children);
                if (found) return found;
            }
            return undefined;
        }

        const fileTreeNode = findFile(roots);
        expect(fileTreeNode).toBeDefined();

        const parent = provider.getParent(fileTreeNode!);
        expect(parent).toBeDefined();
        expect(parent!.children).toContain(fileTreeNode);
    });
});

// ---------------------------------------------------------------------------
// findNodeByPath
// ---------------------------------------------------------------------------

describe('findNodeByPath', () => {
    beforeEach(() => {
        vscode.__test.reset();
    });

    it('finds file by exact path', () => {
        vscode.__test.setWorkspaceFolders(['/project']);
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [
                    {
                        input: new vscode.TabInputText(vscode.Uri.file('/project/src/index.ts')),
                        label: 'index.ts',
                        group: { viewColumn: 1 },
                        isDirty: false,
                        isPreview: false,
                        isPinned: false,
                        isActive: true,
                    },
                ],
            },
        ]);

        const provider = makeProvider();
        const found = provider.findNodeByPath('/project/src/index.ts');

        expect(found).toBeDefined();
        expect(found!.path).toBe('/project/src/index.ts');
    });

    it('returns undefined for non-existent path', () => {
        const provider = makeProvider();

        const found = provider.findNodeByPath('/does/not/exist.ts');

        expect(found).toBeUndefined();
    });

    it('finds deeply nested file', () => {
        vscode.__test.setWorkspaceFolders(['/project']);
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [
                    {
                        input: new vscode.TabInputText(vscode.Uri.file('/project/src/deep/nested/file.ts')),
                        label: 'file.ts',
                        group: { viewColumn: 1 },
                        isDirty: false,
                        isPreview: false,
                        isPinned: false,
                        isActive: true,
                    },
                ],
            },
        ]);

        const provider = makeProvider();
        const found = provider.findNodeByPath('/project/src/deep/nested/file.ts');

        expect(found).toBeDefined();
        expect(found!.type).toBe(ETreeNodeType.File);
        expect(found!.path).toBe('/project/src/deep/nested/file.ts');
    });
});
