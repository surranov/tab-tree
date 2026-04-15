# Research — Tab Tree

> Technical research results. Links, findings, API capabilities, limitations.
> This file is the source of truth for technical decisions.

---

## Useful links

- [VS Code Extension API — TreeView](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code API Reference — TreeDataProvider](https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider)
- [VS Code API Reference — TabGroups](https://code.visualstudio.com/api/references/vscode-api#TabGroups)
- [VS Code Source — Explorer](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/files/browser)
- [VS Code Source — fileActions.contribution.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.contribution.ts)
- [VS Code Source — fileCommands.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileCommands.ts)

---

## R-1: TreeDataProvider API

**Status:** ✅ done

### Capabilities

- `getTreeItem(element)` + `getChildren(element?)` — main interface
- `window.createTreeView(viewId, { treeDataProvider, showCollapseAll, canSelectMany, dragAndDropController })`
- `TreeView.reveal(element, { select, focus, expand })` — programmatic expand and select

### TreeItem properties

| Property | What it provides |
|---|---|
| `label` | main text |
| `description` | secondary text (right-aligned, dimmed) |
| `tooltip` | hover |
| `iconPath` | `Uri \| ThemeIcon \| {light, dark}` |
| `resourceUri` | **key** — automatically pulls icon from file-icon theme + git decorations |
| `contextValue` | string for `when`-conditions in context menu |
| `collapsibleState` | `Collapsed \| Expanded \| None` |
| `command` | command on click |

### Key fact

**`resourceUri`** — if a file Uri is set, then:
1. Icon is pulled from active file icon theme (free)
2. Git color decorations and badges (M, U, A) are pulled from built-in git extension (free)
3. Any registered `FileDecorationProvider` is applied automatically

### Drag & Drop

Via `TreeDragAndDropController<T>`:
- `dragMimeTypes` / `dropMimeTypes`
- `handleDrag(source, dataTransfer)` / `handleDrop(target, dataTransfer)`
- D&D to editor area works via `resourceUri`
- D&D from custom tree to native Explorer — **not supported**

### Limitations

- No inline editing (rename directly in tree) — only via `showInputBox`
- No way to set label color directly — only via `FileDecorationProvider`
- `showCollapseAll` — built-in button, but `expandAll` — no built-in, must implement ourselves

---

## R-2: TabGroups API

**Status:** ✅ done

### Getting tabs

```typescript
vscode.window.tabGroups.all          // TabGroup[]
vscode.window.tabGroups.activeTabGroup // TabGroup
group.tabs                            // Tab[]
group.activeTab                       // Tab | undefined
```

### Events

```typescript
vscode.window.tabGroups.onDidChangeTabs(e => {
  e.opened   // Tab[] — opened
  e.closed   // Tab[] — closed
  e.changed  // Tab[] — changed (isDirty, isPreview, isPinned)
})

vscode.window.tabGroups.onDidChangeTabGroups(e => {
  e.opened   // TabGroup[] — new group
  e.closed   // TabGroup[] — closed
  e.changed  // TabGroup[] — focus changed
})
```

### Tab interface

```typescript
tab.label      // display name
tab.input      // TabInputText | TabInputCustom | TabInputNotebook | TabInputWebview | TabInputTerminal | null
tab.isDirty    // unsaved changes
tab.isActive   // active in its group
tab.isPreview  // preview mode (italic)
tab.isPinned   // pinned
tab.group      // parent TabGroup
```

### TabInput types

| Type | Fields | Our interest |
|---|---|---|
| `TabInputText` | `uri: Uri` | ✅ main — text files |
| `TabInputCustom` | `uri: Uri`, `viewType: string` | ✅ custom editors |
| `TabInputNotebook` | `uri: Uri`, `notebookType: string` | ✅ Jupyter notebooks |
| `TabInputWebview` | `viewType: string` | ⚠️ no URI — Settings, Welcome, etc. |
| `TabInputTerminal` | (empty) | ⚠️ no URI — terminals |
| `TabInputTextDiff` | `original: Uri`, `modified: Uri` | ⚠️ two URIs — diff |
| `TabInputNotebookDiff` | `original: Uri`, `modified: Uri` | ⚠️ two URIs |
| `null` | — | unknown type |

### Mutations

```typescript
await vscode.window.tabGroups.close(tab)          // only mutation
await vscode.window.tabGroups.close([tab1, tab2])
```

### Gotchas

- **Multiple fires:** `onDidChangeTabs` can fire 2-3 times per single action — this is by design (issue #146786). **Debounce required.**
- **Preview replacement:** when a preview tab is replaced by another — `closed` + `opened` events arrive, not `changed`
- `onDidOpenTextDocument` / `onDidCloseTextDocument` — **unreliable** for tab tracking (document ≠ tab)

---

## R-3: Explorer context menu — VS Code source

**Status:** ✅ done

### Menu groups (order)

```
navigation       → New File, New Folder, Open to Side, Open With
2_workspace      → Add/Remove Folder from Workspace
3_compare        → Select for Compare, Compare with Selected
5_cutcopypaste   → Cut, Copy, Paste
5b_importexport  → Download, Upload
6_copypath       → Copy Path, Copy Relative Path
7_modification   → Rename, Delete
```

### Commands that accept URI argument (can be called from extension)

| Command ID | Reliability | Mechanism |
|---|---|---|
| `explorer.openWith` | ✅ reliable | `getResourceForCommand` — URI priority |
| `selectForCompare` | ✅ reliable | `getResourceForCommand` |
| `compareFiles` | ✅ reliable | `getResourceForCommand` |
| `revealFileInOS` | ✅ reliable | `getResourceForCommand` |
| `explorer.openToSide` | ⚠️ conditional | `getMultiSelectedResources` — URI as fallback |
| `copyFilePath` | ⚠️ conditional | `getMultiSelectedResources` — URI as fallback |
| `copyRelativeFilePath` | ⚠️ conditional | `getMultiSelectedResources` — URI as fallback |

**"Conditional"** = URI is used only if native Explorer is not focused. Workaround: call through our own wrapper that guarantees Explorer is not focused, or implement ourselves.

### Commands that DON'T accept URI (custom implementation needed)

| Command ID | Why | Our implementation |
|---|---|---|
| `renameFile` | `explorerService.getContext(false)` — internal state | `showInputBox` + `workspace.fs.rename` |
| `moveFileToTrash` | `explorerService.getContext(true)` — internal state | `showWarningMessage` + `workspace.fs.delete({ useTrash: true })` |
| `deleteFile` | `explorerService.getContext(true)` — internal state | `showWarningMessage` + `workspace.fs.delete` |
| `explorer.newFile` | `openExplorerAndCreate` — internal state | `showInputBox` + `workspace.fs.writeFile` |
| `explorer.newFolder` | `openExplorerAndCreate` — internal state | `showInputBox` + `workspace.fs.createDirectory` |
| `filesExplorer.cut` | internal clipboard | not implementing (low priority) |
| `filesExplorer.copy` | internal clipboard | not implementing (low priority) |
| `filesExplorer.paste` | internal clipboard | not implementing (low priority) |

---

## R-4: FileDecorationProvider

**Status:** ✅ done

### How it works

If `TreeItem.resourceUri = fileUri` is set, the built-in git extension automatically applies:
- Label color (modified → orange, untracked → green, ignored → gray)
- Badge (M, U, A, D, C, R)
- Highlighting controlled by `explorer.decorations.colors` and `explorer.decorations.badges` settings

### Propagation to folders

`FileDecoration.propagate: true` — propagates decoration to parent nodes.
**Question:** Does propagation work automatically for custom TreeView, or must it be implemented manually? → **Needs verification during implementation.**

### Known issues

- Issue #187756: custom `FileDecoration.color` may conflict with git colors
- Issue #209907: decorations sometimes don't render on first install → workaround: `onDidChangeFileDecorations.fire()` after activation

---

## R-5: Existing extensions

**Status:** ✅ done

| Extension | Installs | Approach | Limitations |
|---|---|---|---|
| Open Editors Tree View (`alexlapwood`) | ~160 | TreeDataProvider + tabGroups | not actively maintained |
| Open Editors Hierarchy (`ssk7`) | ~69 | tabGroups | non-text excluded, performance warning 100+ |
| Better Open Editors | — | package.json detection | meta tabs not visible |
| Nested Open Editors v1 (`surranov`) | — | TreeDataProvider | sync issues, deprecated |

**Common across all:** None replicate the full Explorer context menu, none handle non-file tabs properly.

---

## R-6: Non-file tabs in TabGroups API

**Status:** ✅ done

### Findings

**Critical discovery:** Settings, Welcome, Keyboard Shortcuts, and Extensions tabs are **NOT** `TabInputWebview`. They are internal EditorPane types (`SettingsEditor2`, `GettingStartedInput`, `KeybindingsEditorInput`, `ExtensionEditorInput`) that inherit base `EditorInput`. The Tab API mapper (`mainThreadEditorTabs.ts`) maps them to `UnknownInput` → `tab.input === undefined`.

Only **Release Notes** and **extension-created webview panels** are actually `TabInputWebview`.

| Tab | `tab.input` type | `viewType` | Can close via API? |
| --- | --- | --- | --- |
| Settings | `undefined` | N/A (internal `workbench.editor.settings2`) | Yes, `tabGroups.close(tab)` |
| Keyboard Shortcuts | `undefined` | N/A (internal `workbench.editor.keybindings`) | Yes |
| Welcome / Getting Started | `undefined` | N/A (internal `workbench.editors.gettingStartedInput`) | Yes |
| Extensions page | `undefined` | N/A (internal `workbench.editor.extension`) | Yes |
| Release Notes | `TabInputWebview` | `'releaseNotes'` | Yes |
| Extension webview panels | `TabInputWebview` | Set by the extension | Yes |

### Tab focus workaround

There is **no public API** to activate an arbitrary tab (issue [#162446](https://github.com/microsoft/vscode/issues/162446), closed as "not planned"; issue [#188572](https://github.com/microsoft/vscode/issues/188572), backlog).

**Workaround discovered:** `workbench.action.focusNthEditorGroup` + `workbench.action.openEditorAtIndex` (0-based). The latter works via `editorService.openEditor(editor)` on the internal `EditorInput`, not `showTextDocument` — so it handles **any tab type** including Settings, Welcome, webviews.

`tabGroups.all[n].tabs` order matches visual tab bar order (confirmed in issue [#133532](https://github.com/microsoft/vscode/issues/133532)).

### Complete TabInput type list

| Type | Properties | Available since |
| --- | --- | --- |
| `TabInputText` | `uri: Uri` | 1.63 |
| `TabInputTextDiff` | `original: Uri`, `modified: Uri` | 1.63 |
| `TabInputTextMerge` | `base: Uri`, `input1: Uri`, `input2: Uri`, `result: Uri` | 1.75 |
| `TabInputWebview` | `viewType: string` | 1.63 |
| `TabInputCustom` | `uri: Uri`, `viewType: string` | 1.63 |
| `TabInputNotebook` | `uri: Uri`, `notebookType: string` | 1.63 |
| `TabInputNotebookDiff` | `original: Uri`, `modified: Uri`, `notebookType: string` | 1.63 |
| `TabInputTerminal` | _(none)_ | 1.63 |
| `TabInputInteractive` | `uri: Uri`, `inputBoxUri: Uri` | newer |
| `TabInputChat` | _(none)_ | newer |
| `TabInputMultiDiff` | `textDiffs: TabInputTextDiff[]` | newer |
| `undefined` | _(null input)_ | — |

Sources: `src/vs/workbench/api/common/extHostTypes.ts`, issue [#158853](https://github.com/microsoft/vscode/issues/158853), issue [#145680](https://github.com/microsoft/vscode/issues/145680).

---

## R-7: Git-deleted files

**Status:** ⏳ needs research

### What to determine
- Can a deleted file from git history be opened?
- How is it represented in TabInput? (presumably `TabInputTextDiff` or `TabInputText` with git: scheme)
- What URI scheme? `git:`, `gitfs:`?

---

## R-8: Preview mode setting

**Status:** ⏳ needs research

### What to determine
- `workspace.getConfiguration('workbench.editor').get('enablePreview')` — readable?
- `workspace.getConfiguration('workbench.editor').update('enablePreview', value)` — writable?
- Or is it `workspace.getConfiguration('workbench').get('editor.enablePreview')`?
- Does the window need to be reloaded after change?

---

## R-9 — R-12

**Status:** ⏳ needs research

Task descriptions — in SPEC.md, section "Research tasks".
