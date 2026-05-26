# Decision Log — Tab Tree

> Every decision is recorded here with reasoning. Format: date, ID, decision, alternatives, rationale.
> Decision IDs match OQ-* from SPEC.md when a decision closes an open question.

---

## D-001: Implementation approach — TreeDataProvider

**Date:** 2026-04-14
**Closes:** —

**Decision:** Custom `TreeDataProvider` in sidebar — the only viable approach.

**Rejected alternatives:**

| Alternative | Why it doesn't work |
|---|---|
| Override native Explorer data source | No public API. Explorer depends on ~15 internal VS Code services |
| Fork Explorer from VS Code source | Explorer is not a standalone module — depends on `IExplorerService`, `IInstantiationService`, `IContextKeyService`, etc. Impossible to extract without rewriting half of VS Code. Would break with every update |
| `FileSystemProvider` (virtual FS in native Explorer) | Too complex, insufficient tree control, context menu issues |
| WebviewView (HTML-based tree) | No native file icons, no git decorations, no keyboard nav, no accessibility, poor integration. More work, worse result |

**Rationale:** TreeDataProvider provides:
- Native file icons via `resourceUri` — free
- Git decorations via `resourceUri` — free
- Native keyboard navigation and accessibility
- Context menu via `view/item/context`
- D&D via `TreeDragAndDropController`
- `TreeView.reveal()` for follow-active-file

---

## D-002: Tab tracking API — tabGroups

**Date:** 2026-04-14
**Closes:** —

**Decision:** `window.tabGroups` API + `onDidChangeTabs` / `onDidChangeTabGroups`

**Rejected alternative:** `onDidOpenTextDocument` / `onDidCloseTextDocument` — unreliable: a document can be opened without a visible tab (background load) and not closed when the tab is closed.

**Gotcha:** Debounce is mandatory (50-100ms) — events can fire 2-3 times per single action (by design, issue #146786).

---

## D-003: Rename/Delete — custom implementation

**Date:** 2026-04-14
**Closes:** —

**Decision:** Implement Rename and Delete ourselves via `workspace.fs` API.

**Reason:** Built-in commands `renameFile`, `moveFileToTrash`, `deleteFile` don't accept a URI argument — they depend on internal `explorerService.getContext()`. Verified in VS Code source.

**Implementation:**
- Rename: `window.showInputBox({ value: currentName })` → `WorkspaceEdit.renameFile` + `workspace.applyEdit` (→ D-016)
- Move: `showOpenDialog` → `WorkspaceEdit.renameFile` + `workspace.applyEdit` (→ D-016)
- Delete: `window.showWarningMessage('Delete?', 'Move to Trash', 'Delete Permanently')` → `workspace.fs.delete(uri, { useTrash })` or `workspace.fs.delete(uri, { recursive })`

---

## D-004: New File / New Folder — custom implementation

**Date:** 2026-04-14
**Closes:** —

**Decision:** Same as D-003 — `showInputBox` + `workspace.fs.writeFile` / `workspace.fs.createDirectory`.

**Reason:** `explorer.newFile` and `explorer.newFolder` use `openExplorerAndCreate()` — internal function dependent on current selection in native Explorer.

---

## D-005: Tab Groups — sections per group

**Date:** 2026-04-14
**Closes:** OQ-1

**Decision:** Tree is split into sections by editor groups. Each group is a root node ("Group 1", "Group 2", ...), with its own subtree of folders and files. A file open in two groups appears in both.

**Rejected alternative:** Single shared tree (closer to JetBrains, but loses information about which group a file belongs to).

---

## D-006: Compact folders — no

**Date:** 2026-04-14
**Closes:** OQ-2

**Decision:** Always full nesting. Each folder is a separate node. Compact folders not implemented.

---

## D-007: View placement — Explorer sidebar

**Date:** 2026-04-14
**Closes:** OQ-8

**Decision:** View is placed in Explorer sidebar (`viewsContainers.explorer`). User can drag it elsewhere manually (standard VS Code capability).

---

## D-008: Sorting — alphabetical

**Date:** 2026-04-14
**Closes:** OQ-3

**Decision:** Alphabetical sorting, folders on top — same as native Explorer.

---

## D-009: Terminals — don't show

**Date:** 2026-04-14
**Closes:** OQ-7

**Decision:** `TabInputTerminal` is skipped. Terminals don't belong in the file tree.

---

## D-010: Diff editors — show modified

**Date:** 2026-04-14
**Closes:** OQ-5

**Decision:** `TabInputTextDiff` — tree shows the `modified` URI. Original is ignored. Rationale: modified is the file being edited.

---

## D-011: Pinned tabs — visual indicator

**Date:** 2026-04-14
**Closes:** OQ-6

**Decision:** Pinned tabs get a visual indicator (badge or decoration). `tab.isPinned` is available via API.

---

## D-012: Multi-root workspaces — supported from day one

**Date:** 2026-04-14
**Closes:** OQ-4

**Decision:** Multi-root support from v1. Each workspace folder is a separate root node in the tree. Files from each folder are grouped under their root.

---

## D-013: Name — Tab Tree

**Date:** 2026-04-14

**Decision:** Extension name: `tab-tree`, display name: `Tab Tree`.

**Rejected alternatives:** Canopy (beautiful but not instantly clear), TreeTabs (less catchy), Arbor (abstract).

**Rationale:** Maximum clarity + searchability. "Tabs as a tree" — immediately understandable, easy to recall after a year.

---

## D-014: Drag between tab groups — move, not copy

**Date:** 2026-04-14 (revised 2026-04-15)

**Decision:** Dragging a file from the tree to another editor group moves it (closes in the source group). Implemented **synchronously inside `handleDrop`**: `handleDrag` stores source paths + groupIndex in a private map, `handleDrop` opens each file in the target group via `vscode.open`, then looks up the source tab in `tabGroups.all` by path and closes it. No event subscriptions, no pending state, no timeouts.

**Rejected alternative 1:** Keep native VS Code behavior (copy). Inconvenient — user must manually close the source tab after each drag.

**Rejected alternative 2 (original implementation):** Observer pattern via `onDidChangeTabs`: store pending drag sources, react to `opened` events, close source with a 3s cleanup timeout. Rejected on revision — too much moving state (class-level pending map, timeout handle, disposables, race conditions if drop cancelled or tabs fire during drag). Synchronous lookup in `tabGroups.all` after `await vscode.open` is simpler and equally reliable because the tab state is already updated by the time the promise resolves.

**Edge cases:**

- Drop in same group → no-op (`sourceGroupIndex === targetGroupIndex` skip)
- Drop on empty folder / undefined target → target resolves to `activeTabGroup.viewColumn`
- Drop cancelled → `handleDrop` never fires; next successful drop clears stale `dragSources` at start
- File open in multiple groups → `dragSources` map keys by path with the originating groupIndex, only that group's tab is closed
- Folder drag → `collectDragSources` walks children recursively
- Source tab not found (closed externally during drag) → graceful no-op

---

## D-015: DnD testing — unit tests on controller methods only

**Date:** 2026-04-14

**Decision:** DnD is tested exclusively via direct `handleDrag`/`handleDrop` calls + simulated `onDidChangeTabs` in unit tests. E2E DnD testing is not feasible.

**Approaches investigated:**

| Approach | Works | Why |
|---|---|---|
| vscode-extension-tester (Selenium) | No | Selenium `dragAndDrop` on Electron is unreliable — `dragstart`/`drop` events don't fire via synthetic mouse events. [webdriverio#6596](https://github.com/webdriverio/webdriverio/issues/6596) |
| Playwright + Electron | No | VS Code as Playwright target is not implemented. [playwright#22351](https://github.com/microsoft/playwright/issues/22351), status P3 |
| VS Code API programmatic trigger | No | No public API for programmatic drag on TreeView. DnD goes through internal IPC Extension Host ↔ renderer |
| Direct handleDrag/handleDrop calls | **Yes** | Controller methods are regular public methods, called directly. Covers business logic completely |

**Re-check on updates:** Playwright issue #22351 (VS Code as target), vscode-extension-tester DnD support.

---

## D-016: Rename/Move — WorkspaceEdit.renameFile instead of workspace.fs.rename

**Date:** 2026-04-14

**Decision:** `tabTree.rename` and `tabTree.move` use `WorkspaceEdit.renameFile()` + `workspace.applyEdit()` instead of `workspace.fs.rename()`.

**Reason:** `workspace.fs.rename()` is a direct FS operation, doesn't trigger `onWillRenameFiles`. Language servers (TypeScript LSP, etc.) don't learn about the rename → imports are not updated.

| Mechanism | File renamed | `onWillRenameFiles` | Import update |
|---|---|---|---|
| `workspace.fs.rename()` | yes | **no** | **no** |
| `WorkspaceEdit.renameFile()` + `applyEdit` | yes | **yes** | **yes** |

**Sources:** [vscode#113925](https://github.com/microsoft/vscode/issues/113925), [vscode#43768](https://github.com/microsoft/vscode/issues/43768), [VS Code API docs](https://code.visualstudio.com/api/references/vscode-api) — `onWillRenameFiles` fires only for `workspace.applyEdit`.

**Code:**
```typescript
const edit = new vscode.WorkspaceEdit();
edit.renameFile(oldUri, newUri);
await vscode.workspace.applyEdit(edit);
```

---

## D-017: Non-file tab focus — focusNthEditorGroup + openEditorAtIndex

**Date:** 2026-04-15

**Decision:** Clicking a non-file tab node (Settings, Welcome, webview, etc.) in the tree focuses it via two internal commands: `workbench.action.focusNthEditorGroup` (to activate the correct group) + `workbench.action.openEditorAtIndex` (0-based, to activate the tab within that group).

**Why not `vscode.open`:** `vscode.open` requires a file URI. Non-file tabs (Settings, Welcome, webviews) don't have one.

**Why not label-to-command mapping:** Would require maintaining a map of known tab labels to their opening commands. Labels can be localized. The index approach is universal — works for any tab type without special-casing.

**Risk:** `openEditorAtIndex` is not in the public API documentation but exists in VS Code source (`editorCommands.ts`). It operates on internal `EditorInput` via `editorService.openEditor()`, not `showTextDocument`, so it handles all editor types. Tab index may become stale between tree rebuild and click, but the 80ms debounce minimizes this window.

**Sources:** Issue [#55205](https://github.com/microsoft/vscode/issues/55205), PR [#56441](https://github.com/microsoft/vscode/pull/56441), VS Code `editorCommands.ts`.

---

## D-018: Non-file tab close — findVscodeTab fallback by label + group

**Date:** 2026-04-15

**Decision:** `findVscodeTab()` first tries to match by `fsPath` (for file-based tabs). If no match is found, falls back to matching by `tab.label === filePath && group.viewColumn === groupIndex` (for webview / unknown tabs where `filePath` stores the label).

**Why:** Non-file tabs (`TabInputWebview`, `undefined` input) don't have a file URI. The existing `fsPath` matching never finds them. Label + group matching is the only viable strategy since `tabGroups.close()` requires the actual `Tab` object.

**Edge case:** Duplicate labels in the same group (two extension webviews with the same title) could match the wrong tab. This is rare enough to accept.

---

## D-019: WebView toggle scope — only WebView, not all "special" tabs

**Date:** 2026-04-17

**Decision:** The "Show/Hide WebView Tabs" toolbar toggle controls **only** `TabInputWebview`-typed tabs. Notebook (`TabInputNotebook`, `TabInputNotebookDiff`), Custom (`TabInputCustom`), and Diff (`TabInputTextDiff`) tabs are always visible regardless of the setting. Terminal tabs remain excluded by design (D-009).

**Rejected alternative:** A broader "Show Special Tabs" toggle that would group all non-file-scheme tabs (webview + custom + notebook-diff, etc.) behind a single switch.

**Rationale:**

- Notebook, Custom, and TextDiff tabs are backed by real files on disk — hiding them would lose real content the user is editing. They belong to the file tree.
- WebView-backed tabs (Settings, Welcome, Preview, extension panels) are the only category that is purely UI with no underlying file — the only category where "noise vs. information" trade-off is real.
- A single-category toggle is easier to name and reason about ("Show WebView Tabs") than a vague "Show Special Tabs" that would require the user to remember which types fall under "special".

**Implementation:**

- Configuration: `tabTree.showWebViewTabs: boolean` (default `true`, Global target).
- Filter: `TabTracker.extractTabInfo` returns `undefined` for `tabType === 'webview'` when the setting is off — same pattern already used for Terminal (D-009).
- Commands: `tabTree.showWebViewTabs` / `tabTree.hideWebViewTabs` (paired, mirrors `enableFollowActiveFile` / `disableFollowActiveFile`).
- Toolbar: paired navigation buttons with `browser` / `window` codicons, gated by the `tabTree.showWebViewTabs` context key.

**Default:** `true`. On first install the user sees everything they've opened — no hidden content surprises. They can turn it off per preference.

---

## All decisions — summary

| ID | Question | Decision |
| --- | --- | --- |
| D-001 | Approach | TreeDataProvider |
| D-002 | Tab tracking | tabGroups API |
| D-003 | Rename/Delete | Custom implementation via workspace.fs |
| D-004 | New File/Folder | Custom implementation via workspace.fs |
| D-005 | Tab Groups | Sections per group |
| D-006 | Compact folders | No, full nesting |
| D-007 | Placement | Explorer sidebar |
| D-008 | Sorting | Alphabetical, folders on top |
| D-009 | Terminals | Don't show |
| D-010 | Diff editors | Show modified |
| D-011 | Pinned tabs | Visual indicator |
| D-012 | Multi-root | Supported from day one |
| D-013 | Name | Tab Tree |
| D-014 | DnD between groups | Move (not copy) |
| D-015 | DnD testing | Unit tests on controller methods only |
| D-016 | Rename/Move API | WorkspaceEdit.renameFile (not workspace.fs.rename) |
| D-017 | Non-file tab focus | focusNthEditorGroup + openEditorAtIndex |
| D-018 | Non-file tab close | findVscodeTab fallback by label + group |
| D-019 | WebView toggle scope | Only webview tabs, not notebook/custom/diff |
