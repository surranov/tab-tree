/**
 * Maps an absolute file path to its owning workspace folder via VS Code API.
 * Centralizes all path-vs-workspace comparisons so platform nuances (Windows
 * backslashes, drive-letter case, UNC, remote/virtual URIs) are handled by
 * VS Code itself rather than ad-hoc string matching in callers.
 */

import * as vscode from 'vscode';
import { normalizePath } from './treeUtils';

export interface IWorkspaceLocation {
    folder: vscode.WorkspaceFolder;
    relative: string;
}

export function getWorkspaceLocation(absPath: string): IWorkspaceLocation | undefined {
    const uri = vscode.Uri.file(absPath);
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return undefined;

    const rootPosix = normalizePath(folder.uri.fsPath);
    const targetPosix = normalizePath(absPath);

    if (targetPosix === rootPosix) {
        return { folder, relative: '' };
    }

    const prefix = rootPosix.endsWith('/') ? rootPosix : rootPosix + '/';
    const relative = targetPosix.startsWith(prefix)
        ? targetPosix.slice(prefix.length)
        : targetPosix;

    return { folder, relative };
}
