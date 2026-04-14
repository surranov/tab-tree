/**
 * Pure tree-building logic. NO dependency on 'vscode' module.
 * Input: list of tab infos + workspace roots → Output: tree structure.
 * This module is the core of TDD — all corner cases tested here.
 */

import {
    ETreeNodeType,
    IBuildTreeInput,
    ITabInfo,
    ITreeNode,
} from './types';

export function buildTree(_input: IBuildTreeInput): ITreeNode[] {
    // Phase 1 — TDD
    return [];
}

export function sortChildren(children: ITreeNode[]): ITreeNode[] {
    return [...children].sort((a, b) => {
        if (a.type === ETreeNodeType.Folder && b.type !== ETreeNodeType.Folder) {
            return -1;
        }
        if (a.type !== ETreeNodeType.Folder && b.type === ETreeNodeType.Folder) {
            return 1;
        }
        return a.label.localeCompare(b.label);
    });
}

export function isFileTab(tab: ITabInfo): boolean {
    return tab.scheme === 'file' && tab.tabType === 'text';
}

export function getWorkspaceRoot(
    filePath: string,
    workspaceRoots: string[],
): string | undefined {
    return workspaceRoots.find((root) => filePath.startsWith(root + '/'));
}
