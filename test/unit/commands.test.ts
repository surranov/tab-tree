import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { ETreeNodeType, ITreeNode } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContext(): { subscriptions: { dispose: () => void }[] } {
    return { subscriptions: [] };
}

function fileNode(path: string, groupIndex = 1): ITreeNode {
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

function folderNode(path: string, children: ITreeNode[] = []): ITreeNode {
    return {
        type: ETreeNodeType.Folder,
        label: path.split('/').pop() ?? path,
        path,
        children,
    };
}

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

function getHandlers(): Map<string, Function> {
    const map = new Map<string, Function>();
    const calls = (vscode.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls;
    for (const call of calls) {
        map.set(call[0] as string, call[1] as Function);
    }
    return map;
}

// ---------------------------------------------------------------------------
// Before each test: reset mocks + activate
// ---------------------------------------------------------------------------

let handlers: Map<string, Function>;

beforeEach(() => {
    vscode.__test.reset();
    vscode.__test.setWorkspaceFolders(['/project']);
    activate(mockContext() as any);
    handlers = getHandlers();
});

// ---------------------------------------------------------------------------
// closeTab / closeFolderTabs / closeAll
// ---------------------------------------------------------------------------

describe('tab close commands', () => {
    it('closeTab — closes tab by file node path', () => {
        const tab = mockTab('/project/src/index.ts', 1);
        vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [tab], isActive: true }]);

        handlers.get('tabTree.closeTab')!(fileNode('/project/src/index.ts'));

        expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(tab);
    });

    it('closeTab — does not crash if tab not found', () => {
        vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [], isActive: true }]);

        expect(() => {
            handlers.get('tabTree.closeTab')!(fileNode('/project/missing.ts'));
        }).not.toThrow();

        expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
    });

    it('closeTab — does not crash with node without path', () => {
        expect(() => {
            handlers.get('tabTree.closeTab')!({ type: ETreeNodeType.File, label: 'x', path: '', children: [] });
        }).not.toThrow();
    });

    it('closeFolderTabs — closes all tabs of nested files', () => {
        const tab1 = mockTab('/project/src/a.ts', 1);
        const tab2 = mockTab('/project/src/b.ts', 1);
        vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [tab1, tab2], isActive: true }]);

        const folder = folderNode('/project/src', [
            fileNode('/project/src/a.ts'),
            fileNode('/project/src/b.ts'),
        ]);
        handlers.get('tabTree.closeFolderTabs')!(folder);

        expect(vscode.window.tabGroups.close).toHaveBeenCalledWith([tab1, tab2]);
    });

    it('closeAll — closes all tabs in all groups', () => {
        const tab1 = mockTab('/project/a.ts', 1);
        const tab2 = mockTab('/project/b.ts', 2);
        vscode.__test.setTabGroups([
            { viewColumn: 1, tabs: [tab1], isActive: true },
            { viewColumn: 2, tabs: [tab2], isActive: false },
        ]);

        handlers.get('tabTree.closeAll')!();

        expect(vscode.window.tabGroups.close).toHaveBeenCalledWith([tab1, tab2]);
    });

    it('closeAll — does not call close with empty groups', () => {
        vscode.__test.setTabGroups([{ viewColumn: 1, tabs: [], isActive: true }]);

        handlers.get('tabTree.closeAll')!();

        expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Toggle: Follow Active File
// ---------------------------------------------------------------------------

describe('toggle Follow Active File', () => {
    it('enableFollowActiveFile — updates setting to true + setContext', () => {
        handlers.get('tabTree.enableFollowActiveFile')!();

        const configMock = vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>;
        expect(configMock).toHaveBeenCalledWith('tabTree');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.followActiveFile', true,
        );
    });

    it('disableFollowActiveFile — updates setting to false + setContext', () => {
        handlers.get('tabTree.disableFollowActiveFile')!();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.followActiveFile', false,
        );
    });
});

// ---------------------------------------------------------------------------
// Toggle: Preview
// ---------------------------------------------------------------------------

describe('toggle Preview', () => {
    it('enablePreview — updates workbench.editor enablePreview to true + setContext', () => {
        handlers.get('tabTree.enablePreview')!();

        const configMock = vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>;
        expect(configMock).toHaveBeenCalledWith('workbench.editor');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.previewEnabled', true,
        );
    });

    it('disablePreview — updates workbench.editor enablePreview to false + setContext', () => {
        handlers.get('tabTree.disablePreview')!();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext', 'tabTree.previewEnabled', false,
        );
    });
});

// ---------------------------------------------------------------------------
// Open to Side / Open With
// ---------------------------------------------------------------------------

describe('openToSide / openWith', () => {
    it('openToSide — opens file with viewColumn Beside', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.openToSide')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.open',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
            { viewColumn: vscode.ViewColumn.Beside },
        );
    });

    it('openWith — calls vscode.openWith', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.openWith')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.openWith',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('openToSide — does not crash with node without path', () => {
        expect(() => {
            handlers.get('tabTree.openToSide')!({ type: ETreeNodeType.File, label: 'x', path: '', children: [] });
        }).not.toThrow();
    });

    it('3.22 openMarkdownPreview — delegates to markdown.showPreview', () => {
        const node = fileNode('/project/README.md');
        handlers.get('tabTree.openMarkdownPreview')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'markdown.showPreview',
            expect.objectContaining({ fsPath: '/project/README.md' }),
        );
    });

    it('3.23 openMarkdownPreviewSide — delegates to markdown.showPreviewToSide', () => {
        const node = fileNode('/project/README.md');
        handlers.get('tabTree.openMarkdownPreviewSide')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'markdown.showPreviewToSide',
            expect.objectContaining({ fsPath: '/project/README.md' }),
        );
    });
});

// ---------------------------------------------------------------------------
// Copy: Name / Path / Relative Path
// ---------------------------------------------------------------------------

describe('copy commands', () => {
    it('copyName — copies label to clipboard', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.copyName')!(node);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('index.ts');
    });

    it('copyPath — copies absolute path', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.copyPath')!(node);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/project/src/index.ts');
    });

    it('copyRelativePath — copies path from workspace root', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.copyRelativePath')!(node);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('src/index.ts');
    });

    it('copyRelativePath — file outside workspace → absolute path', () => {
        const node = fileNode('/tmp/scratch.ts');
        handlers.get('tabTree.copyRelativePath')!(node);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/tmp/scratch.ts');
    });
});

// ---------------------------------------------------------------------------
// Open Terminal Here
// ---------------------------------------------------------------------------

describe('openTerminalHere', () => {
    it('file node → terminal in file\'s folder', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.openTerminalHere')!(node);

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({ cwd: '/project/src' });
    });

    it('folder → terminal in the folder itself', () => {
        const node = folderNode('/project/src');
        handlers.get('tabTree.openTerminalHere')!(node);

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({ cwd: '/project/src' });
    });
});

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

describe('rename', () => {
    it('renames file via WorkspaceEdit.renameFile + applyEdit (→ D-016)', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('newName.ts');

        const node = fileNode('/project/src/old.ts');
        await handlers.get('tabTree.rename')!(node);

        expect(vscode.window.showInputBox).toHaveBeenCalledWith({ prompt: 'New name', value: 'old.ts' });
        expect(vscode.workspace.applyEdit).toHaveBeenCalledOnce();

        const edit = (vscode.workspace.applyEdit as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(edit._operations).toHaveLength(1);
        expect(edit._operations[0].type).toBe('renameFile');
        expect(edit._operations[0].args[0].fsPath).toBe('/project/src/old.ts');
        expect(edit._operations[0].args[1].fsPath).toBe('/project/src/newName.ts');
    });

    it('cancel (empty input) → applyEdit is not called', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        await handlers.get('tabTree.rename')!(fileNode('/project/src/old.ts'));

        expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('same name → applyEdit is not called', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('old.ts');

        await handlers.get('tabTree.rename')!(fileNode('/project/src/old.ts'));

        expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('delete', () => {
    it('confirmation → deletes file to trash', async () => {
        (vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Delete');

        await handlers.get('tabTree.delete')!(fileNode('/project/src/old.ts'));

        expect(vscode.workspace.fs.delete).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/src/old.ts' }),
            { recursive: true, useTrash: true },
        );
    });

    it('cancel → delete is not called', async () => {
        (vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        await handlers.get('tabTree.delete')!(fileNode('/project/src/old.ts'));

        expect(vscode.workspace.fs.delete).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// New File / New Folder — critical: they use getDir
// ---------------------------------------------------------------------------

describe('newFile', () => {
    it('on folder → creates file in that folder', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('new.ts');

        await handlers.get('tabTree.newFile')!(folderNode('/project/src'));

        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/src/new.ts' }),
            expect.any(Uint8Array),
        );
    });

    it('on file → creates file in parent folder (getDir)', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('sibling.ts');

        await handlers.get('tabTree.newFile')!(fileNode('/project/src/index.ts'));

        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/src/sibling.ts' }),
            expect.any(Uint8Array),
        );
    });

    it('cancel → writeFile is not called', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        await handlers.get('tabTree.newFile')!(folderNode('/project/src'));

        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
});

describe('newFolder', () => {
    it('on folder → creates subfolder', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('components');

        await handlers.get('tabTree.newFolder')!(folderNode('/project/src'));

        expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/src/components' }),
        );
    });

    it('on file → creates folder in parent directory (getDir)', async () => {
        (vscode.window.showInputBox as ReturnType<typeof vi.fn>).mockResolvedValue('utils');

        await handlers.get('tabTree.newFolder')!(fileNode('/project/src/index.ts'));

        expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/src/utils' }),
        );
    });
});

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

describe('move', () => {
    it('folder selection → moves file via WorkspaceEdit.renameFile (→ D-016)', async () => {
        const destUri = vscode.Uri.file('/project/lib');
        (vscode.window.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue([destUri]);

        await handlers.get('tabTree.move')!(fileNode('/project/src/index.ts'));

        expect(vscode.workspace.applyEdit).toHaveBeenCalledOnce();

        const edit = (vscode.workspace.applyEdit as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(edit._operations).toHaveLength(1);
        expect(edit._operations[0].type).toBe('renameFile');
        expect(edit._operations[0].args[0].fsPath).toBe('/project/src/index.ts');
        expect(edit._operations[0].args[1].fsPath).toBe('/project/lib/index.ts');
    });

    it('dialog cancel → applyEdit is not called', async () => {
        (vscode.window.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        await handlers.get('tabTree.move')!(fileNode('/project/src/index.ts'));

        expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Find in Folder
// ---------------------------------------------------------------------------

describe('findInFolder', () => {
    it('file node → search in file\'s folder', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.findInFolder')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.findInFiles',
            expect.objectContaining({ filesToInclude: 'src/**' }),
        );
    });

    it('folder → search in the folder itself', () => {
        const node = folderNode('/project/src');
        handlers.get('tabTree.findInFolder')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.findInFiles',
            expect.objectContaining({ filesToInclude: 'src/**' }),
        );
    });
});

// ---------------------------------------------------------------------------
// Git commands
// ---------------------------------------------------------------------------

describe('git commands', () => {
    it('gitStage — calls git.stage with URI', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.gitStage')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'git.stage',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('gitUnstage — calls git.unstage with URI', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.gitUnstage')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'git.unstage',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('gitDiscard — confirmation → calls git.clean', async () => {
        (vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Discard');

        await handlers.get('tabTree.gitDiscard')!(fileNode('/project/src/index.ts'));

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'git.clean',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('gitDiscard — cancel → git.clean is not called', async () => {
        (vscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        await handlers.get('tabTree.gitDiscard')!(fileNode('/project/src/index.ts'));

        const cleanCalls = (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mock.calls
            .filter((c: unknown[]) => c[0] === 'git.clean');
        expect(cleanCalls).toHaveLength(0);
    });

    it('gitViewHistory — calls timeline.focus', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.gitViewHistory')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'timeline.focus',
            expect.objectContaining({ uri: expect.objectContaining({ fsPath: '/project/src/index.ts' }) }),
        );
    });
});

// ---------------------------------------------------------------------------
// Reveal in OS / Explorer
// ---------------------------------------------------------------------------

describe('reveal commands', () => {
    it('revealInOS — calls revealFileInOS with URI', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.revealInOS')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'revealFileInOS',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('revealInExplorer — calls revealInExplorer with URI', () => {
        const node = fileNode('/project/src/index.ts');
        handlers.get('tabTree.revealInExplorer')!(node);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'revealInExplorer',
            expect.objectContaining({ fsPath: '/project/src/index.ts' }),
        );
    });

    it('openInBrowser — calls env.openExternal with file URI', () => {
        const node = fileNode('/project/preview.html');
        handlers.get('tabTree.openInBrowser')!(node);

        expect(vscode.env.openExternal).toHaveBeenCalledWith(
            expect.objectContaining({ fsPath: '/project/preview.html' }),
        );
    });
});

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

describe('select for compare / compare with selected', () => {
    it('selectForCompare → compareWithSelected → calls vscode.diff', () => {
        const node1 = fileNode('/project/src/a.ts');
        const node2 = fileNode('/project/src/b.ts');

        handlers.get('tabTree.selectForCompare')!(node1);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Selected for compare: a.ts');

        handlers.get('tabTree.compareWithSelected')!(node2);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.diff',
            expect.objectContaining({ fsPath: '/project/src/a.ts' }),
            expect.objectContaining({ fsPath: '/project/src/b.ts' }),
        );
    });

    it('compareWithSelected without prior select → warning', () => {
        handlers.get('tabTree.compareWithSelected')!(fileNode('/project/src/b.ts'));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Select a file for compare first');
    });
});

// ---------------------------------------------------------------------------
// Collapse / Expand
// ---------------------------------------------------------------------------

describe('collapse / expand', () => {
    it('collapseAll — calls standard VS Code command', () => {
        handlers.get('tabTree.collapseAll')!();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.actions.treeView.tabTree.collapseAll',
        );
    });
});

// ---------------------------------------------------------------------------
// Null safety — all commands do not crash with undefined/null node
// ---------------------------------------------------------------------------

describe('null safety — commands do not crash with undefined node', () => {
    const commandsWithNodeArg = [
        'tabTree.closeTab', 'tabTree.closeFolderTabs', 'tabTree.openToSide',
        'tabTree.openWith', 'tabTree.openMarkdownPreview', 'tabTree.openMarkdownPreviewSide',
        'tabTree.copyName', 'tabTree.copyPath',
        'tabTree.copyRelativePath', 'tabTree.openTerminalHere', 'tabTree.findInFolder',
        'tabTree.gitStage', 'tabTree.gitUnstage', 'tabTree.gitViewHistory',
        'tabTree.revealInOS', 'tabTree.revealInExplorer', 'tabTree.openInBrowser',
        'tabTree.selectForCompare',
    ];

    for (const cmd of commandsWithNodeArg) {
        it(`${cmd} — does not crash with undefined`, () => {
            expect(() => handlers.get(cmd)!(undefined)).not.toThrow();
        });
    }
});
