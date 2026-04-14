/**
 * Wraps VS Code TabGroups API. Tracks open tabs, fires debounced updates.
 */

import * as vscode from 'vscode';
import { ITabInfo, TTabType } from './types';

const DEBOUNCE_MS = 80;

export class TabTracker implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;

    constructor() {
        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(() => this.scheduleUpdate()),
            vscode.window.tabGroups.onDidChangeTabGroups(() => this.scheduleUpdate()),
            this._onDidChange,
        );
    }

    private scheduleUpdate(): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this._onDidChange.fire();
        }, DEBOUNCE_MS);
    }

    getTabs(): ITabInfo[] {
        const tabs: ITabInfo[] = [];

        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const info = this.extractTabInfo(tab, group);
                if (info) {
                    tabs.push(info);
                }
            }
        }

        return tabs;
    }

    getTabGroupCount(): number {
        return vscode.window.tabGroups.all.length;
    }

    getActiveTabPath(): string | undefined {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        if (!activeTab) {
            return undefined;
        }
        return this.extractFilePath(activeTab);
    }

    private extractTabInfo(tab: vscode.Tab, group: vscode.TabGroup): ITabInfo | undefined {
        const tabType = this.getTabType(tab);

        if (tabType === 'terminal') {
            return undefined;
        }

        const filePath = this.extractFilePath(tab);
        const scheme = this.extractScheme(tab);

        return {
            filePath: filePath ?? tab.label,
            scheme: scheme ?? 'unknown',
            label: tab.label,
            groupIndex: group.viewColumn,
            isDirty: tab.isDirty,
            isPreview: tab.isPreview,
            isPinned: tab.isPinned,
            isActive: tab.isActive,
            tabType,
        };
    }

    private extractFilePath(tab: vscode.Tab): string | undefined {
        const input = tab.input;

        if (input instanceof vscode.TabInputText) {
            return input.uri.fsPath;
        }
        if (input instanceof vscode.TabInputCustom) {
            return input.uri.fsPath;
        }
        if (input instanceof vscode.TabInputNotebook) {
            return input.uri.fsPath;
        }
        if (input instanceof vscode.TabInputTextDiff) {
            return input.modified.fsPath;
        }
        if (input instanceof vscode.TabInputNotebookDiff) {
            return input.modified.fsPath;
        }

        return undefined;
    }

    private extractScheme(tab: vscode.Tab): string | undefined {
        const input = tab.input;

        if (input instanceof vscode.TabInputText) {
            return input.uri.scheme;
        }
        if (input instanceof vscode.TabInputCustom) {
            return input.uri.scheme;
        }
        if (input instanceof vscode.TabInputNotebook) {
            return input.uri.scheme;
        }
        if (input instanceof vscode.TabInputTextDiff) {
            return input.modified.scheme;
        }
        if (input instanceof vscode.TabInputNotebookDiff) {
            return input.modified.scheme;
        }
        if (input instanceof vscode.TabInputWebview) {
            return 'webview';
        }
        if (input instanceof vscode.TabInputTerminal) {
            return 'terminal';
        }

        return undefined;
    }

    private getTabType(tab: vscode.Tab): TTabType {
        const input = tab.input;

        if (input instanceof vscode.TabInputText) return 'text';
        if (input instanceof vscode.TabInputTextDiff) return 'diff';
        if (input instanceof vscode.TabInputNotebook) return 'notebook';
        if (input instanceof vscode.TabInputNotebookDiff) return 'notebook';
        if (input instanceof vscode.TabInputCustom) return 'custom';
        if (input instanceof vscode.TabInputWebview) return 'webview';
        if (input instanceof vscode.TabInputTerminal) return 'terminal';

        return 'unknown';
    }

    dispose(): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
