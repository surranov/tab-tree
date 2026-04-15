/**
 * Pure tree-building logic. NO dependency on 'vscode' module.
 * Input: list of tab infos + workspace roots → Output: tree structure.
 */

import {
    ETreeNodeType,
    IBuildTreeInput,
    ITabInfo,
    ITreeNode,
} from './types';

const FILE_SCHEMES = new Set(['file', 'vscode-remote', 'vscode-vfs']);

function isFileScheme(tab: ITabInfo): boolean {
    return FILE_SCHEMES.has(tab.scheme);
}

function buildGroupTree(tabs: ITabInfo[], workspaceRoots: string[]): ITreeNode[] {
    const result: ITreeNode[] = [];

    const nonFileTabs = tabs.filter((t) => !isFileScheme(t));
    const fileTabs = tabs.filter((t) => isFileScheme(t));

    for (const t of nonFileTabs) {
        result.push({
            type: ETreeNodeType.NonFileTab,
            label: t.label,
            path: t.filePath,
            children: [],
            tabInfo: t,
        });
    }

    const sortedRoots = [...workspaceRoots].sort((a, b) => a.localeCompare(b));

    for (const root of sortedRoots) {
        const rootTabs = fileTabs.filter((t) => t.filePath.startsWith(root + '/') || t.filePath === root);
        if (rootTabs.length === 0) continue;

        const rootLabel = root.split('/').pop() ?? root;
        const rootNode: ITreeNode = {
            type: ETreeNodeType.WorkspaceRoot,
            label: rootLabel,
            path: root,
            children: [],
        };

        for (const t of rootTabs) {
            const relativePath = t.filePath.slice(root.length + 1);
            insertIntoTree(rootNode, relativePath, t);
        }

        sortTreeRecursive(rootNode);
        result.push(rootNode);
    }

    const externalTabs = fileTabs.filter((t) => {
        return !workspaceRoots.some((root) => t.filePath.startsWith(root + '/') || t.filePath === root);
    });

    if (externalTabs.length > 0) {
        const externalNode: ITreeNode = {
            type: ETreeNodeType.ExternalRoot,
            label: 'External Files',
            path: '',
            children: [],
        };

        for (const t of externalTabs) {
            externalNode.children.push({
                type: ETreeNodeType.File,
                label: t.filePath.split('/').pop() ?? t.filePath,
                path: t.filePath,
                children: [],
                tabInfo: t,
            });
        }

        sortTreeRecursive(externalNode);
        result.push(externalNode);
    }

    return result;
}

function insertIntoTree(parent: ITreeNode, relativePath: string, tab: ITabInfo): void {
    const parts = relativePath.split('/');

    let current = parent;
    for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        let existing = current.children.find(
            (c) => c.type === ETreeNodeType.Folder && c.label === folderName,
        );
        if (!existing) {
            const folderPath = current.path + '/' + folderName;
            existing = {
                type: ETreeNodeType.Folder,
                label: folderName,
                path: folderPath,
                children: [],
            };
            current.children.push(existing);
        }
        current = existing;
    }

    const fileName = parts[parts.length - 1];
    current.children.push({
        type: ETreeNodeType.File,
        label: fileName,
        path: tab.filePath,
        children: [],
        tabInfo: tab,
    });
}

function sortTreeRecursive(node: ITreeNode): void {
    node.children = sortChildren(node.children);
    for (const child of node.children) {
        if (child.children.length > 0) {
            sortTreeRecursive(child);
        }
    }
}

function stampGroupIndex(nodes: ITreeNode[], groupIndex: number): void {
    for (const node of nodes) {
        node.groupIndex = groupIndex;
        if (node.children.length > 0) {
            stampGroupIndex(node.children, groupIndex);
        }
    }
}

export function buildTree(input: IBuildTreeInput): ITreeNode[] {
    const { tabs, workspaceRoots, tabGroupCount } = input;

    if (tabs.length === 0) {
        return [];
    }

    if (tabGroupCount >= 2) {
        const groupIndices = new Set(tabs.map((t) => t.groupIndex));
        const result: ITreeNode[] = [];

        const sortedIndices = [...groupIndices].sort((a, b) => a - b);

        for (const groupIndex of sortedIndices) {
            const groupTabs = tabs.filter((t) => t.groupIndex === groupIndex);
            if (groupTabs.length === 0) continue;

            const children = buildGroupTree(groupTabs, workspaceRoots);
            stampGroupIndex(children, groupIndex);

            const groupNode: ITreeNode = {
                type: ETreeNodeType.TabGroup,
                label: `Group ${groupIndex}`,
                path: '',
                children,
                groupIndex,
            };
            result.push(groupNode);
        }

        return result;
    }

    return buildGroupTree(tabs, workspaceRoots);
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
