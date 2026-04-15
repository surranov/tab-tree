import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    ensureExtensionActive,
    closeAllEditors,
    openFile,
    getAllTabs,
    getTabCount,
    findTab,
    waitFor,
    sleep,
} from './helpers';

suite('tab sync — opening', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('opening a file via showTextDocument → tab appears in tabGroups', async () => {
        await openFile('src', 'app.ts');

        await waitFor(() => getTabCount() === 1);

        assert.strictEqual(getTabCount(), 1);
        assert.ok(findTab('app.ts'), 'tab app.ts should exist in tabGroups');
    });

    test('opening via vscode.open command → tab appears', async () => {
        const { fixtureUri } = await import('./helpers');
        const uri = fixtureUri('src', 'components', 'Button.tsx');

        await vscode.commands.executeCommand('vscode.open', uri);

        await waitFor(() => getTabCount() === 1);

        assert.strictEqual(getTabCount(), 1);
        assert.ok(findTab('Button.tsx'), 'tab Button.tsx should appear after vscode.open command');
    });

    test('opening multiple files sequentially → all in tabGroups', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');
        await openFile('src', 'utils', 'helpers.ts');

        await waitFor(() => getTabCount() === 3);

        assert.strictEqual(getTabCount(), 3);
        assert.ok(findTab('app.ts'), 'tab app.ts should be in tabGroups');
        assert.ok(findTab('Button.tsx'), 'tab Button.tsx should be in tabGroups');
        assert.ok(findTab('helpers.ts'), 'tab helpers.ts should be in tabGroups');
    });

    test('opening the same file twice → no duplicate', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'app.ts');

        await waitFor(() => getTabCount() >= 1);
        await sleep(200);

        assert.strictEqual(getTabCount(), 1, 'file opened twice should not duplicate the tab');
    });

    test('opening files from different subtrees → both in tabGroups', async () => {
        await openFile('src', 'app.ts');
        await openFile('lib', 'config.ts');

        await waitFor(() => getTabCount() === 2);

        assert.strictEqual(getTabCount(), 2);
        assert.ok(findTab('app.ts'), 'tab from src should be in tabGroups');
        assert.ok(findTab('config.ts'), 'tab from lib should be in tabGroups');
    });
});

suite('tab sync — closing', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('closing tab via workbench.action.closeActiveEditor → tab disappears', async () => {
        await openFile('src', 'app.ts');
        await waitFor(() => getTabCount() === 1);

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        await waitFor(() => getTabCount() === 0);

        assert.strictEqual(getTabCount(), 0, 'tabGroups should be empty after closing the tab');
        assert.ok(!findTab('app.ts'), 'tab app.ts should not exist in tabGroups');
    });

    test('closing via tabGroups.close → tab disappears', async () => {
        await openFile('src', 'components', 'Header.tsx');
        await waitFor(() => getTabCount() === 1);

        const tabs = getAllTabs();
        assert.strictEqual(tabs.length, 1);

        await vscode.window.tabGroups.close(tabs[0]);

        await waitFor(() => getTabCount() === 0);

        assert.strictEqual(getTabCount(), 0, 'no tabs should remain after tabGroups.close');
        assert.ok(!findTab('Header.tsx'), 'tab Header.tsx should not exist in tabGroups');
    });

    test('closing all via workbench.action.closeAllEditors → 0 tabs', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');
        await openFile('lib', 'config.ts');
        await waitFor(() => getTabCount() === 3);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        await waitFor(() => getTabCount() === 0);

        assert.strictEqual(getTabCount(), 0, 'no tabs should remain after closeAllEditors');
    });

    test('open 3 files, close one → 2 remain', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');
        await openFile('src', 'utils', 'helpers.ts');
        await waitFor(() => getTabCount() === 3);

        const tabToClose = getAllTabs().find(tab =>
            (tab.input as vscode.TabInputText)?.uri?.path.endsWith('app.ts')
        );
        assert.ok(tabToClose, 'tab app.ts should be found for closing');

        await vscode.window.tabGroups.close(tabToClose!);

        await waitFor(() => getTabCount() === 2);

        assert.strictEqual(getTabCount(), 2, '2 tabs should remain after closing one of three');
        assert.ok(!findTab('app.ts'), 'closed tab app.ts should not exist in tabGroups');
        assert.ok(findTab('Button.tsx'), 'tab Button.tsx should remain in tabGroups');
        assert.ok(findTab('helpers.ts'), 'tab helpers.ts should remain in tabGroups');
    });

    test('closing the last file → 0 tabs', async () => {
        await openFile('README.md');
        await waitFor(() => getTabCount() === 1);

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        await waitFor(() => getTabCount() === 0);

        assert.strictEqual(getTabCount(), 0, 'tabGroups should be empty after closing the last file');
    });
});

suite('tab sync — mixed scenarios', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('open 5 files → close 2 → open 1 new → final count = 4', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');
        await openFile('src', 'components', 'Header.tsx');
        await openFile('src', 'utils', 'helpers.ts');
        await openFile('lib', 'config.ts');
        await waitFor(() => getTabCount() === 5);

        assert.strictEqual(getTabCount(), 5, '5 tabs should be open');

        const allTabs = getAllTabs();
        const tabApp = allTabs.find(tab =>
            (tab.input as vscode.TabInputText)?.uri?.path.endsWith('app.ts')
        );
        const tabConfig = allTabs.find(tab =>
            (tab.input as vscode.TabInputText)?.uri?.path.endsWith('config.ts')
        );
        assert.ok(tabApp, 'tab app.ts should exist');
        assert.ok(tabConfig, 'tab config.ts should exist');

        await vscode.window.tabGroups.close([tabApp!, tabConfig!]);

        await waitFor(() => getTabCount() === 3);
        assert.strictEqual(getTabCount(), 3, '3 tabs should remain after closing 2');

        await openFile('README.md');

        await waitFor(() => getTabCount() === 4);
        assert.strictEqual(getTabCount(), 4, 'final tab count should be 4');

        assert.ok(!findTab('app.ts'), 'tab app.ts should be closed');
        assert.ok(!findTab('config.ts'), 'tab config.ts should be closed');
        assert.ok(findTab('Button.tsx'), 'tab Button.tsx should exist');
        assert.ok(findTab('Header.tsx'), 'tab Header.tsx should exist');
        assert.ok(findTab('helpers.ts'), 'tab helpers.ts should exist');
        assert.ok(findTab('README.md'), 'tab README.md should exist');
    });

    test('rapid open-close cycle (stress) → state is consistent', async () => {
        const files: [string, ...string[]][] = [
            ['src', 'app.ts'],
            ['src', 'components', 'Button.tsx'],
            ['src', 'components', 'Header.tsx'],
            ['src', 'utils', 'helpers.ts'],
            ['lib', 'config.ts'],
        ];

        for (const parts of files) {
            await openFile(...parts);
        }
        await waitFor(() => getTabCount() === files.length);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await waitFor(() => getTabCount() === 0);

        for (const parts of files) {
            await openFile(...parts);
        }
        await waitFor(() => getTabCount() === files.length);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await waitFor(() => getTabCount() === 0);

        await sleep(300);

        assert.strictEqual(getTabCount(), 0, 'tabGroups should be empty after stress open-close cycle');

        const remainingTabs = getAllTabs();
        assert.strictEqual(
            remainingTabs.length,
            0,
            `unexpected tabs remaining: ${remainingTabs.map(t => (t.input as vscode.TabInputText)?.uri?.fsPath).join(', ')}`
        );
    });
});
