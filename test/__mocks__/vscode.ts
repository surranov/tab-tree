/**
 * VS Code API mock for vitest.
 * Provides classes, enums, and stubs needed to test extension code
 * that imports 'vscode'.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Tab change event listeners — tests fire events through __test helpers
// ---------------------------------------------------------------------------

const tabChangeListeners: ((event: TabChangeEvent) => void)[] = [];
const tabGroupChangeListeners: (() => void)[] = [];
const configChangeListeners: ((e: { affectsConfiguration: (s: string) => boolean }) => void)[] = [];
const renameFilesListeners: ((e: FileRenameEvent) => void)[] = [];
const extensionsChangeListeners: (() => void)[] = [];
let availableCommandIds: string[] = [];

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export class Uri {
    readonly fsPath: string;
    readonly scheme: string;

    private constructor(fsPath: string, scheme = 'file') {
        this.fsPath = fsPath;
        this.scheme = scheme;
    }

    static file(path: string): Uri {
        return new Uri(path, 'file');
    }

    static parse(uriString: string): Uri {
        if (uriString.startsWith('file://')) {
            return new Uri(uriString.slice(7), 'file');
        }
        const match = uriString.match(/^(\w[\w+.-]*):\/\/(.+)$/);
        if (match) {
            return new Uri(match[2], match[1]);
        }
        return new Uri(uriString, 'unknown');
    }

    static joinPath(base: Uri, ...parts: string[]): Uri {
        return Uri.file(base.fsPath + '/' + parts.join('/'));
    }

    toString(): string {
        return `${this.scheme}://${this.fsPath}`;
    }
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class TreeItem {
    label: string;
    collapsibleState: TreeItemCollapsibleState;
    resourceUri?: Uri;
    command?: { command: string; title: string; arguments?: unknown[] };
    contextValue?: string;
    description?: string;

    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
    }
}

export class EventEmitter<T = void> {
    private handlers: ((data: T) => void)[] = [];

    event = (handler: (data: T) => void) => {
        this.handlers.push(handler);
        return {
            dispose: () => {
                const idx = this.handlers.indexOf(handler);
                if (idx >= 0) this.handlers.splice(idx, 1);
            },
        };
    };

    fire(data: T): void {
        this.handlers.forEach((h) => h(data));
    }

    dispose(): void {
        this.handlers = [];
    }
}

export class ThemeIcon {
    constructor(public readonly id: string, public readonly color?: unknown) {}
}

export class DataTransferItem {
    constructor(private value: unknown) {}
    asString(): Promise<string> {
        return Promise.resolve(String(this.value));
    }
}

export class DataTransfer {
    private items = new Map<string, DataTransferItem>();

    get(mimeType: string): DataTransferItem | undefined {
        return this.items.get(mimeType);
    }

    set(mimeType: string, value: DataTransferItem): void {
        this.items.set(mimeType, value);
    }
}

// ---------------------------------------------------------------------------
// Tab input classes (for instanceof checks)
// ---------------------------------------------------------------------------

export class TabInputText {
    constructor(public readonly uri: Uri) {}
}

export class TabInputCustom {
    constructor(public readonly uri: Uri, public readonly viewType: string) {}
}

export class TabInputNotebook {
    constructor(public readonly uri: Uri, public readonly notebookType: string) {}
}

export class TabInputTextDiff {
    constructor(public readonly original: Uri, public readonly modified: Uri) {}
}

export class TabInputNotebookDiff {
    constructor(public readonly original: Uri, public readonly modified: Uri) {}
}

export class TabInputWebview {
    constructor(public readonly viewType: string) {}
}

export class TabInputTerminal {}

export class WorkspaceEdit {
    private operations: { type: string; args: unknown[] }[] = [];

    renameFile(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): void {
        this.operations.push({ type: 'renameFile', args: [oldUri, newUri, options] });
    }

    deleteFile(uri: Uri, options?: { recursive?: boolean }): void {
        this.operations.push({ type: 'deleteFile', args: [uri, options] });
    }

    createFile(uri: Uri, options?: { overwrite?: boolean }): void {
        this.operations.push({ type: 'createFile', args: [uri, options] });
    }

    /** Expose operations for test assertions */
    get _operations() {
        return this.operations;
    }
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
}

// ---------------------------------------------------------------------------
// Namespaces (window, workspace, commands, env)
// ---------------------------------------------------------------------------

export interface TabChangeEvent {
    opened: Tab[];
    closed: Tab[];
    changed: Tab[];
}

export interface FileRenameEvent {
    files: readonly { oldUri: Uri; newUri: Uri }[];
}

export interface Tab {
    input: unknown;
    label: string;
    group: { viewColumn: number };
    isDirty: boolean;
    isPreview: boolean;
    isPinned: boolean;
    isActive: boolean;
}

export interface TabGroup {
    viewColumn: number;
    tabs: Tab[];
    activeTab?: Tab;
    isActive: boolean;
}

export const window = {
    tabGroups: {
        all: [] as TabGroup[],
        activeTabGroup: undefined as TabGroup | undefined,
        onDidChangeTabs: (listener: (event: TabChangeEvent) => void) => {
            tabChangeListeners.push(listener);
            return {
                dispose: () => {
                    const idx = tabChangeListeners.indexOf(listener);
                    if (idx >= 0) tabChangeListeners.splice(idx, 1);
                },
            };
        },
        onDidChangeTabGroups: (listener: () => void) => {
            tabGroupChangeListeners.push(listener);
            return {
                dispose: () => {
                    const idx = tabGroupChangeListeners.indexOf(listener);
                    if (idx >= 0) tabGroupChangeListeners.splice(idx, 1);
                },
            };
        },
        close: vi.fn().mockResolvedValue(undefined),
    },
    onDidChangeActiveTextEditor: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    createTreeView: vi.fn().mockReturnValue({
        reveal: vi.fn(),
        dispose: vi.fn(),
        onDidExpandElement: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        onDidCollapseElement: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    }),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
    createTerminal: vi.fn().mockReturnValue({ show: vi.fn() }),
};

const mockConfigValues: Record<string, unknown> = {};

export const workspace = {
    getConfiguration: vi.fn().mockImplementation((_section?: string) => ({
        get: vi.fn().mockImplementation((key: string, defaultValue?: unknown) => {
            const fullKey = _section ? `${_section}.${key}` : key;
            return fullKey in mockConfigValues ? mockConfigValues[fullKey] : defaultValue;
        }),
        update: vi.fn().mockResolvedValue(undefined),
    })),
    onDidChangeConfiguration: (listener: (e: { affectsConfiguration: (s: string) => boolean }) => void) => {
        configChangeListeners.push(listener);
        return {
            dispose: () => {
                const idx = configChangeListeners.indexOf(listener);
                if (idx >= 0) configChangeListeners.splice(idx, 1);
            },
        };
    },
    onDidRenameFiles: (listener: (e: FileRenameEvent) => void) => {
        renameFilesListeners.push(listener);
        return {
            dispose: () => {
                const idx = renameFilesListeners.indexOf(listener);
                if (idx >= 0) renameFilesListeners.splice(idx, 1);
            },
        };
    },
    workspaceFolders: undefined as { uri: Uri }[] | undefined,
    applyEdit: vi.fn().mockResolvedValue(true),
    fs: {
        rename: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        createDirectory: vi.fn().mockResolvedValue(undefined),
    },
};

export const commands = {
    executeCommand: vi.fn().mockResolvedValue(undefined),
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    getCommands: vi.fn().mockImplementation((_filterInternal?: boolean) =>
        Promise.resolve([...availableCommandIds]),
    ),
};

export const extensions = {
    onDidChange: (listener: () => void) => {
        extensionsChangeListeners.push(listener);
        return {
            dispose: () => {
                const idx = extensionsChangeListeners.indexOf(listener);
                if (idx >= 0) extensionsChangeListeners.splice(idx, 1);
            },
        };
    },
    getExtension: vi.fn().mockReturnValue(undefined),
    all: [] as unknown[],
};

export const env = {
    clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
    },
    openExternal: vi.fn().mockResolvedValue(true),
};

// ---------------------------------------------------------------------------
// Test helpers — used from test files, NOT from production code
// ---------------------------------------------------------------------------

export const __test = {
    fireTabsChanged(event: TabChangeEvent): void {
        tabChangeListeners.forEach((l) => l(event));
    },

    fireConfigChanged(section: string): void {
        configChangeListeners.forEach((l) =>
            l({ affectsConfiguration: (s: string) => s === section }),
        );
    },

    fireRenameFiles(event: FileRenameEvent): void {
        renameFilesListeners.forEach((l) => l(event));
    },

    setConfigValue(key: string, value: unknown): void {
        mockConfigValues[key] = value;
    },

    setTabGroups(groups: TabGroup[]): void {
        window.tabGroups.all = groups;
        window.tabGroups.activeTabGroup = groups.find((g) => g.isActive);
    },

    setWorkspaceFolders(paths: string[]): void {
        workspace.workspaceFolders = paths.map((p) => ({ uri: Uri.file(p) }));
    },

    setAvailableCommands(ids: string[]): void {
        availableCommandIds = [...ids];
    },

    fireExtensionsChanged(): void {
        extensionsChangeListeners.forEach((l) => l());
    },

    reset(): void {
        tabChangeListeners.length = 0;
        tabGroupChangeListeners.length = 0;
        configChangeListeners.length = 0;
        renameFilesListeners.length = 0;
        extensionsChangeListeners.length = 0;
        availableCommandIds = [];
        window.tabGroups.all = [];
        window.tabGroups.activeTabGroup = undefined;
        window.tabGroups.close.mockClear();
        window.onDidChangeActiveTextEditor.mockClear();
        window.createTreeView.mockClear();
        window.showInformationMessage.mockClear();
        window.showWarningMessage.mockClear();
        window.showInputBox.mockClear();
        window.showOpenDialog.mockClear();
        window.createTerminal.mockClear();
        workspace.getConfiguration.mockClear();
        workspace.applyEdit.mockClear();
        workspace.workspaceFolders = undefined;
        workspace.fs.rename.mockClear();
        workspace.fs.delete.mockClear();
        workspace.fs.writeFile.mockClear();
        workspace.fs.createDirectory.mockClear();
        commands.executeCommand.mockClear();
        commands.registerCommand.mockClear();
        commands.getCommands.mockClear();
        extensions.getExtension.mockClear();
        env.clipboard.writeText.mockClear();
        env.openExternal.mockClear();
        Object.keys(mockConfigValues).forEach((k) => delete mockConfigValues[k]);
    },
};
