import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { TabTreeDragAndDropController } from '../../src/treeDataProvider';
import { ETreeNodeType, ITreeNode } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTab(path: string, groupViewColumn: number): vscode.Tab {
    return {
        input: new vscode.TabInputText(vscode.Uri.file(path)),
        label: path.split('/').pop() ?? path,
        group: { viewColumn: groupViewColumn },
        isDirty: false,
        isPreview: false,
        isPinned: false,
        isActive: false,
    };
}

function fileNode(path: string, groupIndex: number): ITreeNode {
    return {
        type: ETreeNodeType.File,
        label: path.split('/').pop() ?? path,
        path,
        children: [],
        tabInfo: {
            filePath: path,
            scheme: 'file',
            label: path.split('/').pop() ?? path,
            groupIndex,
            tabIndex: 0,
            isDirty: false,
            isPreview: false,
            isPinned: false,
            isActive: false,
            tabType: 'text',
        },
    };
}

function folderNode(path: string, children: ITreeNode[]): ITreeNode {
    return {
        type: ETreeNodeType.Folder,
        label: path.split('/').pop() ?? path,
        path,
        children,
    };
}

function workspaceRootNode(path: string, children: ITreeNode[]): ITreeNode {
    return {
        type: ETreeNodeType.WorkspaceRoot,
        label: path.split('/').pop() ?? path,
        path,
        children,
    };
}

function dropPayload(...uris: string[]): vscode.DataTransfer {
    const dataTransfer = new vscode.DataTransfer();
    dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')));
    return dataTransfer;
}

// ---------------------------------------------------------------------------
// TabTreeDragAndDropController tests
// ---------------------------------------------------------------------------

describe('TabTreeDragAndDropController', () => {
    let controller: TabTreeDragAndDropController;

    beforeEach(() => {
        vscode.__test.reset();
        controller = new TabTreeDragAndDropController();
    });

    // -------------------------------------------------------------------------
    // handleDrag — storing drag source
    // -------------------------------------------------------------------------

    describe('handleDrag — storing drag source', () => {
        it('single file node → path and groupIndex stored in dragSources', () => {
            const node = fileNode('/project/src/index.ts', 1);

            controller.handleDrag([node], new vscode.DataTransfer());

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.size).toBe(1);
            expect(sources.get('/project/src/index.ts')).toBe(1);
        });

        it('folder with nested files → all files stored', () => {
            const folder = folderNode('/project/src', [
                fileNode('/project/src/a.ts', 2),
                fileNode('/project/src/b.ts', 2),
            ]);

            controller.handleDrag([folder], new vscode.DataTransfer());

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.size).toBe(2);
            expect(sources.get('/project/src/a.ts')).toBe(2);
            expect(sources.get('/project/src/b.ts')).toBe(2);
        });

        it('empty folder → nothing stored', () => {
            controller.handleDrag([folderNode('/project/empty', [])], new vscode.DataTransfer());

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.size).toBe(0);
        });

        it('workspace root → nested files stored, root itself not', () => {
            const root = workspaceRootNode('/project', [fileNode('/project/src/index.ts', 1)]);

            controller.handleDrag([root], new vscode.DataTransfer());

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.has('/project')).toBe(false);
            expect(sources.has('/project/src/index.ts')).toBe(true);
        });

        it('new handleDrag clears previous drag sources', () => {
            controller.handleDrag([fileNode('/project/a.ts', 1)], new vscode.DataTransfer());
            controller.handleDrag([fileNode('/project/b.ts', 2)], new vscode.DataTransfer());

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.size).toBe(1);
            expect(sources.has('/project/a.ts')).toBe(false);
            expect(sources.has('/project/b.ts')).toBe(true);
        });

        it('sets text/uri-list with file:// URI for each file', async () => {
            const node = fileNode('/project/src/index.ts', 1);
            const dataTransfer = new vscode.DataTransfer();

            controller.handleDrag([node], dataTransfer);

            const item = dataTransfer.get('text/uri-list');
            expect(item).toBeDefined();
            const value = await item!.asString();
            expect(value).toBe('file:///project/src/index.ts');
        });

        it('sets text/plain with relative paths when workspace is set', async () => {
            vscode.__test.setWorkspaceFolders(['/project']);
            const node = fileNode('/project/src/index.ts', 1);
            const dataTransfer = new vscode.DataTransfer();

            controller.handleDrag([node], dataTransfer);

            const item = dataTransfer.get('text/plain');
            expect(item).toBeDefined();
            const value = await item!.asString();
            expect(value).toBe('src/index.ts');
        });
    });

    // -------------------------------------------------------------------------
    // handleDrop — opening files from dataTransfer
    // -------------------------------------------------------------------------

    describe('handleDrop — opening files', () => {
        beforeEach(() => {
            vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [], isActive: true }]);
        });

        it('single file:// URI → vscode.open called with that URI and { preview: false }', async () => {
            await controller.handleDrop(undefined, dropPayload('file:///project/src/index.ts'));

            expect(vscode.commands.executeCommand).toHaveBeenCalledOnce();
            const [command, uri, options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(command).toBe('vscode.open');
            expect((uri as vscode.Uri).scheme).toBe('file');
            expect((uri as vscode.Uri).fsPath).toBe('/project/src/index.ts');
            expect(options.preview).toBe(false);
        });

        it('multiple file:// URIs → vscode.open called for each', async () => {
            await controller.handleDrop(
                undefined,
                dropPayload(
                    'file:///project/src/a.ts',
                    'file:///project/src/b.ts',
                    'file:///project/src/c.ts',
                ),
            );

            expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(3);
            const openedPaths = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls.map(
                ([, uri]) => (uri as vscode.Uri).fsPath,
            );
            expect(openedPaths).toEqual([
                '/project/src/a.ts',
                '/project/src/b.ts',
                '/project/src/c.ts',
            ]);
        });

        it('non-file scheme → vscode.open NOT called', async () => {
            await controller.handleDrop(undefined, dropPayload('https://example.com/file.ts'));

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('drop without text/uri-list → nothing happens', async () => {
            await controller.handleDrop(undefined, new vscode.DataTransfer());

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('mixed URIs (file + non-file) → only file are opened', async () => {
            await controller.handleDrop(
                undefined,
                dropPayload(
                    'file:///project/src/a.ts',
                    'https://example.com/remote.ts',
                    'file:///project/src/b.ts',
                    'git:///project/src/c.ts',
                ),
            );

            expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
            const openedPaths = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls.map(
                ([, uri]) => (uri as vscode.Uri).fsPath,
            );
            expect(openedPaths).toEqual(['/project/src/a.ts', '/project/src/b.ts']);
        });
    });

    // -------------------------------------------------------------------------
    // handleDrop — target group resolution
    // -------------------------------------------------------------------------

    describe('handleDrop — target group resolution', () => {
        beforeEach(() => {
            vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [], isActive: true }]);
        });

        it('drop on file node → viewColumn from tabInfo.groupIndex', async () => {
            vscode.__test.setTabGroups([{ viewColumn: 2, tabs: [], isActive: true }]);
            const target = fileNode('/project/src/existing.ts', 2);

            await controller.handleDrop(target, dropPayload('file:///project/src/index.ts'));

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(2);
        });

        it('drop on folder containing files → viewColumn from first child with tabInfo', async () => {
            const target = folderNode('/project/src', [fileNode('/project/src/a.ts', 3)]);

            await controller.handleDrop(target, dropPayload('file:///project/src/index.ts'));

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(3);
        });

        it('drop on TabGroup node → viewColumn from nested file', async () => {
            const target: ITreeNode = {
                type: ETreeNodeType.TabGroup,
                label: 'Group 1',
                path: '',
                children: [workspaceRootNode('/project', [fileNode('/project/src/a.ts', 1)])],
            };

            await controller.handleDrop(target, dropPayload('file:///project/src/index.ts'));

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(1);
        });

        it('drop on deeply nested structure → viewColumn resolved from deep child', async () => {
            const deepFile = fileNode('/project/src/deep/nested/file.ts', 2);
            const target = folderNode('/project/src', [
                folderNode('/project/src/deep', [folderNode('/project/src/deep/nested', [deepFile])]),
            ]);

            await controller.handleDrop(target, dropPayload('file:///project/src/index.ts'));

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(2);
        });

        it('undefined target → falls back to active group viewColumn', async () => {
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [], isActive: false },
                { viewColumn: 2, tabs: [], isActive: true },
            ]);

            await controller.handleDrop(undefined, dropPayload('file:///project/src/index.ts'));

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(2);
        });

        it('empty folder target → falls back to active group viewColumn', async () => {
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [], isActive: false },
                { viewColumn: 3, tabs: [], isActive: true },
            ]);

            await controller.handleDrop(
                folderNode('/project/empty', []),
                dropPayload('file:///project/src/index.ts'),
            );

            const [, , options] = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(options.viewColumn).toBe(3);
        });
    });

    // -------------------------------------------------------------------------
    // handleDrop — tab move logic (close source tab after open in target group)
    // -------------------------------------------------------------------------

    describe('handleDrop — tab move logic', () => {
        it('drop into different group → source tab closed', async () => {
            const path = '/project/src/index.ts';
            const sourceTab = mockTab(path, 1);
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [sourceTab], isActive: false },
                { viewColumn: 2, tabs: [], isActive: true },
            ]);

            controller.handleDrag([fileNode(path, 1)], new vscode.DataTransfer());
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 2),
                dropPayload(`file://${path}`),
            );

            expect(vscode.window.tabGroups.close).toHaveBeenCalledOnce();
            expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(sourceTab);
        });

        it('drop into same group → source tab NOT closed', async () => {
            const path = '/project/src/index.ts';
            const sourceTab = mockTab(path, 1);
            vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [sourceTab], isActive: true }]);

            controller.handleDrag([fileNode(path, 1)], new vscode.DataTransfer());
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 1),
                dropPayload(`file://${path}`),
            );

            expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
        });

        it('multiple files with different source groups → each source closed', async () => {
            const pathA = '/project/src/a.ts';
            const pathB = '/project/src/b.ts';
            const sourceTabA = mockTab(pathA, 1);
            const sourceTabB = mockTab(pathB, 2);
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [sourceTabA], isActive: false },
                { viewColumn: 2, tabs: [sourceTabB], isActive: false },
                { viewColumn: 3, tabs: [], isActive: true },
            ]);

            controller.handleDrag(
                [fileNode(pathA, 1), fileNode(pathB, 2)],
                new vscode.DataTransfer(),
            );
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 3),
                dropPayload(`file://${pathA}`, `file://${pathB}`),
            );

            expect(vscode.window.tabGroups.close).toHaveBeenCalledTimes(2);
            expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(sourceTabA);
            expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(sourceTabB);
        });

        it('file not in drag sources → no close (drop from outside the tree)', async () => {
            const path = '/project/src/index.ts';
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [mockTab(path, 1)], isActive: false },
                { viewColumn: 2, tabs: [], isActive: true },
            ]);

            // No handleDrag → dragSources empty
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 2),
                dropPayload(`file://${path}`),
            );

            expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
        });

        it('source group no longer exists → no crash, no close', async () => {
            const path = '/project/src/index.ts';
            vscode.__test.setTabGroups([{ viewColumn: 2, tabs: [], isActive: true }]);

            controller.handleDrag([fileNode(path, 1)], new vscode.DataTransfer());

            await expect(
                controller.handleDrop(
                    fileNode('/project/src/other.ts', 2),
                    dropPayload(`file://${path}`),
                ),
            ).resolves.not.toThrow();

            expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
        });

        it('source tab already gone from source group → no crash, no close', async () => {
            const path = '/project/src/index.ts';
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [], isActive: false },
                { viewColumn: 2, tabs: [], isActive: true },
            ]);

            controller.handleDrag([fileNode(path, 1)], new vscode.DataTransfer());

            await expect(
                controller.handleDrop(
                    fileNode('/project/src/other.ts', 2),
                    dropPayload(`file://${path}`),
                ),
            ).resolves.not.toThrow();

            expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
        });

        it('drag state is consumed by handleDrop → subsequent drop does not re-close', async () => {
            const path = '/project/src/index.ts';
            const sourceTab = mockTab(path, 1);
            vscode.__test.setTabGroups([
                { viewColumn: 1, tabs: [sourceTab], isActive: false },
                { viewColumn: 2, tabs: [], isActive: true },
            ]);

            controller.handleDrag([fileNode(path, 1)], new vscode.DataTransfer());
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 2),
                dropPayload(`file://${path}`),
            );

            (vscode.window.tabGroups.close as ReturnType<typeof vi.fn>).mockClear();

            // Second drop without a new drag — dragSources is empty now
            await controller.handleDrop(
                fileNode('/project/src/other.ts', 2),
                dropPayload(`file://${path}`),
            );

            expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // dispose
    // -------------------------------------------------------------------------

    describe('dispose', () => {
        it('clears drag sources', () => {
            controller.handleDrag([fileNode('/project/src/a.ts', 1)], new vscode.DataTransfer());

            controller.dispose();

            const sources = (controller as any).dragSources as Map<string, number>;
            expect(sources.size).toBe(0);
        });
    });
});
