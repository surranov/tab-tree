import { describe, it, expect } from 'vitest';
import { getDir, collectFilePaths, getNodeId, getNonFileTabIconId } from '../../src/treeUtils';
import { ETreeNodeType, ITreeNode } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
    type: ETreeNodeType,
    path: string,
    children: ITreeNode[] = [],
): ITreeNode {
    return { type, label: path.split('/').pop() ?? path, path, children };
}

function file(path: string, children: ITreeNode[] = []): ITreeNode {
    return makeNode(ETreeNodeType.File, path, children);
}

function folder(path: string, children: ITreeNode[] = []): ITreeNode {
    return makeNode(ETreeNodeType.Folder, path, children);
}

function workspaceRoot(path: string, children: ITreeNode[] = []): ITreeNode {
    return makeNode(ETreeNodeType.WorkspaceRoot, path, children);
}

function nonFileTab(path: string, children: ITreeNode[] = []): ITreeNode {
    return makeNode(ETreeNodeType.NonFileTab, path, children);
}

// ---------------------------------------------------------------------------
// getDir
// ---------------------------------------------------------------------------

describe('getDir', () => {
    it('file node → returns parent directory', () => {
        const node = file('/project/src/app.ts');
        expect(getDir(node)).toBe('/project/src');
    });

    it('Folder node → returns its own path', () => {
        const node = folder('/project/src');
        expect(getDir(node)).toBe('/project/src');
    });

    it('file in workspace root → returns workspace root', () => {
        const node = file('/project/file.ts');
        expect(getDir(node)).toBe('/project');
    });

    it('deeply nested file → correct parent path', () => {
        const node = file('/project/a/b/c/d/deep.ts');
        expect(getDir(node)).toBe('/project/a/b/c/d');
    });

    it('WorkspaceRoot node → returns its own path', () => {
        const node = workspaceRoot('/project');
        expect(getDir(node)).toBe('/project');
    });

    it('file without slashes in path → slice(0, lastIndexOf("/")) with -1 gives slice(0, -1)', () => {
        // lastIndexOf('/') === -1, so slice(0, -1) trims the last character.
        // This is documented behavior of the current implementation — not an empty string.
        const node = file('file.ts');
        expect(getDir(node)).toBe('file.t');
    });
});

// ---------------------------------------------------------------------------
// collectFilePaths
// ---------------------------------------------------------------------------

describe('collectFilePaths', () => {
    it('single file node → array with its path', () => {
        const node = file('/project/app.ts');
        expect(collectFilePaths(node)).toEqual(['/project/app.ts']);
    });

    it('folder with multiple file children → all paths', () => {
        const node = folder('/project/src', [
            file('/project/src/a.ts'),
            file('/project/src/b.ts'),
            file('/project/src/c.ts'),
        ]);
        expect(collectFilePaths(node)).toEqual([
            '/project/src/a.ts',
            '/project/src/b.ts',
            '/project/src/c.ts',
        ]);
    });

    it('nested folders with files at different levels → recursive collection', () => {
        const node = folder('/project', [
            file('/project/root.ts'),
            folder('/project/src', [
                file('/project/src/app.ts'),
                folder('/project/src/utils', [
                    file('/project/src/utils/helper.ts'),
                ]),
            ]),
        ]);
        expect(collectFilePaths(node)).toEqual([
            '/project/root.ts',
            '/project/src/app.ts',
            '/project/src/utils/helper.ts',
        ]);
    });

    it('empty folder (no children) → empty array', () => {
        const node = folder('/project/empty');
        expect(collectFilePaths(node)).toEqual([]);
    });

    it('Folder node itself → not included in result', () => {
        const node = folder('/project/src', [file('/project/src/a.ts')]);
        const result = collectFilePaths(node);
        expect(result).not.toContain('/project/src');
        expect(result).toEqual(['/project/src/a.ts']);
    });

    it('mixed types (Folder + File + NonFileTab) → only File paths', () => {
        const node = folder('/project', [
            file('/project/app.ts'),
            nonFileTab('Settings'),
            folder('/project/lib', [
                file('/project/lib/util.ts'),
                nonFileTab('Terminal'),
            ]),
        ]);
        expect(collectFilePaths(node)).toEqual([
            '/project/app.ts',
            '/project/lib/util.ts',
        ]);
    });

    it('deeply nested tree → all file paths from all levels', () => {
        const node = workspaceRoot('/project', [
            folder('/project/a', [
                folder('/project/a/b', [
                    folder('/project/a/b/c', [
                        file('/project/a/b/c/deep.ts'),
                    ]),
                ]),
            ]),
            file('/project/shallow.ts'),
        ]);
        expect(collectFilePaths(node)).toEqual([
            '/project/a/b/c/deep.ts',
            '/project/shallow.ts',
        ]);
    });

    it('file with empty path → not included in result', () => {
        // node.path === '' is falsy — the `node.path` check fails
        const node: ITreeNode = {
            type: ETreeNodeType.File,
            label: 'ghost.ts',
            path: '',
            children: [],
        };
        expect(collectFilePaths(node)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// getNodeId — 2.13 stable identity
// ---------------------------------------------------------------------------

describe('getNodeId — 2.13', () => {
    it('file in group 1 → stable composite id', () => {
        const node: ITreeNode = {
            type: ETreeNodeType.File,
            label: 'a.ts',
            path: '/project/src/a.ts',
            children: [],
            tabInfo: {
                filePath: '/project/src/a.ts',
                scheme: 'file',
                label: 'a.ts',
                groupIndex: 1,
                tabIndex: 0,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType: 'text',
            },
        };
        expect(getNodeId(node)).toBe('file:/project/src/a.ts:1');
    });

    it('file id is stable when tabIndex changes (other tabs close) — R-15', () => {
        const base: Omit<ITreeNode, 'tabInfo'> = {
            type: ETreeNodeType.File,
            label: 'a.ts',
            path: '/project/src/a.ts',
            children: [],
        };
        const beforeClose: ITreeNode = {
            ...base,
            tabInfo: {
                filePath: '/project/src/a.ts',
                scheme: 'file',
                label: 'a.ts',
                groupIndex: 1,
                tabIndex: 3,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType: 'text',
            },
        };
        const afterClose: ITreeNode = {
            ...base,
            tabInfo: { ...beforeClose.tabInfo!, tabIndex: 1 },
        };
        expect(getNodeId(beforeClose)).toBe(getNodeId(afterClose));
    });

    it('same file in different tab groups → different ids', () => {
        const base: Omit<ITreeNode, 'tabInfo'> = {
            type: ETreeNodeType.File,
            label: 'a.ts',
            path: '/project/src/a.ts',
            children: [],
        };
        const inGroup1: ITreeNode = {
            ...base,
            tabInfo: {
                filePath: '/project/src/a.ts',
                scheme: 'file',
                label: 'a.ts',
                groupIndex: 1,
                tabIndex: 0,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType: 'text',
            },
        };
        const inGroup2: ITreeNode = {
            ...base,
            tabInfo: { ...inGroup1.tabInfo!, groupIndex: 2, tabIndex: 3 },
        };

        expect(getNodeId(inGroup1)).not.toBe(getNodeId(inGroup2));
    });

    it('folder id is path-based, no tab fields', () => {
        const node = folder('/project/src');
        expect(getNodeId(node)).toBe('folder:/project/src:');
    });

    it('workspaceRoot id distinct from folder with same path', () => {
        const ws = workspaceRoot('/project');
        const f = folder('/project');
        expect(getNodeId(ws)).not.toBe(getNodeId(f));
    });

    it('tabGroup with empty path uses label as key', () => {
        const node: ITreeNode = {
            type: ETreeNodeType.TabGroup,
            label: 'Group 1',
            path: '',
            children: [],
        };
        expect(getNodeId(node)).toBe('tabGroup:Group 1:');
    });

    it('two tabGroups with different labels → different ids', () => {
        const g1: ITreeNode = { type: ETreeNodeType.TabGroup, label: 'Group 1', path: '', children: [] };
        const g2: ITreeNode = { type: ETreeNodeType.TabGroup, label: 'Group 2', path: '', children: [] };
        expect(getNodeId(g1)).not.toBe(getNodeId(g2));
    });

    it('id is stable across multiple calls on the same node', () => {
        const node = file('/project/src/app.ts');
        expect(getNodeId(node)).toBe(getNodeId(node));
    });

    it('split-view: same workspaceRoot path in two groups → different ids via node.groupIndex', () => {
        // Regression: without node.groupIndex, both WorkspaceRoot nodes produce
        // the same id and VS Code's TreeView aliases them, rendering Group 2's
        // children under Group 1 as well.
        const ws1: ITreeNode = { ...workspaceRoot('/project'), groupIndex: 1 };
        const ws2: ITreeNode = { ...workspaceRoot('/project'), groupIndex: 2 };
        expect(getNodeId(ws1)).not.toBe(getNodeId(ws2));
    });

    it('split-view: same folder path in two groups → different ids via node.groupIndex', () => {
        const f1: ITreeNode = { ...folder('/project/src'), groupIndex: 1 };
        const f2: ITreeNode = { ...folder('/project/src'), groupIndex: 2 };
        expect(getNodeId(f1)).not.toBe(getNodeId(f2));
    });
});

// ---------------------------------------------------------------------------
// getNonFileTabIconId — 7.4
// ---------------------------------------------------------------------------

describe('getNonFileTabIconId — 7.4', () => {
    function nft(label: string, tabType: 'webview' | 'notebook' | 'custom' | 'diff' | 'unknown' = 'unknown'): ITreeNode {
        return {
            type: ETreeNodeType.NonFileTab,
            label,
            path: label,
            children: [],
            tabInfo: {
                filePath: label,
                scheme: 'unknown',
                label,
                groupIndex: 1,
                tabIndex: 0,
                isDirty: false,
                isPreview: false,
                isPinned: false,
                isActive: false,
                tabType,
            },
        };
    }

    it('Settings tab → settings-gear', () => {
        expect(getNonFileTabIconId(nft('Settings', 'webview'))).toBe('settings-gear');
    });

    it('Keyboard Shortcuts tab → keyboard', () => {
        expect(getNonFileTabIconId(nft('Keyboard Shortcuts', 'webview'))).toBe('keyboard');
    });

    it('Welcome tab → info', () => {
        expect(getNonFileTabIconId(nft('Welcome', 'webview'))).toBe('info');
    });

    it('Get Started tab → info', () => {
        expect(getNonFileTabIconId(nft('Get Started', 'webview'))).toBe('info');
    });

    it('Extensions tab → extensions', () => {
        expect(getNonFileTabIconId(nft('Extensions', 'webview'))).toBe('extensions');
    });

    it('notebook tabType → notebook icon', () => {
        expect(getNonFileTabIconId(nft('Untitled.ipynb', 'notebook'))).toBe('notebook');
    });

    it('custom tabType → file-binary', () => {
        expect(getNonFileTabIconId(nft('image.png', 'custom'))).toBe('file-binary');
    });

    it('diff tabType → diff icon', () => {
        expect(getNonFileTabIconId(nft('file.ts ↔ file.ts', 'diff'))).toBe('diff');
    });

    it('unknown webview → browser fallback', () => {
        expect(getNonFileTabIconId(nft('Some Extension UI', 'webview'))).toBe('browser');
    });

    it('completely unknown tab → browser fallback', () => {
        expect(getNonFileTabIconId(nft('Something Else'))).toBe('browser');
    });
});
