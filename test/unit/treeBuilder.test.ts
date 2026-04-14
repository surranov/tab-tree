import { describe, it, expect } from 'vitest';
import { sortChildren } from '../../src/treeBuilder';
import { ETreeNodeType, ITreeNode } from '../../src/types';

function makeNode(label: string, type: ETreeNodeType): ITreeNode {
    return { type, label, path: `/${label}`, children: [] };
}

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

        expect(sorted.map((n) => n.label)).toEqual([
            'alpha.ts',
            'bravo.ts',
            'charlie.ts',
        ]);
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
