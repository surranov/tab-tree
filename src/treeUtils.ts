/**
 * Pure utility functions for tree operations.
 * NO dependency on 'vscode' module — keeps logic unit-testable.
 */

import { ETreeNodeType, ITreeNode } from './types';

export function getDir(node: ITreeNode): string {
    return node.type === ETreeNodeType.File
        ? node.path.slice(0, node.path.lastIndexOf('/'))
        : node.path;
}

export function getNonFileTabIconId(node: ITreeNode): string {
    const tabType = node.tabInfo?.tabType;
    if (tabType === 'notebook') return 'notebook';
    if (tabType === 'custom') return 'file-binary';
    if (tabType === 'diff') return 'diff';

    const label = node.label.toLowerCase();
    if (label === 'settings' || label.includes('settings')) return 'settings-gear';
    if (label.includes('keyboard shortcut')) return 'keyboard';
    if (label === 'welcome' || label.includes('get started')) return 'info';
    if (label === 'extensions') return 'extensions';
    if (label === 'search') return 'search';

    return 'browser';
}

export function getNodeId(node: ITreeNode): string {
    const group = node.tabInfo?.groupIndex ?? '';
    const key = node.path || node.label;
    // tabIndex is intentionally omitted for File nodes: VS Code guarantees a
    // single file opens at most once per tab group, so (type, path, group) is
    // a unique identity, and excluding tabIndex keeps treeItem.id stable when
    // surrounding tabs close or reorder — required for reveal() to survive
    // refreshes that touch the same group. For NonFileTab nodes tabIndex is
    // kept because multiple non-file tabs can share a label within a group.
    if (node.type === ETreeNodeType.NonFileTab) {
        const tab = node.tabInfo?.tabIndex ?? '';
        return `${node.type}:${key}:${group}:${tab}`;
    }
    return `${node.type}:${key}:${group}`;
}

export function collectFilePaths(node: ITreeNode): string[] {
    const paths: string[] = [];
    if (node.type === ETreeNodeType.File && node.path) {
        paths.push(node.path);
    }
    for (const child of node.children) {
        paths.push(...collectFilePaths(child));
    }
    return paths;
}
