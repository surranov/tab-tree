import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFile,
  closeAllEditors,
  ensureExtensionActive,
  getTabCount,
  findTab,
  sleep,
} from './helpers';

const EXPECTED_COMMANDS = [
  'tabTree.closeTab',
  'tabTree.closeFolderTabs',
  'tabTree.closeAll',
  'tabTree.collapseAll',
  'tabTree.expandAll',
  'tabTree.enableFollowActiveFile',
  'tabTree.disableFollowActiveFile',
  'tabTree.enablePreview',
  'tabTree.disablePreview',
  'tabTree.openToSide',
  'tabTree.openWith',
  'tabTree.copyName',
  'tabTree.copyPath',
  'tabTree.copyRelativePath',
  'tabTree.openTerminalHere',
  'tabTree.rename',
  'tabTree.delete',
  'tabTree.newFile',
  'tabTree.newFolder',
  'tabTree.move',
  'tabTree.findInFolder',
  'tabTree.gitStage',
  'tabTree.gitUnstage',
  'tabTree.gitDiscard',
  'tabTree.gitViewHistory',
  'tabTree.selectForCompare',
  'tabTree.compareWithSelected',
  'tabTree.openAllGitChanges',
  'tabTree.openStagedGitChanges',
];

suite('context menu commands — files', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('tabTree.closeAll → all tabs closed', async () => {
    await openFile('src', 'app.ts');
    await openFile('src', 'components', 'Button.tsx');
    await openFile('src', 'utils', 'helpers.ts');

    assert.ok(getTabCount() > 0, 'tabs should be open before executing the command');

    await vscode.commands.executeCommand('tabTree.closeAll');

    await sleep(300);

    assert.strictEqual(getTabCount(), 0, 'all tabs should be closed after tabTree.closeAll');
  });

  test('tabTree.collapseAll → does not crash, executes without error', async () => {
    await openFile('src', 'app.ts');
    await openFile('src', 'components', 'Button.tsx');

    let error: unknown;
    try {
      await vscode.commands.executeCommand('tabTree.collapseAll');
      await sleep(100);
    } catch (e) {
      error = e;
    }

    assert.strictEqual(error, undefined, 'tabTree.collapseAll should not throw an error');
  });

  test('tabTree.expandAll → does not crash, executes without error', async () => {
    await openFile('src', 'app.ts');
    await openFile('src', 'components', 'Button.tsx');

    let error: unknown;
    try {
      await vscode.commands.executeCommand('tabTree.expandAll');
      await sleep(100);
    } catch (e) {
      error = e;
    }

    assert.strictEqual(error, undefined, 'tabTree.expandAll should not throw an error');
  });
});

suite('toolbar commands', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  suiteTeardown(async () => {
    await vscode.workspace.getConfiguration('tabTree').update('followActiveFile', undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('workbench.editor').update('enablePreview', undefined, vscode.ConfigurationTarget.Global);
    await sleep(100);
  });

  test('tabTree.closeAll → all tabs closed', async () => {
    await openFile('src', 'app.ts');
    await openFile('lib', 'config.ts');

    assert.ok(getTabCount() >= 2, 'at least 2 tabs should be open');

    await vscode.commands.executeCommand('tabTree.closeAll');

    await sleep(300);

    assert.strictEqual(getTabCount(), 0, 'all tabs should be closed');
  });

  test('tabTree.collapseAll → does not crash', async () => {
    await openFile('src', 'app.ts');

    let thrownError: unknown;
    try {
      await vscode.commands.executeCommand('tabTree.collapseAll');
      await sleep(100);
    } catch (e) {
      thrownError = e;
    }

    assert.strictEqual(thrownError, undefined, 'command should not throw an error');
  });

  test('tabTree.expandAll → does not crash', async () => {
    await openFile('src', 'app.ts');

    let thrownError: unknown;
    try {
      await vscode.commands.executeCommand('tabTree.expandAll');
      await sleep(100);
    } catch (e) {
      thrownError = e;
    }

    assert.strictEqual(thrownError, undefined, 'command should not throw an error');
  });

  test('tabTree.enableFollowActiveFile → toggles setting', async () => {
    await vscode.commands.executeCommand('tabTree.enableFollowActiveFile');
    await sleep(200);

    const isEnabled = vscode.workspace.getConfiguration('tabTree').get<boolean>('followActiveFile');
    assert.strictEqual(isEnabled, true, 'followActiveFile should be true after enable');
  });

  test('tabTree.disableFollowActiveFile → toggles setting', async () => {
    await vscode.commands.executeCommand('tabTree.enableFollowActiveFile');
    await sleep(100);

    await vscode.commands.executeCommand('tabTree.disableFollowActiveFile');
    await sleep(200);

    const isEnabled = vscode.workspace.getConfiguration('tabTree').get<boolean>('followActiveFile');
    assert.strictEqual(isEnabled, false, 'followActiveFile should be false after disable');
  });

  test('tabTree.enablePreview → toggles workbench.editor.enablePreview', async () => {
    await vscode.commands.executeCommand('tabTree.enablePreview');
    await sleep(200);

    const editorConfig = vscode.workspace.getConfiguration('workbench.editor');
    const isPreviewEnabled = editorConfig.get<boolean>('enablePreview');
    assert.strictEqual(isPreviewEnabled, true, 'workbench.editor.enablePreview should be true');
  });

  test('tabTree.disablePreview → toggles workbench.editor.enablePreview', async () => {
    await vscode.commands.executeCommand('tabTree.enablePreview');
    await sleep(100);

    await vscode.commands.executeCommand('tabTree.disablePreview');
    await sleep(200);

    const editorConfig = vscode.workspace.getConfiguration('workbench.editor');
    const isPreviewEnabled = editorConfig.get<boolean>('enablePreview');
    assert.strictEqual(isPreviewEnabled, false, 'workbench.editor.enablePreview should be false');
  });
});

suite('command registration', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('all expected extension commands are registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    const missingCommands: string[] = [];

    for (const expectedCommand of EXPECTED_COMMANDS) {
      if (!allCommands.includes(expectedCommand)) {
        missingCommands.push(expectedCommand);
      }
    }

    assert.deepStrictEqual(
      missingCommands,
      [],
      `following commands are not registered: ${missingCommands.join(', ')}`
    );
  });
});
