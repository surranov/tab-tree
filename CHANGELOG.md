<!-- markdownlint-disable MD024 -->

# Changelog

All notable changes to Tab Tree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-04-16

### Added

- Hero screenshot in README — shows the nested tree with split editor groups, file icons, git decorations, and the full context menu.

### Changed

- Minimum VS Code version raised from 1.85.0 to 1.116.0 to match `@types/vscode`.

## [0.0.2] - 2026-04-16

### Fixed

- Split-view: both group sections rendered the same content (the last-updated group). Root cause was a `TreeItem.id` collision between duplicate `WorkspaceRoot`/`Folder` nodes across groups. Now every node inside a tab group carries its `groupIndex`, which is included in the id. Regression covered by unit tests.

## [0.0.1] - 2026-04-14

### Added

- Nested file tree view in Explorer sidebar showing open editor tabs
- Real-time sync with tab open/close/switch events (80ms debounce)
- Split editor support with per-group tree sections
- Follow active file mode with auto-reveal (configurable)
- Preview tab toggle (controls VS Code's `workbench.editor.enablePreview`)
- Context menu for files: Close, Open to Side, Open With, Copy Name/Path/Relative Path, Rename, Move, Delete, New File, New Folder, Find in Folder, Reveal in Finder, Reveal in Explorer, Select for Compare, Compare with Selected, Git Stage/Unstage/Discard/View History
- Context menu for folders: Close All in Folder, Copy Name/Path/Relative Path, New File, New Folder, Reveal in Finder, Open Terminal Here, Git Stage/Unstage/Discard, Find in Folder
- Toolbar buttons: Collapse All, Expand All, Close All, Follow Active File toggle, Preview toggle, Open All Git Changes, Open Staged Git Changes
- Inline close buttons on files and folders
- Drag and drop between editor groups (move, not copy)
- Non-file tab support (Settings, Keyboard Shortcuts, Webviews)
- Multi-root workspace support
- Rename/Move triggers import updates via `WorkspaceEdit.renameFile`
