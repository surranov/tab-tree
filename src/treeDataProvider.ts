/**
 * VS Code TreeDataProvider implementation.
 * Bridges pure tree logic (treeBuilder) with VS Code TreeView API.
 */

import * as vscode from 'vscode';
import { ETreeNodeType, ITreeNode } from './types';
import { buildTree } from './treeBuilder';
import { TabTracker } from './tabTracker';

export class TabTreeDataProvider implements vscode.TreeDataProvider<ITreeNode>, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private tree: ITreeNode[] = [];

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ITreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly tabTracker: TabTracker) {
        this.disposables.push(
            tabTracker.onDidChange(() => this.refresh()),
            this._onDidChangeTreeData,
        );

        this.refresh();
    }

    private refresh(): void {
        const tabs = this.tabTracker.getTabs();
        const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(
            (f) => f.uri.fsPath,
        );
        const tabGroupCount = this.tabTracker.getTabGroupCount();

        this.tree = buildTree({ tabs, workspaceRoots, tabGroupCount });
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ITreeNode): vscode.TreeItem {
        const isCollapsible =
            element.type === ETreeNodeType.Folder ||
            element.type === ETreeNodeType.WorkspaceRoot ||
            element.type === ETreeNodeType.TabGroup ||
            element.type === ETreeNodeType.ExternalRoot;

        const treeItem = new vscode.TreeItem(
            element.label,
            isCollapsible
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
        );

        if (element.type === ETreeNodeType.File && element.path) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(element.path)],
            };
            treeItem.contextValue = 'file';
        } else if (element.type === ETreeNodeType.Folder) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.contextValue = 'folder';
        } else if (element.type === ETreeNodeType.NonFileTab) {
            treeItem.contextValue = 'nonFileTab';
        } else if (element.type === ETreeNodeType.WorkspaceRoot) {
            treeItem.resourceUri = vscode.Uri.file(element.path);
            treeItem.contextValue = 'workspaceRoot';
        } else if (element.type === ETreeNodeType.TabGroup) {
            treeItem.contextValue = 'tabGroup';
        } else if (element.type === ETreeNodeType.ExternalRoot) {
            treeItem.contextValue = 'externalRoot';
        }

        if (element.tabInfo?.isPreview) {
            treeItem.description = '(preview)';
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

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
