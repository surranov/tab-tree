import * as vscode from 'vscode';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FIXTURES_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'workspace');

export const EXTENSION_ID = 'surranov.tab-tree';

// ---------------------------------------------------------------------------
// Wait for condition with polling
// ---------------------------------------------------------------------------

export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs = 10000,
    intervalMs = 200,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await condition();
        if (ok) return;
        await sleep(intervalMs);
    }
    throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

export function fixtureUri(...parts: string[]): vscode.Uri {
    return vscode.Uri.file(path.join(FIXTURES_PATH, ...parts));
}

export async function openFile(...parts: string[]): Promise<vscode.TextEditor> {
    const uri = fixtureUri(...parts);
    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(doc, { preview: false });
}

export async function openFileInGroup(viewColumn: vscode.ViewColumn, ...parts: string[]): Promise<vscode.TextEditor> {
    const uri = fixtureUri(...parts);
    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(doc, { viewColumn, preview: false });
}

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

export function getAllTabs(): vscode.Tab[] {
    return vscode.window.tabGroups.all.flatMap((g) => g.tabs);
}

export function getTabCount(): number {
    return getAllTabs().length;
}

export function getTabGroupCount(): number {
    return vscode.window.tabGroups.all.length;
}

export function findTab(fileName: string): vscode.Tab | undefined {
    return getAllTabs().find((t) => t.label === fileName);
}

export function findTabInGroup(fileName: string, viewColumn: vscode.ViewColumn): vscode.Tab | undefined {
    const group = vscode.window.tabGroups.all.find((g) => g.viewColumn === viewColumn);
    return group?.tabs.find((t) => t.label === fileName);
}

// ---------------------------------------------------------------------------
// ITreeNode builder (for passing to extension commands)
// ---------------------------------------------------------------------------

export interface ITreeNode {
    type: string;
    label: string;
    path: string;
    children: ITreeNode[];
}

export function makeFileNode(filePath: string, label?: string): ITreeNode {
    return {
        type: 'file',
        label: label ?? path.basename(filePath),
        path: filePath,
        children: [],
    };
}

export function makeFolderNode(folderPath: string, children: ITreeNode[], label?: string): ITreeNode {
    return {
        type: 'folder',
        label: label ?? path.basename(folderPath),
        path: folderPath,
        children,
    };
}

// ---------------------------------------------------------------------------
// Preview mode file opening
// ---------------------------------------------------------------------------

export async function openFilePreview(...parts: string[]): Promise<vscode.TextEditor> {
    const uri = fixtureUri(...parts);
    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(doc, { preview: true });
}

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

export function getTerminalCount(): number {
    return vscode.window.terminals.length;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function closeAllEditors(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(200);
}

// ---------------------------------------------------------------------------
// Extension activation
// ---------------------------------------------------------------------------

export async function ensureExtensionActive(): Promise<vscode.Extension<unknown>> {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (!ext) throw new Error(`Extension ${EXTENSION_ID} not found`);
    if (!ext.isActive) await ext.activate();
    return ext;
}
