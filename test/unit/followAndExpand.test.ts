import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContext(): { subscriptions: { dispose: () => void }[] } {
    return { subscriptions: [] };
}

function mockTab(path: string, groupViewColumn: number, isActive = false): vscode.Tab {
    return {
        input: new vscode.TabInputText(vscode.Uri.file(path)),
        label: path.split('/').pop() ?? path,
        group: { viewColumn: groupViewColumn },
        isDirty: false,
        isPreview: false,
        isPinned: false,
        isActive,
    };
}

function getHandlers(): Map<string, Function> {
    const map = new Map<string, Function>();
    const calls = (vscode.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls;
    for (const call of calls) {
        map.set(call[0] as string, call[1] as Function);
    }
    return map;
}

// ---------------------------------------------------------------------------
// Follow active file
// ---------------------------------------------------------------------------

describe('follow active file — revealActiveFile + scheduleReveal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vscode.__test.reset();
        vscode.__test.setWorkspaceFolders(['/project']);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('on active editor change — file is revealed in treeView after debounce', () => {
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [mockTab('/project/src/index.ts', 1, true)],
                activeTab: mockTab('/project/src/index.ts', 1, true),
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        expect(treeViewMock).toBeDefined();

        // onDidChangeActiveTextEditor calls scheduleReveal
        const activeEditorCb = (vscode.window.onDidChangeActiveTextEditor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(activeEditorCb).toBeDefined();

        // Wait for initial TabTracker debounce (80ms) + refresh
        vi.advanceTimersByTime(80);

        // Clear reveal to not count the initial one
        treeViewMock.reveal.mockClear();

        // Active editor change fires
        activeEditorCb();

        // 150ms hasn't passed — reveal should not be called
        vi.advanceTimersByTime(100);
        expect(treeViewMock.reveal).not.toHaveBeenCalled();

        // Advance to 150ms
        vi.advanceTimersByTime(50);

        expect(treeViewMock.reveal).toHaveBeenCalledOnce();
        expect(treeViewMock.reveal).toHaveBeenCalledWith(
            expect.objectContaining({ path: '/project/src/index.ts' }),
            { select: true, focus: false, expand: true },
        );
    });

    it('multiple rapid editor changes — reveal called once (debounce)', () => {
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [mockTab('/project/src/a.ts', 1, true)],
                activeTab: mockTab('/project/src/a.ts', 1, true),
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const activeEditorCb = (vscode.window.onDidChangeActiveTextEditor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        // 3 rapid changes
        activeEditorCb();
        vi.advanceTimersByTime(50);
        activeEditorCb();
        vi.advanceTimersByTime(50);
        activeEditorCb();

        // 150ms hasn't passed since last call
        vi.advanceTimersByTime(100);
        expect(treeViewMock.reveal).not.toHaveBeenCalled();

        // Advance to 150ms from the last call
        vi.advanceTimersByTime(50);
        expect(treeViewMock.reveal).toHaveBeenCalledOnce();
    });

    it('followActiveFile=false — reveal is not called', () => {
        vscode.__test.setConfigValue('tabTree.followActiveFile', false);

        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [mockTab('/project/src/index.ts', 1, true)],
                activeTab: mockTab('/project/src/index.ts', 1, true),
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const activeEditorCb = (vscode.window.onDidChangeActiveTextEditor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        activeEditorCb();
        vi.advanceTimersByTime(200);

        expect(treeViewMock.reveal).not.toHaveBeenCalled();
    });

    it('no active file — reveal is not called', () => {
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [],
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const activeEditorCb = (vscode.window.onDidChangeActiveTextEditor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        activeEditorCb();
        vi.advanceTimersByTime(200);

        expect(treeViewMock.reveal).not.toHaveBeenCalled();
    });

    it('file not found in tree — reveal not called, no crash', () => {
        // activeTab points to file not in tabGroups.all
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [mockTab('/project/src/a.ts', 1, false)],
                activeTab: mockTab('/project/src/missing.ts', 1, true),
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const activeEditorCb = (vscode.window.onDidChangeActiveTextEditor as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        expect(() => {
            activeEditorCb();
            vi.advanceTimersByTime(200);
        }).not.toThrow();

        expect(treeViewMock.reveal).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Context keys on activation
// ---------------------------------------------------------------------------

describe('context keys on activation', () => {
    beforeEach(() => {
        vscode.__test.reset();
        vscode.__test.setWorkspaceFolders(['/project']);
    });

    it('followActiveFile=true by default → setContext called with true', () => {
        activate(mockContext() as any);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.followActiveFile', true,
        );
    });

    it('previewEnabled=true by default → setContext called with true', () => {
        activate(mockContext() as any);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.previewEnabled', true,
        );
    });
});

// ---------------------------------------------------------------------------
// expandAll
// ---------------------------------------------------------------------------

describe('expandAll — expand all nodes', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vscode.__test.reset();
        vscode.__test.setWorkspaceFolders(['/project']);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('expandAll calls reveal for each node with children', () => {
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [
                    mockTab('/project/src/a.ts', 1),
                    mockTab('/project/src/b.ts', 1),
                    mockTab('/project/lib/c.ts', 1),
                ],
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const handlers = getHandlers();

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        handlers.get('tabTree.expandAll')!();

        // Nodes with children: WorkspaceRoot(project), Folder(src), Folder(lib) = 3 reveal calls
        expect(treeViewMock.reveal).toHaveBeenCalledTimes(3);

        // All calls with expand: true, select: false, focus: false
        for (const call of treeViewMock.reveal.mock.calls) {
            expect(call[1]).toEqual({ expand: true, select: false, focus: false });
        }
    });

    it('expandAll with no files — reveal is not called', () => {
        vscode.__test.setTabGroups([
            {
                viewColumn: 1,
                isActive: true,
                tabs: [],
            },
        ]);

        activate(mockContext() as any);

        const treeViewMock = vscode.window.createTreeView.mock.results[0]?.value;
        const handlers = getHandlers();

        vi.advanceTimersByTime(80);
        treeViewMock.reveal.mockClear();

        handlers.get('tabTree.expandAll')!();

        expect(treeViewMock.reveal).not.toHaveBeenCalled();
    });
});
