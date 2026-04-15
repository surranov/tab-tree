import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import {
    THIRD_PARTY_COMMANDS,
    computeContextKeyUpdates,
} from '../../src/thirdPartyCommands';
import { ETreeNodeType, ITreeNode } from '../../src/types';

function mockContext(): { subscriptions: { dispose: () => void }[] } {
    return { subscriptions: [] };
}

function fileNode(path: string): ITreeNode {
    return {
        type: ETreeNodeType.File,
        label: path.split('/').pop() ?? path,
        path,
        children: [],
        tabInfo: {
            filePath: path,
            scheme: 'file',
            label: path.split('/').pop() ?? path,
            groupIndex: 1,
            tabIndex: 0,
            isDirty: false,
            isPreview: false,
            isPinned: false,
            isActive: false,
            tabType: 'text',
        },
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
// Pure helper
// ---------------------------------------------------------------------------

describe('computeContextKeyUpdates', () => {
    it('returns false for every context key when no commands are available', () => {
        const updates = computeContextKeyUpdates(new Set());
        for (const cmd of THIRD_PARTY_COMMANDS) {
            expect(updates[cmd.contextKey]).toBe(false);
        }
    });

    it('returns true only for keys whose commandId is present', () => {
        const available = new Set([
            'typescript.findAllFileReferences',
            'gitlens.openFileHistory',
        ]);
        const updates = computeContextKeyUpdates(available);

        expect(updates['tabTree.ext.tsFileReferencesAvailable']).toBe(true);
        expect(updates['tabTree.ext.gitlensOpenFileHistoryAvailable']).toBe(true);
        expect(updates['tabTree.ext.gitlensOpenFileHistoryInGraphAvailable']).toBe(false);
        expect(updates['tabTree.ext.gitlensVisualizeFileHistoryAvailable']).toBe(false);
        expect(updates['tabTree.ext.gitlensQuickOpenFileHistoryAvailable']).toBe(false);
    });

    it('includes every whitelisted commandId in the result', () => {
        const updates = computeContextKeyUpdates(new Set());
        const keys = Object.keys(updates);
        expect(keys.length).toBe(THIRD_PARTY_COMMANDS.length);
        for (const cmd of THIRD_PARTY_COMMANDS) {
            expect(keys).toContain(cmd.contextKey);
        }
    });
});

// ---------------------------------------------------------------------------
// Wrapper commands + activation context keys
// ---------------------------------------------------------------------------

let handlers: Map<string, Function>;

beforeEach(() => {
    vscode.__test.reset();
    vscode.__test.setWorkspaceFolders(['/project']);
});

describe('third-party wrapper commands', () => {
    it('registers a wrapper for every whitelisted entry', () => {
        activate(mockContext() as any);
        handlers = getHandlers();

        for (const cmd of THIRD_PARTY_COMMANDS) {
            expect(handlers.has(cmd.wrapperId)).toBe(true);
        }
    });

    it('delegates to the real command with the file URI', async () => {
        activate(mockContext() as any);
        handlers = getHandlers();

        for (const cmd of THIRD_PARTY_COMMANDS) {
            (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockClear();

            await handlers.get(cmd.wrapperId)!(fileNode('/project/src/a.ts'));

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                cmd.commandId,
                expect.objectContaining({ fsPath: '/project/src/a.ts', scheme: 'file' }),
            );
        }
    });

    it('is a no-op when node has no path', async () => {
        activate(mockContext() as any);
        handlers = getHandlers();

        for (const cmd of THIRD_PARTY_COMMANDS) {
            (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockClear();

            await handlers.get(cmd.wrapperId)!({
                type: ETreeNodeType.File,
                label: 'x',
                path: '',
                children: [],
            });

            const wasCalled = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
                .some((call) => call[0] === cmd.commandId);
            expect(wasCalled).toBe(false);
        }
    });

    it('is a no-op when node is undefined', async () => {
        activate(mockContext() as any);
        handlers = getHandlers();

        for (const cmd of THIRD_PARTY_COMMANDS) {
            await expect(
                handlers.get(cmd.wrapperId)!(undefined),
            ).resolves.not.toThrow();
        }
    });

    it('shows a warning if the real command fails', async () => {
        activate(mockContext() as any);
        handlers = getHandlers();

        const cmd = THIRD_PARTY_COMMANDS[0];
        const execMock = vscode.commands.executeCommand as ReturnType<typeof vi.fn>;
        execMock.mockImplementationOnce(() => {
            throw new Error('command not found');
        });

        await handlers.get(cmd.wrapperId)!(fileNode('/project/src/a.ts'));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining(cmd.title),
        );
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('command not found'),
        );
    });
});

describe('third-party context keys', () => {
    function getSetContextCalls(): [string, boolean][] {
        return (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
            .filter((call) => call[0] === 'setContext' && String(call[1]).startsWith('tabTree.ext.'))
            .map((call) => [call[1] as string, call[2] as boolean]);
    }

    it('sets every key to false when no commands are registered', async () => {
        vscode.__test.setAvailableCommands([]);
        activate(mockContext() as any);

        await vi.waitFor(() => {
            const calls = getSetContextCalls();
            expect(calls.length).toBeGreaterThanOrEqual(THIRD_PARTY_COMMANDS.length);
        });

        const calls = getSetContextCalls();
        for (const cmd of THIRD_PARTY_COMMANDS) {
            expect(calls).toContainEqual([cmd.contextKey, false]);
        }
    });

    it('sets key to true when matching commandId is registered', async () => {
        vscode.__test.setAvailableCommands([
            'typescript.findAllFileReferences',
            'gitlens.openFileHistory',
            'gitlens.openFileHistoryInGraph',
            'gitlens.visualizeHistory.file',
            'gitlens.quickOpenFileHistory',
        ]);
        activate(mockContext() as any);

        await vi.waitFor(() => {
            const calls = getSetContextCalls();
            expect(calls.length).toBeGreaterThanOrEqual(THIRD_PARTY_COMMANDS.length);
        });

        const calls = getSetContextCalls();
        for (const cmd of THIRD_PARTY_COMMANDS) {
            expect(calls).toContainEqual([cmd.contextKey, true]);
        }
    });

    it('re-evaluates keys when the extensions set changes', async () => {
        vscode.__test.setAvailableCommands([]);
        activate(mockContext() as any);

        await vi.waitFor(() => {
            const calls = getSetContextCalls();
            expect(calls.length).toBeGreaterThanOrEqual(THIRD_PARTY_COMMANDS.length);
        });

        (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockClear();
        vscode.__test.setAvailableCommands(['gitlens.openFileHistory']);
        vscode.__test.fireExtensionsChanged();

        await vi.waitFor(() => {
            const calls = getSetContextCalls();
            const hit = calls.find(
                ([key, value]) => key === 'tabTree.ext.gitlensOpenFileHistoryAvailable' && value === true,
            );
            expect(hit).toBeDefined();
        });
    });
});
