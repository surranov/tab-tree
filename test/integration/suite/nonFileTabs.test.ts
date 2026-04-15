import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    closeAllEditors,
    ensureExtensionActive,
    getAllTabs,
    getTabCount,
    waitFor,
    sleep,
} from './helpers';

suite('non-file tabs', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    teardown(async () => {
        await closeAllEditors();
    });

    test('opening Settings → tab appears in tabGroups', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings');

        await waitFor(() => getTabCount() > 0);

        const tabs = getAllTabs();
        assert.ok(tabs.length > 0, 'there should be at least one tab after opening Settings');

        const settingsTab = tabs.find((t) => t.label.toLowerCase().includes('settings'));
        assert.ok(settingsTab, `Settings tab should exist, found: ${tabs.map((t) => t.label).join(', ')}`);
    });

    test('opening Keyboard Shortcuts → tab appears', async () => {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');

        await waitFor(() => getTabCount() > 0);

        const tabs = getAllTabs();
        const kbTab = tabs.find((t) =>
            t.label.toLowerCase().includes('keyboard') || t.label.toLowerCase().includes('keybinding')
        );

        assert.ok(kbTab, `Keyboard Shortcuts tab should exist, found: ${tabs.map((t) => t.label).join(', ')}`);
    });

    test('non-file tab + file tab → both present in tabGroups', async () => {
        const uri = vscode.Uri.file(
            require('path').join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'workspace', 'src', 'app.ts')
        );
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        await vscode.commands.executeCommand('workbench.action.openSettings');

        await waitFor(() => getTabCount() >= 2);

        const tabs = getAllTabs();
        const hasFileTab = tabs.some((t) => t.label === 'app.ts');
        const hasSettingsTab = tabs.some((t) => t.label.toLowerCase().includes('settings'));

        assert.ok(hasFileTab, 'file tab app.ts should exist');
        assert.ok(hasSettingsTab, 'Settings tab should exist');
    });

    test('closing non-file tab → tab disappears, file tabs remain', async () => {
        const uri = vscode.Uri.file(
            require('path').join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'workspace', 'src', 'app.ts')
        );
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        await vscode.commands.executeCommand('workbench.action.openSettings');

        await waitFor(() => getTabCount() >= 2);

        const settingsTab = getAllTabs().find((t) => t.label.toLowerCase().includes('settings'));
        assert.ok(settingsTab, 'Settings tab should exist before closing');

        await vscode.window.tabGroups.close(settingsTab);

        await waitFor(() => !getAllTabs().some((t) => t.label.toLowerCase().includes('settings')));

        assert.ok(
            getAllTabs().some((t) => t.label === 'app.ts'),
            'file tab app.ts should remain after closing Settings'
        );
    });
});
