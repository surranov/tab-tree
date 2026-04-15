import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  openFileInGroup,
  closeAllEditors,
  ensureExtensionActive,
  getTabGroupCount,
  findTabInGroup,
  findTab,
  fixtureUri,
  waitFor,
} from './helpers';

suite('Split View — editor groups', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('opening files in different ViewColumn → two groups in tabGroups', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');
    await openFileInGroup(vscode.ViewColumn.Two, 'src', 'components', 'Button.tsx');

    await waitFor(() => getTabGroupCount() === 2);

    assert.strictEqual(getTabGroupCount(), 2);
  });

  test('file in Group 1, another in Group 2 → each in its own group (findTabInGroup)', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');
    await openFileInGroup(vscode.ViewColumn.Two, 'src', 'components', 'Button.tsx');

    await waitFor(() => getTabGroupCount() === 2);

    const tabInGroup1 = findTabInGroup('app.ts', vscode.ViewColumn.One);
    const tabInGroup2 = findTabInGroup('Button.tsx', vscode.ViewColumn.Two);

    assert.ok(tabInGroup1, 'app.ts should be in Group 1');
    assert.ok(tabInGroup2, 'Button.tsx should be in Group 2');

    assert.ok(!findTabInGroup('Button.tsx', vscode.ViewColumn.One), 'Button.tsx should not be in Group 1');
    assert.ok(!findTabInGroup('app.ts', vscode.ViewColumn.Two), 'app.ts should not be in Group 2');
  });

  test('closing all tabs in one group → group disappears, other remains', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');
    await openFileInGroup(vscode.ViewColumn.Two, 'src', 'components', 'Button.tsx');

    await waitFor(() => getTabGroupCount() === 2);

    await vscode.commands.executeCommand('workbench.action.closeEditorsInGroup');

    await waitFor(() => getTabGroupCount() === 1);

    assert.strictEqual(getTabGroupCount(), 1);

    const remainingTab = findTab('app.ts');
    assert.ok(remainingTab, 'app.ts should remain in the only group');
  });

  test('same file in both groups → findTabInGroup finds in both', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');
    await openFileInGroup(vscode.ViewColumn.Two, 'src', 'app.ts');

    await waitFor(() => getTabGroupCount() === 2);

    const tabInGroup1 = findTabInGroup('app.ts', vscode.ViewColumn.One);
    const tabInGroup2 = findTabInGroup('app.ts', vscode.ViewColumn.Two);

    assert.ok(tabInGroup1, 'app.ts should be found in Group 1');
    assert.ok(tabInGroup2, 'app.ts should be found in Group 2');
  });

  test('split via workbench.action.splitEditorRight → second group is created', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');

    await waitFor(() => getTabGroupCount() === 1);
    assert.strictEqual(getTabGroupCount(), 1);

    await vscode.commands.executeCommand('workbench.action.splitEditorRight');

    await waitFor(() => getTabGroupCount() === 2);

    assert.strictEqual(getTabGroupCount(), 2);
  });
});

suite('Split View — viewColumn when opening via command', () => {
  suiteSetup(async () => {
    await ensureExtensionActive();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('vscode.open with viewColumn:2 → file is active in Group 2', async () => {
    await openFileInGroup(vscode.ViewColumn.One, 'src', 'app.ts');

    await waitFor(() => getTabGroupCount() === 1);

    const buttonUri = fixtureUri('src', 'components', 'Button.tsx');
    await vscode.commands.executeCommand('vscode.open', buttonUri, { viewColumn: vscode.ViewColumn.Two });

    await waitFor(() => getTabGroupCount() === 2);
    await waitFor(() => vscode.window.activeTextEditor?.viewColumn === vscode.ViewColumn.Two);

    assert.strictEqual(
      vscode.window.activeTextEditor?.viewColumn,
      vscode.ViewColumn.Two,
      'file should open and become active in Group 2'
    );
  });
});
