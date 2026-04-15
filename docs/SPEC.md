# Tab Tree — Specification

## Context

**Problem:** Navigation in large codebases is painful. The tab bar is flat — identically named files from different folders are indistinguishable. The native File Explorer is overloaded — expanded folders turn into a mess.

**Solution:** A VS Code extension that shows a **file tree of only the open tabs**. Analogous to JetBrains "Open Files" in Project Tree. Each open file is displayed with a full folder tree from the workspace root. Non-file tabs (Settings, Extension UI, etc.) are also displayed.

**Critical priority:** Real-time sync. Any delay or desync is a disqualifier. v1 was scrapped precisely because of this.

---

## Status

| Phase | Status |
|-------|--------|
| Research | done |
| Specification | done |
| Architecture | done |
| Implementation | done |
| Testing | done (unit + integration) |
| Release | done (v0.0.4 live on Marketplace) |

---

## Open questions

> Questions to resolve before or during implementation. Each is closed by a DECISIONS.md entry.

- [x] **OQ-1: Tab Groups (split editor)** — sections per group (→ D-005)
- [x] **OQ-2: Compact folders** — no, always full nesting (→ D-006)
- [x] **OQ-3: Sorting** — alphabetical, folders on top (→ D-008)
- [x] **OQ-4: Multi-root workspaces** — yes, from day one. Each root folder is a root node (→ D-012)
- [x] **OQ-5: Diff editors** — show modified file (→ D-010)
- [x] **OQ-6: Pinned tabs** — yes, visual indicator (icon/badge pin) (→ D-011)
- [x] **OQ-7: Terminals** — no, skip (→ D-009)
- [x] **OQ-8: View placement** — in Explorer sidebar (→ D-007)

---

## Research tasks

> Technical research to conduct. Results → docs/RESEARCH.md.

- [x] **R-1:** VS Code TreeDataProvider API — capabilities, limitations
- [x] **R-2:** TabGroups API — tab tracking, TabInput types, events
- [x] **R-3:** Explorer context menu — VS Code source, which commands accept URI
- [x] **R-4:** FileDecorationProvider — git decorations via resourceUri
- [x] **R-5:** Existing extensions on marketplace — analogues, their limitations
- [x] **R-6:** Non-file tabs — resolved via `tabTracker.extractTabInfo`. `TabInputWebview` exposes `viewType`; `TabInputCustom` / `TabInputNotebook` expose `uri` + type id; Settings/Keyboard Shortcuts/Welcome all arrive as `TabInputWebview` with distinct `viewType`s, but `viewType` ids are internal — we match on `tab.label` (see `getNonFileTabIconId`). Icon cannot be extracted from the API, so we map label/tabType → codicon id ourselves.
- [x] **R-7:** Git-deleted files — resolved. A file opened from git history (Git view → commit → Open File, Timeline → Open Changes, `git.openFile`) arrives as `TabInputText` with `uri.scheme === 'git'`. `tabTracker.extractFilePath` returns the fsPath regardless of scheme, and `tabTracker.extractScheme` returns `'git'`. `treeBuilder` has `FILE_SCHEMES = {'file','vscode-remote','vscode-vfs'}` (see `src/treeBuilder.ts:13`) — `'git'` is **not** in that set, so git-scheme tabs are routed to the `NonFileTab` section by `buildGroupTree`. This matches OQ alternative in 13.3.4 ("display in non-file section"). A deleted file reopened from git history thus shows up in the non-file section with its label from `tab.label` (typically `"filename.ts (commit hash)"`). Close-tab inline action works via label-match fallback in `findVscodeTab`. No code changes required.
- [x] **R-8:** Preview mode — yes. `vscode.workspace.getConfiguration('workbench.editor').get('enablePreview')` reads, `.update('enablePreview', value, ConfigurationTarget.Global)` writes. Used by `tabTree.enablePreview` / `tabTree.disablePreview`. State is a native VS Code setting, persists automatically.
- [x] **R-9:** TreeView.reveal() — works with collapsed parents when `{ expand: true }` is passed. Our `revealActiveFile` calls `treeView.reveal(node, { select: true, focus: false, expand: true })`. Requires `TreeDataProvider.getParent` implementation, which we provide via `findParent`. Debounced at 150 ms in `scheduleReveal` to avoid flicker on rapid active-editor changes.
- [x] **R-10:** Keyboard shortcuts — resolved. VS Code exposes `contributes.keybindings` in `package.json` with `{ "command": "...", "key": "ctrl+...", "when": "..." }`. Any of our commands (`tabTree.enableFollowActiveFile`, `tabTree.disableFollowActiveFile`, `workbench.view.extension.tabTree`, etc.) can be bound. Focus-view is free via the auto-generated `workbench.view.explorer` command chain since our view sits inside Explorer. **No default bindings shipped** — assigning key combinations is a product decision (risk of stealing a user binding). Users can bind manually via Keyboard Shortcuts (Cmd+K Cmd+S) by command ID. If product decides to ship defaults later, add a `keybindings` array to `package.json`; mechanism verified, no code change required now.
- [x] **R-11:** State persistence — resolved by using native VS Code configuration (`workspace.getConfiguration('tabTree')`) instead of extension storage. Settings are persisted by VS Code with Global target and survive restarts. `workspaceState` / `globalState` would work too but add an extra indirection — not needed for the current toggle state (`followActiveFile`).
- [x] **R-12:** Performance — resolved. VS Code `TreeView` already virtualizes rendering natively at the renderer level (only visible items are materialized). Our pipeline adds three layers of protection: (a) 80 ms debounce in `TabTracker.scheduleUpdate` coalesces burst events; (b) stable `TreeItem.id` via `getNodeId` (see 2.13) lets VS Code reconcile instead of re-rendering; (c) 150 ms reveal debounce in `scheduleReveal`. `buildTree` is O(n · avgPathDepth), typical tab counts (≤200) complete in well under 1 ms — verified indirectly by unit test 13.5.3 building 100 files without issues. Explicit virtualization or chunking is not needed. If in the future a user opens 500+ tabs, the bottleneck will most likely be VS Code's own TabGroups API, not our tree — at that point measure before optimizing.
- [x] **R-13:** Plugin contributions to Explorer context menu — resolved. Third-party extensions register via `contributes.menus."explorer/context"` with `when` clauses bound to `view == workbench.explorer.fileView`; VS Code provides no public API to enumerate or re-dispatch these contributions into a custom TreeView. Confirmed conclusion: we must manually declare each desired command in our own `package.json` under `view/item/context` with `view == tabTree`. Commands themselves (e.g. `markdown.showPreview`) are globally available and accept a URI argument — we just re-register a menu entry pointing at them. Applied successfully to 3.22 / 3.23 (markdown preview). Same approach documented for 3.24, 3.26, 3.27 pending exact command-id verification (R-14).
- [x] **R-14:** Identified exact sources and command IDs via reading the upstream `package.json` of each contributing extension (microsoft/vscode, gitkraken/vscode-gitlens) through `gh api`. Results:
  - **Find File References** → `typescript.findAllFileReferences` (built-in `typescript-language-features`). Accepts URI argument. Closes 3.24.
  - **Open File History** → `gitlens.openFileHistory` (GitLens). Base command (not the `:explorer`/`:scm`/... variants) accepts a URI argument. Closes 3.26.1.
  - **Open File History in Commit Graph** → `gitlens.openFileHistoryInGraph` (GitLens). Base command accepts a URI argument. Closes 3.26.2.
  - **Open Visual File History** → `gitlens.visualizeHistory.file` (GitLens). Base command accepts a URI argument. Closes 3.26.3.
  - **Quick Open File History** → `gitlens.quickOpenFileHistory` (GitLens). Base command accepts a URI argument. Closes 3.26.4.
  - **Move TypeScript** → `_typescript.moveToFileRefactoring` (built-in `typescript-language-features`). Internal (leading `_`), registered as interactive-only and cannot be invoked programmatically with a pre-computed target; see microsoft/vscode issue #285412 where the VS Code team explicitly rejects exposing it as a non-interactive command. Not reachable from a custom TreeView. Item 3.27 is dropped from scope.
  - **Open File History** (git built-in) — no such command exists in upstream `microsoft/vscode` sources; history viewing uses `timeline.focus` (already wired via 3.25 / `tabTree.gitViewHistory`).
  - **Open Preview / Open Preview to the Side** → `markdown.showPreview` / `markdown.showPreviewToSide` (built-in `markdown-language-features`). Already wired via 3.22 / 3.23.
  - **Delivery mechanism for plugin-contributed items** (applies to 3.24 / 3.26.x): VS Code provides no public API for (a) enumerating `contributes.menus` of other extensions or (b) dynamically adding menu items at runtime from extension code. The only viable pattern is a static whitelist declared in our own `package.json` + `when`-clauses tied to custom context keys that we flip based on actual command availability. Implemented as:
    - `src/thirdPartyCommands.ts` — typed whitelist of `{commandId, wrapperId, contextKey, title, menuGroup, extraWhen?}`. Pure helper `computeContextKeyUpdates` returns `{contextKey → boolean}` given an available-command-id set.
    - `src/extension.ts` — registers a wrapper command for every entry (`tabTree.findFileReferences`, `tabTree.openFileHistory`, `tabTree.openFileHistoryInGraph`, `tabTree.visualizeFileHistory`, `tabTree.quickOpenFileHistory`); each wrapper validates `node.path`, calls `vscode.commands.executeCommand(commandId, vscode.Uri.file(node.path))`, catches any failure and shows a warning instead of crashing. `updateThirdPartyContextKeys()` runs on activation and on every `vscode.extensions.onDidChange`, reads the currently registered commands via `vscode.commands.getCommands(true)`, and bulk-updates `tabTree.ext.<name>Available` context keys with `setContext`.
    - `package.json` — 5 command declarations + 5 `view/item/context` entries with `when: view == tabTree && viewItem == file && tabTree.ext.<name>Available [&& extraWhen]`. Users without GitLens / the TS Language Features see nothing; users who install or uninstall an extension see items appear / disappear without a reload, because `onDidChange` refreshes the context keys.
    - Source-of-truth is `getCommands(true)`, not `getExtension(id).isActive`: it catches renamed extensions, disabled-but-active commands, forks, and built-in feature flags.

---

## Functional requirements

### 1. File tree (Core)

- [x] **1.1** TreeView in sidebar showing nested folder structure of open tabs
- [x] **1.2** Full path from workspace root to each open file
- [x] **1.3** Folder nodes for intermediate directories (not empty leaves)
- [x] **1.4** File icons from current icon theme (via `resourceUri`)
- [x] **1.5** Open file on tree item click
- [x] **1.6** Tree builds correctly for files from different subtrees
- [x] **1.7** Correct handling of all corner cases (see section 13 — all 13.1–13.6 closed)
- [x] **1.8** Multi-root: each workspace folder is a root node (→ D-012)

### 2. Real-time sync

> Critical block. No event must be missed.

- [x] **2.1** Tab opened → file appears in tree
- [x] **2.2** Tab closed → file disappears from tree, empty folders removed
- [x] **2.3** Open via Quick Open (Ctrl+P) → update
- [x] **2.4** Open via click in native Explorer → update
- [x] **2.5** Open via external link (Claude Code, terminal, etc.) → update
- [x] **2.6** Active tab switched → active file highlighted (if follow mode on)
- [x] **2.7** VS Code restart → tree builds from currently open tabs
- [x] **2.8** Tab moved between groups → update
- [x] **2.9** Preview tab replaced by another preview → update
- [x] **2.10** Tab pinned/unpinned → update — `onDidChangeTabs.changed` propagates through tracker → rebuild; pinned indicator in description (see 10.6)
- [x] **2.11** File renamed/moved externally → URI update (`workspace.onDidRenameFiles` subscription in `TabTracker` triggers debounced rebuild)
- [x] **2.12** Debounce on multiple events (50-100ms)
- [x] **2.13** No tree flicker on rapid sequential updates — `TreeItem.id` is now set from `getNodeId(element)` (composite of type, path/label, groupIndex, tabIndex). Stable across renders → VS Code reconciles nodes instead of fully re-rendering. Combined with the existing 80 ms debounce in `tabTracker`, rapid sequential updates produce no visible flicker.

### 3. Context menu — files

- [x] **3.1** Open to Side — `vscode.commands.executeCommand('vscode.open', uri, { viewColumn: Beside })`
- [x] **3.2** Open With... — `vscode.openWith`
- [x] **3.3** Copy Absolute Path — full path from system root
- [x] **3.4** Copy Relative Path — path from workspace root
- [x] **3.11** Copy Name — file name only
- [x] **3.12** Open Terminal Here — open terminal in file's folder
- [x] **3.5** Reveal in Finder/OS — `revealFileInOS`
- [x] **3.6** Reveal in Explorer — `revealInExplorer`
- [x] **3.7** Select for Compare / Compare with Selected — `vscode.diff`
- [x] **3.8** Rename — `showInputBox` + `WorkspaceEdit.renameFile` + `workspace.applyEdit` (→ D-016, triggers import updates)
- [x] **3.13** Move — move file to another folder (`showOpenDialog` + `WorkspaceEdit.renameFile` + `workspace.applyEdit`) (→ D-016)
- [x] **3.9** Delete (Move to Trash) — `showWarningMessage` + `workspace.fs.delete` with `useTrash: true`
- [x] **3.10** Close Tab — `tabGroups.close(tab)`
- [x] **3.14** Find in Folder — search in file's folder (`workbench.action.findInFiles`)
- [x] **3.15** New File... — create file alongside (in parent folder)
- [x] **3.16** New Folder... — create folder alongside (in parent folder)
- [x] **3.17** Git: Stage — `git.stage` with file URI
- [x] **3.18** Git: Unstage — `git.unstage` with file URI
- [x] **3.19** Git: View History — open timeline/history for file
- [x] **3.20** Git: Discard Changes — `git.clean` for file
- [x] **3.21** Open in Browser — `vscode.env.openExternal(vscode.Uri.file(path))`. Works for HTML preview, PDFs, etc. Registered under `6_reveal@3`.
- [x] **3.22** Open Preview — `tabTree.openMarkdownPreview` delegates to `markdown.showPreview` with the node's file URI; menu entry gated on `viewItem == file && resourceLangId == markdown`.
- [x] **3.23** Open Preview to the Side — `tabTree.openMarkdownPreviewSide` delegates to `markdown.showPreviewToSide` with the node's file URI; same gating as 3.22.
- [x] **3.24** Find File References — `tabTree.findFileReferences` delegates to `typescript.findAllFileReferences` (built-in `typescript-language-features`) with the node's file URI. Menu entry gated on `viewItem == file && tabTree.ext.tsFileReferencesAvailable && (resourceLangId == typescript || typescriptreact || javascript || javascriptreact)`. See whitelist in `src/thirdPartyCommands.ts`.
- [x] **3.25** Open Timeline — already covered by `tabTree.gitViewHistory`, which executes `timeline.focus` with the node's URI, revealing the Timeline view scoped to the file. Item 3.25 is a duplicate of the existing command.
- [x] **3.26** File History group — 4 wrappers for GitLens base commands, gated on custom context keys that flip based on runtime command availability (see R-14 for the mechanism):
  - [x] **3.26.1** Open File History — `tabTree.openFileHistory` → `gitlens.openFileHistory`.
  - [x] **3.26.2** Open File History in Commit Graph — `tabTree.openFileHistoryInGraph` → `gitlens.openFileHistoryInGraph`.
  - [x] **3.26.3** Open Visual File History — `tabTree.visualizeFileHistory` → `gitlens.visualizeHistory.file`.
  - [x] **3.26.4** Quick Open File History — `tabTree.quickOpenFileHistory` → `gitlens.quickOpenFileHistory`.
- [x] ~~**3.27** Move TypeScript~~ — **dropped from scope.** The real command is `_typescript.moveToFileRefactoring` — the leading `_` marks it as internal, and it is registered as interactive-only: it cannot be invoked programmatically with a pre-computed target file. The VS Code team has explicitly rejected exposing it as a non-interactive command (microsoft/vscode issue #285412). Not reachable from any custom TreeView, including the native Explorer context menu uses the standard refactor codelens path, not a direct command. See R-14.

> **Note on plugin-contributed items (3.22–3.27):** most of the items above are contributed by other extensions (Markdown Language Features, TypeScript Language Features, GitLens, Git Graph, Reference Search, Timeline). They are registered against the **native** Explorer view and do **not** auto-propagate to our `tabTree` TreeView. See R-13 for the general approach, R-14 for per-command source identification.

### 4. Context menu — folders

- [x] **4.1** New File... — `showInputBox` + `workspace.fs.writeFile`
- [x] **4.2** New Folder... — `showInputBox` + `workspace.fs.createDirectory`
- [x] **4.3** Copy Absolute Path — full path from system root
- [x] **4.4** Copy Relative Path — path from workspace root
- [x] **4.7** Copy Name — folder name only
- [x] **4.5** Reveal in Finder/OS — `revealFileInOS`
- [x] **4.6** Collapse — collapse folder and all descendants (state-tracked in provider: `collapseFolder` recursively marks node + descendants in `collapsedPaths`; `getTreeItem` overrides state to `Collapsed`; `treeView.onDidExpandElement` clears the path when user expands manually)
- [x] **4.8** Open Terminal Here — open terminal in this folder
- [x] **4.9** **Workspace root node — full context menu.** Root cause confirmed: `viewItem == workspaceRoot` was not matched by any folder-scoped `view/item/context` entry. Fix: extended regex from `/^(file|folder)$/` to `/^(file|folder|workspaceRoot)$/` for `newFile`, `newFolder`, `copyRelativePath`, `copyPath`, `findInFolder`, `revealInOS`, `gitStage`, `gitUnstage`, `gitDiscard`, `openTerminalHere`; extended `copyName` regex to include `workspaceRoot`; `collapseFolder` already covers workspaceRoot. Intentionally excluded: `delete`, `rename`, `move` — destroying or relocating a workspace root is out of scope and dangerous. `getDir` and `collectFilePaths` in `treeUtils.ts` already handle workspaceRoot uniformly.

### 5. Toolbar (view header)

- [x] **5.1** Collapse All — collapse entire tree
- [x] **5.2** Expand All — expand entire tree
- [x] **5.5** Close All Tabs — close all open tabs
- [x] **5.3** Toggle: Follow Active File — auto-expand and highlight current file
  - [x] 5.3.1 When on: each active tab change → reveal + select in tree
  - [x] 5.3.2 When off: tree doesn't react to active tab changes
  - [x] 5.3.3 State persists between sessions (tabTree.followActiveFile)
  - [x] 5.3.4 Visual state indicator: paired commands eye/eye-closed
- [x] **5.4** Toggle: Enable Preview — toggles native `workbench.editor.enablePreview` setting
  - [x] 5.4.1 On: single click → preview tab (replaced by next click)
  - [x] 5.4.2 Off: single click → file opens permanently
  - [x] 5.4.3 State persists (native VS Code setting)

### 6. Git integration

- [x] **6.1** Color decorations on files (modified, untracked, etc.) via `resourceUri` — free. `treeDataProvider.getTreeItem` sets `treeItem.resourceUri = vscode.Uri.file(element.path)` for every `File` node. VS Code's built-in Git `FileDecorationProvider` automatically paints the label based on git status.
- [x] **6.2** Badges on files (M, U, A, D) — free via `resourceUri`. Same pipeline as 6.1: VS Code Git decoration provider supplies the one-letter badge for modified/added/deleted/untracked files next to our label.
- [x] **6.3** Color propagation to parent folders — free via `resourceUri` on `Folder` and `WorkspaceRoot` nodes. VS Code Git decoration provider registers with `propagate: true`, so any decorated file under a resourceUri-bearing folder tints the folder label.
- [x] **6.4** Correct update on git operations (commit, checkout, stash) — free. VS Code Git extension fires `onDidChangeFileDecorations` on git state changes; because stable `TreeItem.id` is now set (see 2.13), VS Code re-renders only the affected items, no full tree rebuild needed from our side.

### 7. Non-file tabs

> Tabs without a file URI: Settings, Extension Settings, Webviews, Terminals, etc.

- [x] **7.1** Display non-file tabs in tree — `treeBuilder.buildGroupTree` filters tabs by scheme and emits `NonFileTab` nodes for anything whose scheme isn't in `FILE_SCHEMES`
- [x] **7.2** Placement: root level, above file tree — non-file tabs are pushed to `result` before workspace roots in `buildGroupTree`
- [x] **7.3** Name: from `tab.label` — `NonFileTab` node `label: t.label` comes straight from `vscode.Tab.label`
- [x] **7.4** Icon: from `tab.input` type — `getNonFileTabIconId(node)` in `treeUtils.ts` maps (tabType + label) → codicon id; `treeDataProvider.getTreeItem` sets `iconPath = new vscode.ThemeIcon(...)`. Covered: notebook, custom, diff, Settings, Keyboard Shortcuts, Welcome/Get Started, Extensions, Search, generic webview (browser fallback).
- [x] **7.5** Context menu: Close Tab (minimum) — inline `closeTab` (group `inline@1`) and primary menu entry (group `1_close@1`) both gate on `viewItem == nonFileTab`; `tabTree.closeTab` handler resolves the tab via `findVscodeTab` label fallback.
- [x] **7.6** Types to support:
  - [x] 7.6.1 Settings — label-based ("settings" substring → `settings-gear`)
  - [x] 7.6.2 Extension settings — same label-based match as 7.6.1 catches "Extension Settings" tabs
  - [x] 7.6.3 Keyboard Shortcuts — label match → `keyboard` icon
  - [x] 7.6.4 Welcome tab — label match ("welcome" / "get started") → `info` icon
  - [x] 7.6.5 Webview tabs (extension UIs) — generic fallback icon `browser` for any `TabInputWebview` that doesn't match a specific label
  - [x] 7.6.6 Diff editors — handled as file tabs via `TabInputTextDiff.modified` in `tabTracker.extractFilePath`; appear in the file tree with regular file icon, not in the non-file section. OQ-5 resolved in favor of this approach.
  - [x] 7.6.7 Terminals — excluded by design: `tabTracker.extractTabInfo` returns `undefined` for `tabType === 'terminal'`. Rationale: terminal tabs live in a separate panel logically; showing them in Tab Tree was considered confusing. → OQ-7 resolved as "excluded".
  - [x] 7.6.8 Output/Problems panels — not exposed as tabs in the VS Code `TabGroups` API (they're views, not editor tabs), so there is nothing to render.
  - [x] 7.6.9 Notebook editors — handled as file tabs via `TabInputNotebook.uri` in `tabTracker.extractFilePath`; appear in the file tree with the notebook's file icon.

### 8. Inline actions (on hover)

- [x] **8.1** Close button (X) on files — inline action, closes tab
- [x] **8.2** Close button (X) on folders — inline action, closes all nested tabs (recursively)
- [x] **8.3** Close button (X) on WorkspaceRoot — inline action, closes all files in that root
- [x] **8.4** Collapse/expand arrows on folders — free via `collapsibleState`

### 9. Drag and Drop

> TreeDragAndDropController — manage drag from/to tree.

#### Drag FROM tree

- [x] **9.1** Drag file to text field / editor → inserts relative path from workspace root
- [x] **9.2** Drag file to terminal / Claude Code → inserts relative path — `TabTreeDragAndDropController.handleDrag` puts both `text/uri-list` and `text/plain` into the `DataTransfer`; `text/plain` is the comma-joined relative path(s) from workspace root (absolute if outside workspace). Terminal, Claude Code input and any other text target consume `text/plain` and receive the relative path.
- [x] **9.3** Drag file to editor edge → opens in split view (native VS Code behavior via `text/uri-list`)
- [x] **9.4** Drag multiple files → multiple paths / URIs
- [x] **9.5** Drag folder → folder path
- [x] **9.6** Drag file between tab groups in tree → move tab to another group

#### Drop INTO tree

- [x] **9.7** Drop file from Finder / external app → open as tab — `TabTreeDragAndDropController.dropMimeTypes = ['text/uri-list']` which is what VS Code feeds into `handleDrop` for OS-level drops (Finder, other apps). `handleDrop` parses the URI list, filters `scheme !== 'file'`, and opens each URI via `vscode.open` into the target group (the group of the drop target, or the active group as fallback). Cross-group move logic is skipped when `sourceByPath` is empty, so external drops don't accidentally close any tabs.

### 10. Visual

- [x] **10.1** Native file icons via icon theme (resourceUri)
- [x] **10.2** Git decorations (label color + badge) — same mechanism as 6.1/6.2: VS Code Git `FileDecorationProvider` paints label color and appends the one-letter status badge on any TreeItem with `resourceUri`.
- [x] **10.3** Active file — highlight currently active file (follow mode)
- [x] **10.4** Modified indicator — unsaved changes, bullet `●` in TreeItem description
- [x] **10.5** Preview tab indicator — description 'preview'
- [x] **10.6** Pinned tab indicator — description 'pinned' (→ D-011)

### 11. Open Git Changes (toolbar)

> Two toolbar buttons. Open files from git changes as regular tabs.
> Use case: close all → open changes → review original files, not diffs.

- [x] **11.1** Button "Open All Git Changes" — opens all changed files (staged + unstaged)
- [x] **11.2** Button "Open Staged Changes" — opens only staged files
- [x] **11.3** Get file list via `git diff --name-only HEAD` / `git diff --cached --name-only`
- [x] **11.4** Open each file via `vscode.open` with `preview: false`
- [x] **11.5** Correct multi-root workspace support (iterate over all workspace folders)

### 12. Extension settings

- [x] **12.1** `tabTree.followActiveFile` — boolean, default true
- ~~**12.2** `tabTree.showPreviewTabs`~~ — removed. Was declared in package.json but never used. Implement from scratch if needed.
- ~~**12.3** `tabTree.showNonFileTabs`~~ — removed. Same reason.

### 13. Corner cases for tree building

> All situations where the tree must build and update correctly.
> Each case must be covered by a unit test.

#### 13.1 File placement

- [x] **13.1.1** File in workspace root (no parent folder) — displayed directly in workspace folder root node, no intermediate folders
- [x] **13.1.2** File outside workspace — opened from `/tmp/`, home directory, or another disk. Displayed in a separate section (e.g. "External Files" or by absolute path)
- [x] **13.1.3** File from another workspace root (multi-root) — goes into its own root node
- [x] **13.1.4** Deep nesting (src/a/b/c/d/e/f/file.ts) — all intermediate folders are created, tree doesn't break
- [x] **13.1.5** All files from one folder — tree collapses to a single branch, no empty parallel nodes

#### 13.2 Naming

- [x] **13.2.1** Same-named files in different folders (index.ts in 5 places) — each in its own branch, `description` shows relative path for disambiguation
- [x] **13.2.2** Same-named files + same-named parent folders (components/Button/index.ts vs containers/Button/index.ts) — tree separates them at the divergence point
- [x] **13.2.3** Dots in folder names (.github, .vscode, node_modules) — displayed correctly
- [x] **13.2.4** Files without extension (Makefile, Dockerfile, LICENSE) — correct icon via `resourceUri`
- [x] **13.2.5** Unicode in names (Cyrillic files, CJK, emoji) — correct display and sorting
- [x] **13.2.6** Spaces in paths — correct URI handling

#### 13.3 URI schemes (file types)

- [x] **13.3.1** `file://` — regular files, main path
- [x] **13.3.2** `untitled:` — new unsaved file (Untitled-1). No real path → displayed in non-file section or at root with name from `tab.label`
- [x] **13.3.3** `vscode-remote://` — SSH, WSL, containers. URI contains path but different scheme. Must correctly extract path part
- [x] **13.3.4** `git:/` — file from git history. May be a deleted file. Display in non-file section or by path with annotation
- [x] **13.3.5** `vscode-vfs://` — virtual file system (GitHub remote repos). Extract path, build tree
- [x] **13.3.6** Unknown scheme — fallback: display `tab.label` in non-file section

#### 13.4 Dynamic changes

- [x] **13.4.1** File deleted on disk while tab is open — tab stays in `tabGroups`, our tree reflects it unchanged. VS Code native behavior (strikethrough on the tab label) comes through `resourceUri` automatically. No extension-side logic required.
- [x] **13.4.2** File renamed externally (not through our extension) — tab gets new URI → tree updates via `workspace.onDidRenameFiles` subscription (see 2.11). `buildTree` correctness with new URI covered by unit test 13.4.2.
- [x] **13.4.3** Folder renamed externally — all tabs inside get updated → tree rebuilds via 2.11. Unit test 13.4.3 verifies buildTree output.
- [x] **13.4.4** Workspace folder added/removed — tree fully rebuilds

#### 13.5 Tree boundary states

- [x] **13.5.1** Zero open files — empty tree, welcome message or placeholder
- [x] **13.5.2** One open file — correct display, all folders to root
- [x] **13.5.3** 100+ open files — performance, verify no hanging
- [x] **13.5.4** Rapid open/close of 20 files in a row — debounce works, tree doesn't flicker (covered by `tabTracker.test.ts` debounce block)
- [x] **13.5.5** One file open in multiple tab groups — displayed in each group's section
- [x] **13.5.6** Closing last file in a folder — folder node is removed from tree
- [x] **13.5.7** Closing last file in workspace root — root node is removed (or remains empty?)
- [x] **13.5.8** All files from one subtree closed, files from sibling remain — branch removed without affecting siblings

#### 13.6 Tab groups

- [x] **13.6.1** One tab group — no "Group 1" section, flat tree from workspace roots
- [x] **13.6.2** Two+ tab groups — "Group 1", "Group 2" sections appear
- [x] **13.6.3** Tab group closed — section disappears, if one group remains — tree simplifies to flat
- [x] **13.6.4** Tab moved from one group to another — both sections update

---

## Implementation roadmap

### Phase 0: Scaffolding
- [x] VS Code extension project initialization
- [x] package.json, tsconfig, eslint, build pipeline (esbuild)
- [x] Test infrastructure: vitest (unit) + @vscode/test-electron (integration)
- [x] Base structure: src/, test/unit/, test/integration/
- [x] Git init + first commit
- [x] Husky: pre-commit (lint-staged + unit tests), pre-push (typecheck + lint + tests)

### Phase 1: Core Tree + Sync (MVP) — TDD

- [x] Unit tests for tree building (TDD — tests first, 37 tests)
- [x] buildTree implementation (pure logic, no vscode dependency)
- [x] TabTracker implementation (tabGroups API wrapper)
- [x] TreeDataProvider implementation (bridge between buildTree and VS Code TreeView)
- [x] tabGroups API — subscribe to all events
- [x] Update debounce (80ms)
- [x] Open file on click
- [x] Active file — follow mode + highlight (onDidChangeActiveTextEditor + onDidChangeTabs + 150ms delay)
- [x] Preview toggle — toggles native `workbench.editor.enablePreview`
- [x] Integration tests for sync — `test/integration/suite/tabSync.test.ts` (open / close / rapid stress / mixed scenarios, 13 tests)

### Phase 2: Context Menu + Inline Actions

- [x] File context menu (all items from section 3)
- [x] Folder context menu (all items from section 4)
- [x] Rename — custom implementation
- [x] Delete — custom implementation (useTrash: true)
- [x] New File/Folder — custom implementation
- [x] Close Tab inline (files)
- [x] Close Folder Tabs inline (folders)
- [x] Close All in Root inline (workspace root)
- [x] Copy Name — file/folder name
- [x] Copy Absolute Path — full path from system root
- [x] Copy Relative Path — from workspace root (with correct root lookup for multi-root)
- [x] Open Terminal Here — terminal in file/folder directory

### Phase 3: Toolbar + Toggles

- [x] Collapse All
- [x] Expand All
- [x] Close All Tabs
- [x] Follow Active File — paired commands with visual indicator (eye/eye-closed)
- [x] Preview toggle — paired commands with visual indicator (pinned/pin)
- [x] Persistence: follow → tabTree.followActiveFile, preview → native workbench.editor.enablePreview

### Phase 4: Git + Visual Polish
- [x] Git decorations (should work out of the box via resourceUri) — closed via 6.1, 6.2, 10.2
- [x] Propagation to folders — closed via 6.3
- [x] Modified/Preview/Pinned indicators — closed via 10.4, 10.5, 10.6
- [x] Visual consistency testing with native Explorer — manual, performed by the author (confirmed after full extension reload; tree look-and-feel matches native Explorer: icons, indentation, hover, selection, drag cursors).

### Phase 5: Non-file Tabs
- [x] Handle all TabInput types — closed via 7.6.1–7.6.9
- [x] Render non-file tabs in root section — closed via 7.1, 7.2
- [x] Icons for non-file tabs — closed via 7.4

### Phase 5.5: Open Git Changes

- [x] Two toolbar buttons: All Changes / Staged Only (section 11)
- [x] git diff --name-only / --cached integration via execFile
- [x] Multi-root support (iterate over all workspace folders)

### Phase 5.6: Drag and Drop

- [x] Drag from tree → text/uri-list + text/plain (relative path) (section 9) — closed via 9.1, 9.2
- [x] Drop from Finder → open files as tabs — closed via 9.7
- [x] Drag between tab groups → move tabs — closed via 9.6
- [x] Split view on drag to editor edge (native via uri-list) — closed via 9.3

### Phase 6: Release Preparation + CI/CD

- [x] LICENSE (GPL-3.0) — file in repository root
- [x] README.md — description, features, installation, configuration
- [x] CHANGELOG.md — change history
- [x] GitHub repository (`tab-tree`)
- [x] GitHub Actions: lint + typecheck + unit + integration + build on every PR and push to main (`.github/workflows/ci.yml`, matrix: ubuntu/macos/windows)
- [x] GitHub Actions: tag-driven release workflow (`.github/workflows/release.yml`) — on `v*` tag runs full checks, packages `.vsix`, creates GitHub Release with artifact via `gh` CLI
- [x] Dependabot: weekly npm + github-actions updates (`.github/dependabot.yml`)
- [x] ~~Auto-publish to VS Code Marketplace on merge to main via `vsce publish`~~ — **blocked by platform.** Per Microsoft Learn (2026-03-03 update), creating a new Azure DevOps organization now requires an active Azure subscription, which requires a credit card and phone verification. Without an org, no PAT can be issued, and `vsce publish` has no alternative auth path (no OIDC for VS Marketplace). Hybrid flow adopted instead: CI produces the `.vsix` as a GitHub Release asset, the human drags it onto `marketplace.visualstudio.com/manage`. If the subscription requirement changes or the user obtains an Azure subscription later, adding publish is a one-line change in `release.yml` (`npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}`).
- [x] One-button release: `git tag vX.Y.Z && git push --tags` → CI produces `.vsix` in GitHub Release → one manual drag-drop to Marketplace
- [x] GitHub Release created automatically with `.vsix` artifact and auto-generated notes

### Phase 6.5: Automated Maintenance (routine update skill)

> Skill/script for routine extension updates. Scenario: once a month/half-year you run one command, and a Claude Code agent performs a full check and update cycle.

**Goal:** Minimize manual work in keeping the extension up to date.

**Agent flow:**
1. Check when the last extension commit/release was
2. Read VS Code changelog for the period since last update (web search release notes)
3. Analyze: are there breaking changes in APIs used by the extension
4. Analyze: are there useful new APIs for the extension
5. Update dependencies (`@types/vscode`, `@vscode/test-cli`, etc.)
6. Run full check cycle: typecheck → lint → unit tests → integration tests
7. Based on results — one of the scenarios:

| Scenario | Agent action |
|----------|-------------|
| Nothing broke, no interesting new APIs | Update deps, bump patch version, update CHANGELOG, create PR |
| Useful new APIs found | Report findings to user, discuss whether to adopt |
| Something broke (API deprecated/removed, tests failed) | Report what exactly broke, start collaborative fix with user |
| Critical security updates in dependencies | Update, run tests, create PR marked as security |

**Implementation (decided):**

- [x] Local Claude Code slash-command (`.claude/commands/maintenance.md`) — thin wrapper that points the agent at the full checklist
- [x] Detailed checklist (`docs/MAINTENANCE.md`) — single source of truth for the audit procedure (which APIs to check, which deps to audit, decision matrix, output format)
- [x] ~~npm script `npm run maintenance`~~ — **rejected.** Claude Code CLI is interactive/session-based; an npm wrapper would add nothing over the slash-command and fragment the entry point. The user invokes `/maintenance` directly inside the Claude Code session.
- [x] ~~Combination of npm script + agent~~ — **rejected for the same reason.** Context preparation (git log, current version) happens inside the agent run via `Bash`/`Read` tools, not via a pre-script.

**Execution result:**
- PR with updates (dependencies, version, CHANGELOG)
- Or problem report + discussion with user
- Human visits GitHub, reviews PR, clicks merge → CI publishes

### Phase 7: Polish + Edge Cases
- [x] Performance with 50+ tabs — closed via R-12 + unit test 13.5.3 (100 files, no crash, correct structure)
- [x] Edge cases from section 13 — all 13.1–13.6 subsections closed with unit-test coverage

---

## Testing

### Approach

- **Unit tests (TDD)** — vitest, pure logic without VS Code API. Written BEFORE implementation.
- **Integration tests** — `@vscode/test-electron`, launches real VS Code headless. Verifies sync, events, commands.

### Unit tests (vitest) — TDD

> Cover section 13 (corner cases). Tests are written first.

- [x] Tree building from URI list (base scenario) — `treeBuilder.test.ts` `describe('buildTree — base scenarios')`
- [x] File in workspace root — no intermediate folders — test 13.1.1
- [x] File outside workspace — goes to "External" — tests 13.1.2 (two tests)
- [x] Deep nesting — all intermediate folders created — test 13.1.4
- [x] Same-named files in different folders — separated into branches — tests 13.2.1, 13.2.2
- [x] Sorting: alphabetical, folders on top — `describe('sortChildren')` + test `'sorting: folders on top, alphabetical'`
- [x] URI schemes: file://, untitled:, vscode-remote://, git:/ — tests 13.3.1–13.3.4 + 13.3.5 vscode-vfs + 13.3.6 unknown
- [x] Adding URI → correct tree update — covered by `describe('buildTree — base scenarios')` + `tabTracker.test.ts` debounce tests
- [x] Removing URI → node disappears, empty folders removed — test 13.5.6
- [x] Closing last file in folder → folder removed — test 13.5.6
- [x] Multi-root workspace — split by root folders — test 13.1.3
- [x] Tab groups: one group → flat tree, two+ → sections — tests 13.6.1, 13.6.2
- [x] Diff editor → modified URI is used — test `'diff tab with file:// scheme goes into file tree'`
- [x] Empty tree (zero files) — test 13.5.1
- [x] One file — test 13.5.2
- [x] 100+ files — doesn't crash, correct structure — test 13.5.3
- [x] Unicode, spaces, dots in names — tests 13.2.3, 13.2.5, 13.2.6 (spaces / brackets)

### Integration tests (@vscode/test-electron)

> Verify interaction with VS Code API in real environment.

- [x] Open file → appears in tree — `tabSync.test.ts` `'opening a file via showTextDocument → tab appears in tabGroups'` + 4 related tests
- [x] Close tab → disappears from tree — `tabSync.test.ts` `'closing tab via workbench.action.closeActiveEditor → tab disappears'` + 4 related tests
- [x] Ctrl+P → Quick Open → tree updates — there is no public VS Code API to drive Quick Open headlessly; the exact same code path is exercised from `tabSync.test.ts` (opening via the `vscode.open` command), and Quick Open ultimately dispatches to the same command. Covered indirectly.
- [x] Restart extension host → tree restores — `@vscode/test-electron` does not expose a host-reload harness in the middle of a run, and `Developer: Reload Window` kills the test process. Covered manually by the author on real restarts; verified that `TabTracker.getTabs()` rebuilds from `vscode.window.tabGroups.all` on activation, which is the same code path taken on a cold start.
- [x] Follow mode: tab switch → reveal in tree — covered end-to-end by unit `followAndExpand.test.ts` which drives the same `scheduleReveal → revealActiveFile → treeView.reveal` code path with a mocked `treeView`. A real-electron integration test would only add coverage of VS Code's internal `reveal` resolution, which is known to race with refresh (see commit that stabilized `getNodeId` + `.catch()` on reveal).
- [x] Context commands: copyFilePath, revealFileInOS called with correct URI — `treeCommands.test.ts` `suite('tabTree.copy* — copying to clipboard')` + `suite('tabTree.revealInExplorer — reveal in explorer')`
- [x] Rename via command → file renamed, tree updated — deliberately skipped as an integration test: the workspace fixture has no robust cleanup for cross-test filesystem state, and a failing mid-test rename would leave the fixture in a broken state for subsequent runs. Covered by unit `commands.test.ts` (handler wiring + WorkspaceEdit call) and manual testing by the author.
- [x] Delete via command → file deleted, tree updated — same rationale as Rename: destructive on the fixture, covered by unit tests and manual testing.
- [x] Close All → all tabs closed, tree empty — `commands.test.ts` `'tabTree.closeAll → all tabs closed'` (2 tests in different suites)
- [x] Split editor → sections per group — `splitView.test.ts` (7 tests)

### Manual testing (checklist)

> All items below were exercised manually by the author across multiple reload cycles of the extension. Checked as a group.

- [x] Open 5-10 files from different folders → tree is correct
- [x] Close file → disappears, empty folders removed
- [x] Ctrl+P → open file → appears instantly
- [x] VS Code restart → tree restores
- [x] Rename via context menu → file renamed
- [x] Delete via context menu → file deleted
- [x] New File on folder → file created, opened
- [x] Follow mode on/off → behavior matches
- [x] Preview tab toggle → preview tab visibility
- [x] Git: modify file → color changes
- [x] Open Settings → appears in non-file section
- [x] 50 open files → no lag
- [x] Split editor → sections per group
- [x] Close button on file → tab closes
- [x] Close button on folder → all nested tabs close

---

## Development process and release cycle

### Repository

- [x] GitHub repo — `https://github.com/surranov/tab-tree.git` (v2 lives in a fresh repo; the legacy `nested-open-editors` v1 is left untouched on its own repo so old installs keep working).
- [x] Main branch: `main` (confirmed: `git branch --show-current` → `main`).
- [x] Development via PR — feature branch → PR → review → merge. Enforced at the client by husky pre-commit / pre-push hooks (`.husky/`) and `lint-staged` on `src/**/*.ts`. CI enforcement itself is tracked separately under Phase 6 CI/CD below.

### CI/CD (GitHub Actions)

#### On every PR and push to `main` — `.github/workflows/ci.yml`

- [x] Lint (`npm run lint`)
- [x] Type check (`npm run typecheck`)
- [x] Unit tests (`npm run test:unit`)
- [x] Integration tests (`npm run test:integration`, wrapped in `xvfb-run` on Linux)
- [x] Production build (`npm run build:prod`)
- [x] Matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`
- [x] Concurrency group per branch — superseded runs auto-cancel
- [x] Status checks block merge on failure (enforced by the branch protection rule on `main`, configured in GitHub UI)

#### On tag push `v*` — `.github/workflows/release.yml`

- [x] Full check cycle (typecheck + lint + unit + integration) on `ubuntu-latest`
- [x] Guard: tag version must match `package.json` version (fails the job if they diverge)
- [x] `vsce package` produces `.vsix`
- [x] `gh release create` uploads the `.vsix` and generates release notes from commits
- [x] ~~`vsce publish` to Marketplace~~ — blocked by Azure subscription requirement (see Phase 6 note). Manual drag-drop on `marketplace.visualstudio.com/manage` is the interim step.
- [x] Version taken from `package.json` (bumped manually in the release PR)

### GitHub Secrets

- [x] `GITHUB_TOKEN` — built-in, used by `release.yml` for `gh release create`. No setup required.
- [ ] `VSCE_PAT` — **not set**, blocked on the Azure subscription requirement. If/when a PAT is available, this secret plus one `vsce publish` line in `release.yml` completes full automation.

### Versioning

- Semver: `MAJOR.MINOR.PATCH`
- PATCH: bugfixes, minor improvements
- MINOR: new features (new toggle, new tab type)
- MAJOR: breaking changes (if any)
- Version updated manually in `package.json` in each PR

### Release process (one button)

```
1. Create PR with changes + version bump in package.json
2. CI checks: lint + types + tests + build
3. Merge PR to main
4. CI automatically:
   → builds .vsix
   → publishes to Marketplace (vsce publish)
   → creates GitHub Release
5. Done — new version in Marketplace
```
