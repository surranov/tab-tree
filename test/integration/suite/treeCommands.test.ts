import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    openFile,
    closeAllEditors,
    ensureExtensionActive,
    findTab,
    getTabCount,
    getTabGroupCount,
    getTerminalCount,
    makeFileNode,
    makeFolderNode,
    fixtureUri,
    FIXTURES_PATH,
    waitFor,
    sleep,
} from './helpers';

suite('tabTree.closeTab — closing via ITreeNode', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('closeTab with file node → specific tab is closed', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');

        assert.strictEqual(getTabCount(), 2);

        const filePath = path.join(FIXTURES_PATH, 'src', 'app.ts');
        await vscode.commands.executeCommand('tabTree.closeTab', makeFileNode(filePath, 'app.ts'));

        await waitFor(() => !findTab('app.ts'));

        assert.ok(!findTab('app.ts'), 'app.ts should be closed');
        assert.ok(findTab('Button.tsx'), 'Button.tsx should remain');
    });

    test('closeTab with non-existent path → does not crash', async () => {
        await openFile('src', 'app.ts');

        const node = makeFileNode('/nonexistent/file.ts');

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.closeTab', node);
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'command should not throw an error');
        assert.strictEqual(getTabCount(), 1, 'existing tab should not be affected');
    });

    test('closeTab without argument → does not crash (null guard)', async () => {
        await openFile('src', 'app.ts');

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.closeTab');
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'command should not throw an error when called without argument');
    });
});

suite('tabTree.closeFolderTabs — closing folder via ITreeNode', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('closeFolderTabs → all files from folder are closed', async () => {
        await openFile('src', 'components', 'Button.tsx');
        await openFile('src', 'components', 'Header.tsx');
        await openFile('src', 'app.ts');

        assert.strictEqual(getTabCount(), 3);

        const componentsPath = path.join(FIXTURES_PATH, 'src', 'components');
        const folderNode = makeFolderNode(componentsPath, [
            makeFileNode(path.join(componentsPath, 'Button.tsx')),
            makeFileNode(path.join(componentsPath, 'Header.tsx')),
        ]);

        await vscode.commands.executeCommand('tabTree.closeFolderTabs', folderNode);

        await waitFor(() => getTabCount() === 1);

        assert.ok(!findTab('Button.tsx'), 'Button.tsx should be closed');
        assert.ok(!findTab('Header.tsx'), 'Header.tsx should be closed');
        assert.ok(findTab('app.ts'), 'app.ts is not in components folder — should remain');
    });

    test('closeFolderTabs without argument → does not crash (null guard)', async () => {
        await openFile('src', 'app.ts');

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.closeFolderTabs');
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'command should not throw an error when called without argument');
    });

    test('closeFolderTabs with empty folder → does not crash', async () => {
        await openFile('src', 'app.ts');

        const emptyFolder = makeFolderNode('/some/empty/folder', []);

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.closeFolderTabs', emptyFolder);
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'should not throw an error');
        assert.strictEqual(getTabCount(), 1, 'tabs should not be affected');
    });
});

suite('tabTree.openToSide — opening in adjacent column', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('openToSide → file opens in second group', async () => {
        await openFile('src', 'app.ts');

        assert.strictEqual(getTabGroupCount(), 1, 'initial state — 1 group');

        const filePath = path.join(FIXTURES_PATH, 'src', 'components', 'Button.tsx');
        await vscode.commands.executeCommand('tabTree.openToSide', makeFileNode(filePath, 'Button.tsx'));

        await waitFor(() => getTabGroupCount() === 2);

        assert.strictEqual(getTabGroupCount(), 2, 'there should be 2 groups after openToSide');
        assert.ok(findTab('Button.tsx'), 'Button.tsx should be open');
    });

    test('openToSide without argument → does not crash', async () => {
        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.openToSide');
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined);
    });
});

suite('tabTree.openTerminalHere — creating terminal', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
        for (const terminal of vscode.window.terminals) {
            terminal.dispose();
        }
        await sleep(200);
    });

    test('openTerminalHere with file node → terminal is created', async () => {
        const initialCount = getTerminalCount();

        const filePath = path.join(FIXTURES_PATH, 'src', 'app.ts');
        await vscode.commands.executeCommand('tabTree.openTerminalHere', makeFileNode(filePath, 'app.ts'));

        await waitFor(() => getTerminalCount() > initialCount);

        assert.strictEqual(getTerminalCount(), initialCount + 1, 'one new terminal should be created');
    });

    test('openTerminalHere with folder node → terminal is created', async () => {
        const initialCount = getTerminalCount();

        const folderPath = path.join(FIXTURES_PATH, 'src', 'components');
        await vscode.commands.executeCommand('tabTree.openTerminalHere', makeFolderNode(folderPath, []));

        await waitFor(() => getTerminalCount() > initialCount);

        assert.strictEqual(getTerminalCount(), initialCount + 1, 'one new terminal should be created');
    });

    test('openTerminalHere without argument → does not crash', async () => {
        const initialCount = getTerminalCount();

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.openTerminalHere');
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined);
        assert.strictEqual(getTerminalCount(), initialCount, 'terminal should not be created');
    });
});

suite('tabTree.copy* — copying to clipboard', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('copyName → label in clipboard', async () => {
        const filePath = path.join(FIXTURES_PATH, 'src', 'app.ts');
        await vscode.commands.executeCommand('tabTree.copyName', makeFileNode(filePath, 'app.ts'));

        await sleep(100);

        const clipboard = await vscode.env.clipboard.readText();
        assert.strictEqual(clipboard, 'app.ts', 'clipboard should contain the file name');
    });

    test('copyPath → absolute path in clipboard', async () => {
        const filePath = path.join(FIXTURES_PATH, 'src', 'app.ts');
        await vscode.commands.executeCommand('tabTree.copyPath', makeFileNode(filePath, 'app.ts'));

        await sleep(100);

        const clipboard = await vscode.env.clipboard.readText();
        assert.strictEqual(clipboard, filePath, 'clipboard should contain the absolute path');
    });

    test('copyRelativePath → relative path from workspace root', async () => {
        const filePath = path.join(FIXTURES_PATH, 'src', 'components', 'Button.tsx');
        await vscode.commands.executeCommand('tabTree.copyRelativePath', makeFileNode(filePath, 'Button.tsx'));

        await sleep(100);

        const clipboard = await vscode.env.clipboard.readText();
        assert.strictEqual(
            clipboard,
            'src/components/Button.tsx',
            'clipboard should contain the relative path'
        );
    });

    test('copyName for folder → folder name', async () => {
        const folderPath = path.join(FIXTURES_PATH, 'src', 'components');
        await vscode.commands.executeCommand('tabTree.copyName', makeFolderNode(folderPath, [], 'components'));

        await sleep(100);

        const clipboard = await vscode.env.clipboard.readText();
        assert.strictEqual(clipboard, 'components', 'clipboard should contain the folder name');
    });

    test('copyRelativePath for folder → relative folder path', async () => {
        const folderPath = path.join(FIXTURES_PATH, 'src', 'components');
        await vscode.commands.executeCommand('tabTree.copyRelativePath', makeFolderNode(folderPath, [], 'components'));

        await sleep(100);

        const clipboard = await vscode.env.clipboard.readText();
        assert.strictEqual(
            clipboard,
            'src/components',
            'clipboard should contain the relative folder path'
        );
    });
});

suite('tabTree.selectForCompare + compareWithSelected', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('selectForCompare + compareWithSelected → diff editor opens', async () => {
        await openFile('src', 'app.ts');
        await openFile('lib', 'config.ts');

        const fileA = path.join(FIXTURES_PATH, 'src', 'app.ts');
        const fileB = path.join(FIXTURES_PATH, 'lib', 'config.ts');

        await vscode.commands.executeCommand('tabTree.selectForCompare', makeFileNode(fileA, 'app.ts'));
        await sleep(100);

        await vscode.commands.executeCommand('tabTree.compareWithSelected', makeFileNode(fileB, 'config.ts'));

        await waitFor(() => {
            const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            return tabs.some((t) => t.input instanceof vscode.TabInputTextDiff);
        });

        const diffTab = vscode.window.tabGroups.all
            .flatMap((g) => g.tabs)
            .find((t) => t.input instanceof vscode.TabInputTextDiff);

        assert.ok(diffTab, 'diff editor should open');
    });

    test('compareWithSelected without selectForCompare → does not crash (warning message)', async () => {
        const fileB = path.join(FIXTURES_PATH, 'lib', 'config.ts');

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.compareWithSelected', makeFileNode(fileB, 'config.ts'));
            await sleep(200);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'should not throw an error');
    });
});

suite('tabTree.revealInExplorer — reveal in explorer', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('revealInExplorer with file node → does not crash', async () => {
        const filePath = path.join(FIXTURES_PATH, 'src', 'app.ts');

        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.revealInExplorer', makeFileNode(filePath, 'app.ts'));
            await sleep(200);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined, 'revealInExplorer should not throw an error');
    });

    test('revealInExplorer without argument → does not crash', async () => {
        let error: unknown;
        try {
            await vscode.commands.executeCommand('tabTree.revealInExplorer');
            await sleep(100);
        } catch (e) {
            error = e;
        }

        assert.strictEqual(error, undefined);
    });
});
