import * as vscode from 'vscode';
import { TabTracker } from './tabTracker';
import { TabTreeDataProvider } from './treeDataProvider';

export function activate(context: vscode.ExtensionContext): void {
    const tabTracker = new TabTracker();
    const treeDataProvider = new TabTreeDataProvider(tabTracker);

    const treeView = vscode.window.createTreeView('tabTree', {
        treeDataProvider,
        showCollapseAll: false,
    });

    context.subscriptions.push(tabTracker, treeDataProvider, treeView);
}

export function deactivate(): void {
    // cleanup handled by disposables
}
