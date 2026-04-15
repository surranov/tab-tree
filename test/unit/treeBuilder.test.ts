import { describe, it, expect } from 'vitest';
import { buildTree, sortChildren } from '../../src/treeBuilder';
import { ETreeNodeType, IBuildTreeInput, ITabInfo, ITreeNode } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tab(filePath: string, overrides: Partial<ITabInfo> = {}): ITabInfo {
    return {
        filePath,
        scheme: 'file',
        label: filePath.split('/').pop() ?? filePath,
        groupIndex: 1,
        tabIndex: 0,
        isDirty: false,
        isPreview: false,
        isPinned: false,
        isActive: false,
        tabType: 'text',
        ...overrides,
    };
}

function input(tabs: ITabInfo[], workspaceRoots: string[] = ['/project'], tabGroupCount = 1): IBuildTreeInput {
    return { tabs, workspaceRoots, tabGroupCount };
}

function findNode(nodes: ITreeNode[], path: string[]): ITreeNode | undefined {
    let current = nodes;
    for (const label of path) {
        const found = current.find((n) => n.label === label);
        if (!found) return undefined;
        if (label === path[path.length - 1]) return found;
        current = found.children;
    }
    return undefined;
}

function allLabels(nodes: ITreeNode[]): string[] {
    return nodes.map((n) => n.label);
}

function makeNode(label: string, type: ETreeNodeType): ITreeNode {
    return { type, label, path: `/${label}`, children: [] };
}

// ---------------------------------------------------------------------------
// sortChildren (already implemented)
// ---------------------------------------------------------------------------

describe('sortChildren', () => {
    it('folders come before files', () => {
        const nodes = [
            makeNode('zebra.ts', ETreeNodeType.File),
            makeNode('alpha', ETreeNodeType.Folder),
        ];
        const sorted = sortChildren(nodes);
        expect(sorted[0].label).toBe('alpha');
        expect(sorted[1].label).toBe('zebra.ts');
    });

    it('alphabetical sorting within same type', () => {
        const nodes = [
            makeNode('charlie.ts', ETreeNodeType.File),
            makeNode('alpha.ts', ETreeNodeType.File),
            makeNode('bravo.ts', ETreeNodeType.File),
        ];
        const sorted = sortChildren(nodes);
        expect(sorted.map((n) => n.label)).toEqual(['alpha.ts', 'bravo.ts', 'charlie.ts']);
    });

    it('does not mutate original array', () => {
        const nodes = [
            makeNode('b.ts', ETreeNodeType.File),
            makeNode('a.ts', ETreeNodeType.File),
        ];
        sortChildren(nodes);
        expect(nodes[0].label).toBe('b.ts');
    });
});

// ---------------------------------------------------------------------------
// buildTree — basic scenarios
// ---------------------------------------------------------------------------

describe('buildTree — base scenarios', () => {
    it('empty tab list → empty tree', () => {
        const result = buildTree(input([]));
        expect(result).toEqual([]);
    });

    it('single file in workspace root', () => {
        const result = buildTree(input([
            tab('/project/file.ts'),
        ]));
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
        expect(result[0].label).toBe('project');
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children[0].type).toBe(ETreeNodeType.File);
        expect(result[0].children[0].label).toBe('file.ts');
    });

    it('file in nested folder — full folder path is created', () => {
        const result = buildTree(input([
            tab('/project/src/components/Button.tsx'),
        ]));
        const root = result[0];
        expect(root.children).toHaveLength(1);

        const src = root.children[0];
        expect(src.type).toBe(ETreeNodeType.Folder);
        expect(src.label).toBe('src');

        const components = src.children[0];
        expect(components.type).toBe(ETreeNodeType.Folder);
        expect(components.label).toBe('components');

        const file = components.children[0];
        expect(file.type).toBe(ETreeNodeType.File);
        expect(file.label).toBe('Button.tsx');
        expect(file.path).toBe('/project/src/components/Button.tsx');
    });

    it('multiple files — shared folders are not duplicated', () => {
        const result = buildTree(input([
            tab('/project/src/a.ts'),
            tab('/project/src/b.ts'),
        ]));
        const root = result[0];
        const src = root.children[0];
        expect(src.type).toBe(ETreeNodeType.Folder);
        expect(src.children).toHaveLength(2);
        expect(allLabels(src.children)).toContain('a.ts');
        expect(allLabels(src.children)).toContain('b.ts');
    });

    it('files from different subtrees — branches diverge correctly', () => {
        const result = buildTree(input([
            tab('/project/src/app.ts'),
            tab('/project/lib/utils.ts'),
        ]));
        const root = result[0];
        expect(root.children).toHaveLength(2);
        expect(allLabels(root.children)).toContain('src');
        expect(allLabels(root.children)).toContain('lib');
    });

    it('sorting: folders on top, alphabetical', () => {
        const result = buildTree(input([
            tab('/project/zebra.ts'),
            tab('/project/src/app.ts'),
            tab('/project/alpha.ts'),
        ]));
        const root = result[0];
        expect(root.children[0].type).toBe(ETreeNodeType.Folder);
        expect(root.children[0].label).toBe('src');
        expect(root.children[1].label).toBe('alpha.ts');
        expect(root.children[2].label).toBe('zebra.ts');
    });
});

// ---------------------------------------------------------------------------
// 13.1 File placement
// ---------------------------------------------------------------------------

describe('buildTree — 13.1 file placement', () => {
    it('13.1.1 file in workspace root — no intermediate folders', () => {
        const result = buildTree(input([tab('/project/README.md')]));
        const root = result[0];
        expect(root.children).toHaveLength(1);
        expect(root.children[0].type).toBe(ETreeNodeType.File);
        expect(root.children[0].label).toBe('README.md');
    });

    it('13.1.2 file outside workspace → External', () => {
        const result = buildTree(input([tab('/tmp/scratch.ts')]));
        const external = result.find((n) => n.type === ETreeNodeType.ExternalRoot);
        expect(external).toBeDefined();
        expect(external!.children).toHaveLength(1);
        expect(external!.children[0].label).toBe('scratch.ts');
    });

    it('13.1.2 file outside workspace — full path is preserved', () => {
        const result = buildTree(input([tab('/home/user/notes.txt')]));
        const external = result.find((n) => n.type === ETreeNodeType.ExternalRoot);
        expect(external).toBeDefined();
        expect(external!.children[0].path).toBe('/home/user/notes.txt');
    });

    it('13.1.3 files from different workspace roots', () => {
        const result = buildTree(input(
            [
                tab('/project-a/src/app.ts'),
                tab('/project-b/src/main.ts'),
            ],
            ['/project-a', '/project-b'],
        ));
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
        expect(result[1].type).toBe(ETreeNodeType.WorkspaceRoot);
        const labels = allLabels(result);
        expect(labels).toContain('project-a');
        expect(labels).toContain('project-b');
    });

    it('13.1.4 deep nesting', () => {
        const result = buildTree(input([
            tab('/project/a/b/c/d/e/f/deep.ts'),
        ]));
        let node = result[0]; // root
        const expectedLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'deep.ts'];
        for (const label of expectedLabels) {
            const child = node.children.find((c) => c.label === label);
            expect(child, `expected child "${label}" in "${node.label}"`).toBeDefined();
            node = child!;
        }
        expect(node.type).toBe(ETreeNodeType.File);
    });

    it('13.1.5 all files from one folder — single branch', () => {
        const result = buildTree(input([
            tab('/project/src/a.ts'),
            tab('/project/src/b.ts'),
            tab('/project/src/c.ts'),
        ]));
        const root = result[0];
        expect(root.children).toHaveLength(1); // only src
        const src = root.children[0];
        expect(src.children).toHaveLength(3);
    });
});

// ---------------------------------------------------------------------------
// 13.2 Naming
// ---------------------------------------------------------------------------

describe('buildTree — 13.2 naming', () => {
    it('13.2.1 same-named files in different folders', () => {
        const result = buildTree(input([
            tab('/project/src/components/index.ts'),
            tab('/project/src/utils/index.ts'),
        ]));
        const root = result[0];
        const src = root.children[0];
        expect(src.children).toHaveLength(2);
        const componentIndex = findNode(result, ['project', 'src', 'components', 'index.ts']);
        const utilsIndex = findNode(result, ['project', 'src', 'utils', 'index.ts']);
        expect(componentIndex).toBeDefined();
        expect(utilsIndex).toBeDefined();
        expect(componentIndex!.path).not.toBe(utilsIndex!.path);
    });

    it('13.2.3 dots in folder names (.github, .vscode)', () => {
        const result = buildTree(input([
            tab('/project/.github/workflows/ci.yml'),
            tab('/project/.vscode/settings.json'),
        ]));
        const root = result[0];
        const labels = allLabels(root.children);
        expect(labels).toContain('.github');
        expect(labels).toContain('.vscode');
    });

    it('13.2.5 unicode in names', () => {
        const result = buildTree(input([
            tab('/project/компоненты/Кнопка.tsx'),
        ]));
        const root = result[0];
        const folder = root.children[0];
        expect(folder.label).toBe('компоненты');
        expect(folder.children[0].label).toBe('Кнопка.tsx');
    });

    it('13.2.2 same-named files + same-named parent folders — separated at divergence point', () => {
        const result = buildTree(input([
            tab('/project/src/components/Button/index.ts'),
            tab('/project/src/containers/Button/index.ts'),
        ]));
        const componentsButton = findNode(result, ['project', 'src', 'components', 'Button', 'index.ts']);
        const containersButton = findNode(result, ['project', 'src', 'containers', 'Button', 'index.ts']);
        expect(componentsButton).toBeDefined();
        expect(containersButton).toBeDefined();
        expect(componentsButton!.path).toBe('/project/src/components/Button/index.ts');
        expect(containersButton!.path).toBe('/project/src/containers/Button/index.ts');
        const src = findNode(result, ['project', 'src']);
        expect(src!.children).toHaveLength(2);
    });

    it('13.2.4 files without extension — Makefile, Dockerfile, LICENSE', () => {
        const result = buildTree(input([
            tab('/project/Makefile'),
            tab('/project/Dockerfile'),
            tab('/project/LICENSE'),
        ]));
        const makefile = findNode(result, ['project', 'Makefile']);
        const dockerfile = findNode(result, ['project', 'Dockerfile']);
        const license = findNode(result, ['project', 'LICENSE']);
        expect(makefile).toBeDefined();
        expect(dockerfile).toBeDefined();
        expect(license).toBeDefined();
        expect(makefile!.type).toBe(ETreeNodeType.File);
        expect(makefile!.label).toBe('Makefile');
    });
});

// ---------------------------------------------------------------------------
// 13.3 URI schemes
// ---------------------------------------------------------------------------

describe('buildTree — 13.3 URI schemes', () => {
    it('13.3.1 file:// — regular file in tree', () => {
        const result = buildTree(input([tab('/project/app.ts', { scheme: 'file' })]));
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
    });

    it('13.3.2 untitled: — in non-file section', () => {
        const result = buildTree(input([
            tab('Untitled-1', { scheme: 'untitled', tabType: 'text', label: 'Untitled-1' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('Untitled-1');
    });

    it('13.3.4 git:/ — in non-file section', () => {
        const result = buildTree(input([
            tab('/project/old.ts', { scheme: 'git', tabType: 'text', label: 'old.ts (HEAD)' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('old.ts (HEAD)');
    });

    it('13.3.3 vscode-remote:// — treated as file', () => {
        const result = buildTree(input(
            [tab('/project/remote.ts', { scheme: 'vscode-remote' })],
            ['/project'],
        ));
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
        expect(findNode(result, ['project', 'remote.ts'])).toBeDefined();
    });

    it('webview tabs — in non-file section', () => {
        const result = buildTree(input([
            tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('Settings');
    });

    it('non-file tabs are displayed before file tree', () => {
        const result = buildTree(input([
            tab('/project/app.ts'),
            tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings' }),
        ]));
        const nonFileIndex = result.findIndex((n) => n.type === ETreeNodeType.NonFileTab);
        const rootIndex = result.findIndex((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(nonFileIndex).toBeLessThan(rootIndex);
    });
});

// ---------------------------------------------------------------------------
// 13.5 Edge cases
// ---------------------------------------------------------------------------

describe('buildTree — 13.5 boundary states', () => {
    it('13.5.1 zero files', () => {
        expect(buildTree(input([]))).toEqual([]);
    });

    it('13.5.2 single file', () => {
        const result = buildTree(input([tab('/project/only.ts')]));
        expect(result).toHaveLength(1);
        expect(findNode(result, ['project', 'only.ts'])).toBeDefined();
    });

    it('13.5.3 100 files — no crash, correct structure', () => {
        const tabs = Array.from({ length: 100 }, (_, i) =>
            tab(`/project/src/file${i}.ts`),
        );
        const result = buildTree(input(tabs));
        const src = findNode(result, ['project', 'src']);
        expect(src).toBeDefined();
        expect(src!.children).toHaveLength(100);
    });

    it('13.5.5 one file in multiple tab groups — duplicated in each section', () => {
        const result = buildTree(input(
            [
                tab('/project/shared.ts', { groupIndex: 1 }),
                tab('/project/shared.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe(ETreeNodeType.TabGroup);
        expect(result[1].type).toBe(ETreeNodeType.TabGroup);
        expect(findNode(result[0].children, ['project', 'shared.ts'])).toBeDefined();
        expect(findNode(result[1].children, ['project', 'shared.ts'])).toBeDefined();
    });

    it('workspace root without files — not displayed', () => {
        const result = buildTree(input(
            [tab('/project-a/app.ts')],
            ['/project-a', '/project-b'],
        ));
        const roots = result.filter((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(roots).toHaveLength(1);
        expect(roots[0].label).toBe('project-a');
    });
});

// ---------------------------------------------------------------------------
// 13.6 Tab groups
// ---------------------------------------------------------------------------

describe('buildTree — 13.6 tab groups', () => {
    it('13.6.1 single tab group — no Group wrapper', () => {
        const result = buildTree(input(
            [tab('/project/app.ts', { groupIndex: 1 })],
            ['/project'],
            1,
        ));
        expect(result[0].type).not.toBe(ETreeNodeType.TabGroup);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
    });

    it('13.6.2 two tab groups — Group 1, Group 2 sections', () => {
        const result = buildTree(input(
            [
                tab('/project/a.ts', { groupIndex: 1 }),
                tab('/project/b.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe(ETreeNodeType.TabGroup);
        expect(result[0].label).toBe('Group 1');
        expect(result[1].type).toBe(ETreeNodeType.TabGroup);
        expect(result[1].label).toBe('Group 2');
    });

    it('tab group contains its own subtree', () => {
        const result = buildTree(input(
            [
                tab('/project/src/a.ts', { groupIndex: 1 }),
                tab('/project/lib/b.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        const group1Root = findNode(result[0].children, ['project', 'src', 'a.ts']);
        const group2Root = findNode(result[1].children, ['project', 'lib', 'b.ts']);
        expect(group1Root).toBeDefined();
        expect(group2Root).toBeDefined();
    });

    it('13.6.3 empty tab group — not displayed', () => {
        const result = buildTree(input(
            [tab('/project/a.ts', { groupIndex: 1 })],
            ['/project'],
            3,
        ));
        const groups = result.filter((n) => n.type === ETreeNodeType.TabGroup);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Group 1');
    });

    it('13.6.3 closing all tabs in one group — sibling group remains', () => {
        const before = buildTree(input(
            [
                tab('/project/a.ts', { groupIndex: 1 }),
                tab('/project/b.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        expect(before.filter((n) => n.type === ETreeNodeType.TabGroup)).toHaveLength(2);

        const after = buildTree(input(
            [tab('/project/b.ts', { groupIndex: 2 })],
            ['/project'],
            2,
        ));
        const groups = after.filter((n) => n.type === ETreeNodeType.TabGroup);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Group 2');
    });

    it('13.6.4 tab moved from one group to another — both sections update', () => {
        const before = buildTree(input(
            [
                tab('/project/moving.ts', { groupIndex: 1 }),
                tab('/project/stay.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        expect(findNode(before[0].children, ['project', 'moving.ts'])).toBeDefined();
        expect(findNode(before[1].children, ['project', 'stay.ts'])).toBeDefined();

        const after = buildTree(input(
            [
                tab('/project/moving.ts', { groupIndex: 2 }),
                tab('/project/stay.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));
        const groups = after.filter((n) => n.type === ETreeNodeType.TabGroup);
        expect(groups).toHaveLength(1);
        expect(findNode(groups[0].children, ['project', 'moving.ts'])).toBeDefined();
        expect(findNode(groups[0].children, ['project', 'stay.ts'])).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// buildTree — spaces and special characters in paths
// ---------------------------------------------------------------------------

describe('buildTree — spaces and special characters in paths', () => {
    it('13.2.6 spaces in folder name — folder is created with space in label', () => {
        const result = buildTree(input([
            tab('/project/my folder/my file.ts'),
        ]));
        const folder = findNode(result, ['project', 'my folder']);
        expect(folder).toBeDefined();
        expect(folder!.type).toBe(ETreeNodeType.Folder);
        expect(folder!.label).toBe('my folder');
    });

    it('13.2.6 spaces in file name — file is created with space in label', () => {
        const result = buildTree(input([
            tab('/project/my folder/my file.ts'),
        ]));
        const file = findNode(result, ['project', 'my folder', 'my file.ts']);
        expect(file).toBeDefined();
        expect(file!.type).toBe(ETreeNodeType.File);
        expect(file!.label).toBe('my file.ts');
        expect(file!.path).toBe('/project/my folder/my file.ts');
    });

    it('13.2.6 square brackets in names (Next.js [id]) — folder is created correctly', () => {
        const result = buildTree(input([
            tab('/project/src/[id]/page.tsx'),
        ]));
        const bracketFolder = findNode(result, ['project', 'src', '[id]']);
        expect(bracketFolder).toBeDefined();
        expect(bracketFolder!.type).toBe(ETreeNodeType.Folder);
        expect(bracketFolder!.label).toBe('[id]');
    });

    it('13.2.6 file in folder with brackets — full path is preserved', () => {
        const result = buildTree(input([
            tab('/project/src/[id]/page.tsx'),
        ]));
        const file = findNode(result, ['project', 'src', '[id]', 'page.tsx']);
        expect(file).toBeDefined();
        expect(file!.path).toBe('/project/src/[id]/page.tsx');
    });
});

// ---------------------------------------------------------------------------
// buildTree — 13.3.5 vscode-vfs scheme
// ---------------------------------------------------------------------------

describe('buildTree — 13.3.5 vscode-vfs scheme', () => {
    it('vscode-vfs scheme is treated as file — placed in workspace tree', () => {
        const result = buildTree(input(
            [tab('/project/vfs-file.ts', { scheme: 'vscode-vfs' })],
            ['/project'],
        ));
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
        expect(findNode(result, ['project', 'vfs-file.ts'])).toBeDefined();
    });

    it('vscode-vfs scheme — NOT placed in non-file section', () => {
        const result = buildTree(input(
            [tab('/project/vfs-file.ts', { scheme: 'vscode-vfs' })],
            ['/project'],
        ));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// buildTree — 13.3.6 unknown scheme
// ---------------------------------------------------------------------------

describe('buildTree — 13.3.6 unknown scheme', () => {
    it('unknown scheme custom-unknown → placed in non-file section', () => {
        const result = buildTree(input([
            tab('/project/something', { scheme: 'custom-unknown', label: 'Custom Tab' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('Custom Tab');
    });

    it('unknown scheme custom-unknown — NOT placed in file tree', () => {
        const result = buildTree(input([
            tab('/project/something', { scheme: 'custom-unknown', label: 'Custom Tab' }),
        ]));
        const workspaceRoot = result.find((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(workspaceRoot).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// buildTree — 13.5 closing last file
// ---------------------------------------------------------------------------

describe('buildTree — 13.5 closing last file', () => {
    it('13.5.6 closing last file in folder — folder disappears', () => {
        const withFile = buildTree(input([
            tab('/project/src/only.ts'),
        ]));
        const srcWith = findNode(withFile, ['project', 'src']);
        expect(srcWith).toBeDefined();

        const withoutFile = buildTree(input([]));
        expect(withoutFile).toEqual([]);
    });

    it('13.5.6 closing last file in folder — other folders remain untouched', () => {
        const before = buildTree(input([
            tab('/project/src/a.ts'),
            tab('/project/lib/b.ts'),
        ]));
        const srcBefore = findNode(before, ['project', 'src']);
        const libBefore = findNode(before, ['project', 'lib']);
        expect(srcBefore).toBeDefined();
        expect(libBefore).toBeDefined();

        const after = buildTree(input([
            tab('/project/lib/b.ts'),
        ]));
        const srcAfter = findNode(after, ['project', 'src']);
        const libAfter = findNode(after, ['project', 'lib']);
        expect(srcAfter).toBeUndefined();
        expect(libAfter).toBeDefined();
    });

    it('13.5.7 closing last file in workspace root — root disappears', () => {
        const withFile = buildTree(input([
            tab('/project/app.ts'),
        ]));
        const rootWith = withFile.find((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(rootWith).toBeDefined();

        const withoutFile = buildTree(input([]));
        const rootWithout = withoutFile.find((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(rootWithout).toBeUndefined();
    });

    it('13.5.7 closing last file in one of several roots — only that root disappears', () => {
        const before = buildTree(input(
            [
                tab('/project-a/app.ts'),
                tab('/project-b/main.ts'),
            ],
            ['/project-a', '/project-b'],
        ));
        expect(before.filter((n) => n.type === ETreeNodeType.WorkspaceRoot)).toHaveLength(2);

        const after = buildTree(input(
            [tab('/project-b/main.ts')],
            ['/project-a', '/project-b'],
        ));
        const roots = after.filter((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(roots).toHaveLength(1);
        expect(roots[0].label).toBe('project-b');
    });

    it('13.5.8 closing all files in one subtree — sibling branch preserved', () => {
        const before = buildTree(input([
            tab('/project/src/components/Button.tsx'),
            tab('/project/src/components/Input.tsx'),
            tab('/project/src/utils/helpers.ts'),
        ]));
        expect(findNode(before, ['project', 'src', 'components'])).toBeDefined();
        expect(findNode(before, ['project', 'src', 'utils'])).toBeDefined();

        const after = buildTree(input([
            tab('/project/src/utils/helpers.ts'),
        ]));
        expect(findNode(after, ['project', 'src', 'components'])).toBeUndefined();
        const utils = findNode(after, ['project', 'src', 'utils']);
        expect(utils).toBeDefined();
        expect(utils!.children).toHaveLength(1);
        expect(utils!.children[0].label).toBe('helpers.ts');
    });
});

// ---------------------------------------------------------------------------
// buildTree — 13.4 dynamic changes
// ---------------------------------------------------------------------------

describe('buildTree — 13.4 dynamic changes', () => {
    it('13.4.4 workspace folder added — new root appears in tree', () => {
        const before = buildTree(input(
            [tab('/project-a/app.ts')],
            ['/project-a'],
        ));
        expect(before.filter((n) => n.type === ETreeNodeType.WorkspaceRoot)).toHaveLength(1);

        const after = buildTree(input(
            [
                tab('/project-a/app.ts'),
                tab('/project-b/main.ts'),
            ],
            ['/project-a', '/project-b'],
        ));
        const roots = after.filter((n) => n.type === ETreeNodeType.WorkspaceRoot);
        expect(roots).toHaveLength(2);
        expect(roots.map((r) => r.label)).toEqual(['project-a', 'project-b']);
    });

    it('13.4.4 workspace folder removed — file becomes external', () => {
        const before = buildTree(input(
            [tab('/project-b/main.ts')],
            ['/project-a', '/project-b'],
        ));
        expect(before.filter((n) => n.type === ETreeNodeType.WorkspaceRoot)).toHaveLength(1);

        const after = buildTree(input(
            [tab('/project-b/main.ts')],
            ['/project-a'],
        ));
        const workspaceRoots = after.filter((n) => n.type === ETreeNodeType.WorkspaceRoot);
        const externals = after.filter((n) => n.type === ETreeNodeType.ExternalRoot);
        expect(workspaceRoots).toHaveLength(0);
        expect(externals).toHaveLength(1);
        expect(findNode(externals, ['main.ts']) ?? externals[0].children[0]).toBeDefined();
    });

    it('13.4.2 file renamed externally — buildTree reflects new URI', () => {
        const before = buildTree(input([
            tab('/project/src/old-name.ts'),
        ]));
        expect(findNode(before, ['project', 'src', 'old-name.ts'])).toBeDefined();

        const after = buildTree(input([
            tab('/project/src/new-name.ts'),
        ]));
        expect(findNode(after, ['project', 'src', 'old-name.ts'])).toBeUndefined();
        expect(findNode(after, ['project', 'src', 'new-name.ts'])).toBeDefined();
    });

    it('13.4.3 folder renamed externally — all tabs reflect new parent path', () => {
        const before = buildTree(input([
            tab('/project/old-folder/a.ts'),
            tab('/project/old-folder/b.ts'),
        ]));
        expect(findNode(before, ['project', 'old-folder'])).toBeDefined();

        const after = buildTree(input([
            tab('/project/new-folder/a.ts'),
            tab('/project/new-folder/b.ts'),
        ]));
        expect(findNode(after, ['project', 'old-folder'])).toBeUndefined();
        const newFolder = findNode(after, ['project', 'new-folder']);
        expect(newFolder).toBeDefined();
        expect(newFolder!.children).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// buildTree — tabInfo on file nodes
// ---------------------------------------------------------------------------

describe('buildTree — tabInfo on file nodes', () => {
    it('every File node has tabInfo', () => {
        const result = buildTree(input([
            tab('/project/src/a.ts'),
            tab('/project/src/b.ts'),
            tab('/project/lib/c.ts'),
        ]));
        const collectFileNodes = (nodes: ITreeNode[]): ITreeNode[] => {
            const files: ITreeNode[] = [];
            for (const node of nodes) {
                if (node.type === ETreeNodeType.File) {
                    files.push(node);
                }
                files.push(...collectFileNodes(node.children));
            }
            return files;
        };
        const fileNodes = collectFileNodes(result);
        expect(fileNodes.length).toBeGreaterThan(0);
        for (const node of fileNodes) {
            expect(node.tabInfo, `tabInfo missing on node "${node.path}"`).toBeDefined();
        }
    });

    it('tabInfo.filePath matches node.path', () => {
        const result = buildTree(input([
            tab('/project/src/deep/file.ts'),
        ]));
        const file = findNode(result, ['project', 'src', 'deep', 'file.ts']);
        expect(file).toBeDefined();
        expect(file!.tabInfo!.filePath).toBe(file!.path);
    });

    it('tabInfo.isDirty is preserved from input data', () => {
        const result = buildTree(input([
            tab('/project/src/dirty.ts', { isDirty: true }),
        ]));
        const file = findNode(result, ['project', 'src', 'dirty.ts']);
        expect(file).toBeDefined();
        expect(file!.tabInfo!.isDirty).toBe(true);
    });

    it('tabInfo.isPreview is preserved from input data', () => {
        const result = buildTree(input([
            tab('/project/src/preview.ts', { isPreview: true }),
        ]));
        const file = findNode(result, ['project', 'src', 'preview.ts']);
        expect(file).toBeDefined();
        expect(file!.tabInfo!.isPreview).toBe(true);
    });

    it('tabInfo.isPinned is preserved from input data', () => {
        const result = buildTree(input([
            tab('/project/src/pinned.ts', { isPinned: true }),
        ]));
        const file = findNode(result, ['project', 'src', 'pinned.ts']);
        expect(file).toBeDefined();
        expect(file!.tabInfo!.isPinned).toBe(true);
    });

    it('tabInfo.isActive is preserved from input data', () => {
        const result = buildTree(input([
            tab('/project/src/active.ts', { isActive: true }),
        ]));
        const file = findNode(result, ['project', 'src', 'active.ts']);
        expect(file).toBeDefined();
        expect(file!.tabInfo!.isActive).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Diff editors (D-010)
// ---------------------------------------------------------------------------

describe('buildTree — diff editors', () => {
    it('diff tab with file:// scheme goes into file tree', () => {
        const result = buildTree(input([
            tab('/project/modified.ts', { tabType: 'diff', scheme: 'file' }),
        ]));
        expect(findNode(result, ['project', 'modified.ts'])).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Mixed scenarios
// ---------------------------------------------------------------------------

describe('buildTree — mixed scenarios', () => {
    it('files + non-file + external — all in correct order', () => {
        const result = buildTree(input([
            tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings' }),
            tab('/project/src/app.ts'),
            tab('/tmp/scratch.ts'),
        ]));

        const types = result.map((n) => n.type);
        const nonFileIdx = types.indexOf(ETreeNodeType.NonFileTab);
        const rootIdx = types.indexOf(ETreeNodeType.WorkspaceRoot);
        const extIdx = types.indexOf(ETreeNodeType.ExternalRoot);

        expect(nonFileIdx).toBeLessThan(rootIdx);
        expect(rootIdx).toBeLessThan(extIdx);
    });

    it('multi-root + external + non-file — full picture', () => {
        const result = buildTree(input(
            [
                tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings' }),
                tab('/frontend/src/App.tsx'),
                tab('/backend/src/main.rs'),
                tab('/tmp/notes.txt'),
            ],
            ['/frontend', '/backend'],
        ));

        const nonFiles = result.filter((n) => n.type === ETreeNodeType.NonFileTab);
        const roots = result.filter((n) => n.type === ETreeNodeType.WorkspaceRoot);
        const externals = result.filter((n) => n.type === ETreeNodeType.ExternalRoot);

        expect(nonFiles).toHaveLength(1);
        expect(roots).toHaveLength(2);
        expect(externals).toHaveLength(1);
    });

    it('tab groups + non-file — non-file tabs inside each group', () => {
        const result = buildTree(input(
            [
                tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings', groupIndex: 1 }),
                tab('/project/app.ts', { groupIndex: 1 }),
                tab('/project/lib.ts', { groupIndex: 2 }),
            ],
            ['/project'],
            2,
        ));

        expect(result).toHaveLength(2);
        const group1 = result[0];
        const nonFileInGroup = group1.children.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFileInGroup).toBeDefined();
        expect(nonFileInGroup!.label).toBe('Settings');
    });
});
