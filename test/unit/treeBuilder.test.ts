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
// sortChildren (уже реализовано)
// ---------------------------------------------------------------------------

describe('sortChildren', () => {
    it('папки идут перед файлами', () => {
        const nodes = [
            makeNode('zebra.ts', ETreeNodeType.File),
            makeNode('alpha', ETreeNodeType.Folder),
        ];
        const sorted = sortChildren(nodes);
        expect(sorted[0].label).toBe('alpha');
        expect(sorted[1].label).toBe('zebra.ts');
    });

    it('алфавитная сортировка внутри одного типа', () => {
        const nodes = [
            makeNode('charlie.ts', ETreeNodeType.File),
            makeNode('alpha.ts', ETreeNodeType.File),
            makeNode('bravo.ts', ETreeNodeType.File),
        ];
        const sorted = sortChildren(nodes);
        expect(sorted.map((n) => n.label)).toEqual(['alpha.ts', 'bravo.ts', 'charlie.ts']);
    });

    it('не мутирует исходный массив', () => {
        const nodes = [
            makeNode('b.ts', ETreeNodeType.File),
            makeNode('a.ts', ETreeNodeType.File),
        ];
        sortChildren(nodes);
        expect(nodes[0].label).toBe('b.ts');
    });
});

// ---------------------------------------------------------------------------
// buildTree — базовые сценарии
// ---------------------------------------------------------------------------

describe('buildTree — базовые сценарии', () => {
    it('пустой список табов → пустое дерево', () => {
        const result = buildTree(input([]));
        expect(result).toEqual([]);
    });

    it('один файл в корне workspace', () => {
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

    it('файл во вложенной папке — полный путь папок создаётся', () => {
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

    it('несколько файлов — общие папки не дублируются', () => {
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

    it('файлы из разных поддеревьев — ветки расходятся корректно', () => {
        const result = buildTree(input([
            tab('/project/src/app.ts'),
            tab('/project/lib/utils.ts'),
        ]));
        const root = result[0];
        expect(root.children).toHaveLength(2);
        expect(allLabels(root.children)).toContain('src');
        expect(allLabels(root.children)).toContain('lib');
    });

    it('сортировка: папки сверху, алфавитно', () => {
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
// 11.1 Расположение файлов
// ---------------------------------------------------------------------------

describe('buildTree — 11.1 расположение файлов', () => {
    it('11.1.1 файл в корне workspace — без промежуточных папок', () => {
        const result = buildTree(input([tab('/project/README.md')]));
        const root = result[0];
        expect(root.children).toHaveLength(1);
        expect(root.children[0].type).toBe(ETreeNodeType.File);
        expect(root.children[0].label).toBe('README.md');
    });

    it('11.1.2 файл за пределами workspace → External', () => {
        const result = buildTree(input([tab('/tmp/scratch.ts')]));
        const external = result.find((n) => n.type === ETreeNodeType.ExternalRoot);
        expect(external).toBeDefined();
        expect(external!.children).toHaveLength(1);
        expect(external!.children[0].label).toBe('scratch.ts');
    });

    it('11.1.2 файл за пределами workspace — полный путь сохраняется', () => {
        const result = buildTree(input([tab('/home/user/notes.txt')]));
        const external = result.find((n) => n.type === ETreeNodeType.ExternalRoot);
        expect(external).toBeDefined();
        expect(external!.children[0].path).toBe('/home/user/notes.txt');
    });

    it('11.1.3 файлы из разных workspace roots', () => {
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

    it('11.1.4 глубокая вложенность', () => {
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

    it('11.1.5 все файлы из одной папки — одна ветка', () => {
        const result = buildTree(input([
            tab('/project/src/a.ts'),
            tab('/project/src/b.ts'),
            tab('/project/src/c.ts'),
        ]));
        const root = result[0];
        expect(root.children).toHaveLength(1); // только src
        const src = root.children[0];
        expect(src.children).toHaveLength(3);
    });
});

// ---------------------------------------------------------------------------
// 11.2 Именование
// ---------------------------------------------------------------------------

describe('buildTree — 11.2 именование', () => {
    it('11.2.1 одноимённые файлы в разных папках', () => {
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

    it('11.2.3 точки в именах папок (.github, .vscode)', () => {
        const result = buildTree(input([
            tab('/project/.github/workflows/ci.yml'),
            tab('/project/.vscode/settings.json'),
        ]));
        const root = result[0];
        const labels = allLabels(root.children);
        expect(labels).toContain('.github');
        expect(labels).toContain('.vscode');
    });

    it('11.2.5 unicode в именах', () => {
        const result = buildTree(input([
            tab('/project/компоненты/Кнопка.tsx'),
        ]));
        const root = result[0];
        const folder = root.children[0];
        expect(folder.label).toBe('компоненты');
        expect(folder.children[0].label).toBe('Кнопка.tsx');
    });
});

// ---------------------------------------------------------------------------
// 11.3 URI schemes
// ---------------------------------------------------------------------------

describe('buildTree — 11.3 URI schemes', () => {
    it('11.3.1 file:// — обычный файл в дереве', () => {
        const result = buildTree(input([tab('/project/app.ts', { scheme: 'file' })]));
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
    });

    it('11.3.2 untitled: — в нефайловой секции', () => {
        const result = buildTree(input([
            tab('Untitled-1', { scheme: 'untitled', tabType: 'text', label: 'Untitled-1' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('Untitled-1');
    });

    it('11.3.4 git:/ — в нефайловой секции', () => {
        const result = buildTree(input([
            tab('/project/old.ts', { scheme: 'git', tabType: 'text', label: 'old.ts (HEAD)' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('old.ts (HEAD)');
    });

    it('11.3.3 vscode-remote:// — обрабатывается как file', () => {
        const result = buildTree(input(
            [tab('/project/remote.ts', { scheme: 'vscode-remote' })],
            ['/project'],
        ));
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
        expect(findNode(result, ['project', 'remote.ts'])).toBeDefined();
    });

    it('webview табы — в нефайловой секции', () => {
        const result = buildTree(input([
            tab('Settings', { scheme: 'webview', tabType: 'webview', label: 'Settings' }),
        ]));
        const nonFile = result.find((n) => n.type === ETreeNodeType.NonFileTab);
        expect(nonFile).toBeDefined();
        expect(nonFile!.label).toBe('Settings');
    });

    it('нефайловые табы отображаются перед файловым деревом', () => {
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
// 11.5 Граничные состояния
// ---------------------------------------------------------------------------

describe('buildTree — 11.5 граничные состояния', () => {
    it('11.5.1 ноль файлов', () => {
        expect(buildTree(input([]))).toEqual([]);
    });

    it('11.5.2 один файл', () => {
        const result = buildTree(input([tab('/project/only.ts')]));
        expect(result).toHaveLength(1);
        expect(findNode(result, ['project', 'only.ts'])).toBeDefined();
    });

    it('11.5.3 100 файлов — не падает, структура корректна', () => {
        const tabs = Array.from({ length: 100 }, (_, i) =>
            tab(`/project/src/file${i}.ts`),
        );
        const result = buildTree(input(tabs));
        const src = findNode(result, ['project', 'src']);
        expect(src).toBeDefined();
        expect(src!.children).toHaveLength(100);
    });

    it('11.5.5 один файл в нескольких tab groups — дублируется в каждой секции', () => {
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

    it('workspace root без файлов — не отображается', () => {
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
// 11.6 Tab groups
// ---------------------------------------------------------------------------

describe('buildTree — 11.6 tab groups', () => {
    it('11.6.1 один tab group — нет обёртки Group', () => {
        const result = buildTree(input(
            [tab('/project/app.ts', { groupIndex: 1 })],
            ['/project'],
            1,
        ));
        expect(result[0].type).not.toBe(ETreeNodeType.TabGroup);
        expect(result[0].type).toBe(ETreeNodeType.WorkspaceRoot);
    });

    it('11.6.2 два tab groups — секции Group 1, Group 2', () => {
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

    it('tab group содержит своё поддерево', () => {
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

    it('11.6.4 пустой tab group — не отображается', () => {
        const result = buildTree(input(
            [tab('/project/a.ts', { groupIndex: 1 })],
            ['/project'],
            3,
        ));
        const groups = result.filter((n) => n.type === ETreeNodeType.TabGroup);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('Group 1');
    });
});

// ---------------------------------------------------------------------------
// Diff editors (D-010)
// ---------------------------------------------------------------------------

describe('buildTree — diff editors', () => {
    it('diff tab с file:// scheme попадает в файловое дерево', () => {
        const result = buildTree(input([
            tab('/project/modified.ts', { tabType: 'diff', scheme: 'file' }),
        ]));
        expect(findNode(result, ['project', 'modified.ts'])).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Смешанные сценарии
// ---------------------------------------------------------------------------

describe('buildTree — смешанные сценарии', () => {
    it('файлы + нефайловые + external — всё в правильном порядке', () => {
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

    it('multi-root + external + нефайловые — полная картина', () => {
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

    it('tab groups + нефайловые — нефайловые внутри каждой группы', () => {
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
