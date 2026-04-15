import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    openFile,
    openFilePreview,
    closeAllEditors,
    ensureExtensionActive,
    findTab,
    getTabCount,
    waitFor,
    sleep,
} from './helpers';

suite('preview tabs', () => {
    suiteSetup(async () => {
        await ensureExtensionActive();
    });

    setup(async () => {
        await vscode.workspace.getConfiguration('workbench.editor').update('enablePreview', true, vscode.ConfigurationTarget.Global);
        await sleep(100);
    });

    teardown(async () => {
        await closeAllEditors();
    });

    suiteTeardown(async () => {
        await vscode.workspace.getConfiguration('workbench.editor').update('enablePreview', undefined, vscode.ConfigurationTarget.Global);
        await sleep(100);
    });

    test('opening file with preview:true → tab.isPreview === true', async () => {
        await openFilePreview('src', 'app.ts');

        const tab = findTab('app.ts');
        assert.ok(tab, 'tab app.ts should exist');
        assert.strictEqual(tab.isPreview, true, 'tab should be preview');
    });

    test('opening file with preview:false → tab.isPreview === false', async () => {
        await openFile('src', 'app.ts');

        const tab = findTab('app.ts');
        assert.ok(tab, 'tab app.ts should exist');
        assert.strictEqual(tab.isPreview, false, 'tab should not be preview');
    });

    test('preview tab is replaced by another preview tab', async () => {
        await openFilePreview('src', 'app.ts');

        assert.strictEqual(getTabCount(), 1);
        assert.ok(findTab('app.ts'), 'app.ts is open');

        await openFilePreview('lib', 'config.ts');

        await waitFor(() => findTab('config.ts') !== undefined);

        assert.strictEqual(getTabCount(), 1, 'preview tab should replace the previous one');
        assert.ok(findTab('config.ts'), 'config.ts should be open');
        assert.ok(!findTab('app.ts'), 'app.ts should be replaced');
    });

    test('preview tab does not replace pinned (non-preview) tab', async () => {
        await openFile('src', 'app.ts');

        assert.strictEqual(findTab('app.ts')?.isPreview, false);

        await openFilePreview('lib', 'config.ts');

        await waitFor(() => findTab('config.ts') !== undefined);

        assert.strictEqual(getTabCount(), 2, 'both tabs should be open');
        assert.ok(findTab('app.ts'), 'pinned tab app.ts should remain');
        assert.ok(findTab('config.ts'), 'preview tab config.ts should be added');
    });

    test('double click (reopen as non-preview) → pin preview tab', async () => {
        await openFilePreview('src', 'app.ts');

        assert.strictEqual(findTab('app.ts')?.isPreview, true, 'initially the tab is preview');

        await openFile('src', 'app.ts');

        await waitFor(() => findTab('app.ts')?.isPreview === false);

        assert.strictEqual(findTab('app.ts')?.isPreview, false, 'tab should become pinned (non-preview)');
    });

    test('multiple pinned + one preview → preview is replaced, pinned remain', async () => {
        await openFile('src', 'app.ts');
        await openFile('src', 'components', 'Button.tsx');
        await openFilePreview('src', 'utils', 'helpers.ts');

        assert.strictEqual(getTabCount(), 3);

        await openFilePreview('lib', 'config.ts');

        await waitFor(() => findTab('config.ts') !== undefined);

        assert.strictEqual(getTabCount(), 3, 'preview replaced previous preview, pinned untouched');
        assert.ok(findTab('app.ts'), 'app.ts (pinned) remained');
        assert.ok(findTab('Button.tsx'), 'Button.tsx (pinned) remained');
        assert.ok(!findTab('helpers.ts'), 'helpers.ts (preview) replaced');
        assert.ok(findTab('config.ts'), 'config.ts (new preview) opened');
    });
});
