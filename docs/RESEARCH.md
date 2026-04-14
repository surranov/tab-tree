# Research — Nested Open Editors v2

> Результаты технических исследований. Ссылки, findings, API capabilities, ограничения.
> Этот файл — источник правды для технических решений.

---

## Полезные ссылки

- [VS Code Extension API — TreeView](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code API Reference — TreeDataProvider](https://code.visualstudio.com/api/references/vscode-api#TreeDataProvider)
- [VS Code API Reference — TabGroups](https://code.visualstudio.com/api/references/vscode-api#TabGroups)
- [VS Code Source — Explorer](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/files/browser)
- [VS Code Source — fileActions.contribution.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.contribution.ts)
- [VS Code Source — fileCommands.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileCommands.ts)

---

## R-1: TreeDataProvider API

**Статус:** ✅ завершён

### Возможности

- `getTreeItem(element)` + `getChildren(element?)` — основной интерфейс
- `window.createTreeView(viewId, { treeDataProvider, showCollapseAll, canSelectMany, dragAndDropController })`
- `TreeView.reveal(element, { select, focus, expand })` — программное раскрытие и выделение

### TreeItem properties

| Свойство | Что даёт |
|---|---|
| `label` | основной текст |
| `description` | вторичный текст (правее, приглушённо) |
| `tooltip` | hover |
| `iconPath` | `Uri \| ThemeIcon \| {light, dark}` |
| `resourceUri` | **ключевое** — автоматически подтягивает иконку из file-icon theme + git decorations |
| `contextValue` | строка для `when`-условий в context menu |
| `collapsibleState` | `Collapsed \| Expanded \| None` |
| `command` | команда при клике |

### Ключевой факт

**`resourceUri`** — если задать файловый Uri, то:
1. Иконка подтягивается из активной file icon theme (бесплатно)
2. Git color decorations и badges (M, U, A) подтягиваются из встроенного git extension (бесплатно)
3. Любой зарегистрированный `FileDecorationProvider` применяется автоматически

### Drag & Drop

Через `TreeDragAndDropController<T>`:
- `dragMimeTypes` / `dropMimeTypes`
- `handleDrag(source, dataTransfer)` / `handleDrop(target, dataTransfer)`
- D&D в editor area работает через `resourceUri`
- D&D из кастомного дерева в нативный Explorer — **не поддерживается**

### Ограничения

- Нет inline editing (rename прямо в дереве) — только через `showInputBox`
- Нет возможности задать цвет label напрямую — только через `FileDecorationProvider`
- `showCollapseAll` — встроенная кнопка, но `expandAll` — нет встроенной, нужно реализовать

---

## R-2: TabGroups API

**Статус:** ✅ завершён

### Получение табов

```typescript
vscode.window.tabGroups.all          // TabGroup[]
vscode.window.tabGroups.activeTabGroup // TabGroup
group.tabs                            // Tab[]
group.activeTab                       // Tab | undefined
```

### События

```typescript
vscode.window.tabGroups.onDidChangeTabs(e => {
  e.opened   // Tab[] — открылись
  e.closed   // Tab[] — закрылись
  e.changed  // Tab[] — изменились (isDirty, isPreview, isPinned)
})

vscode.window.tabGroups.onDidChangeTabGroups(e => {
  e.opened   // TabGroup[] — новая группа
  e.closed   // TabGroup[] — закрылась
  e.changed  // TabGroup[] — фокус сменился
})
```

### Tab interface

```typescript
tab.label      // display name
tab.input      // TabInputText | TabInputCustom | TabInputNotebook | TabInputWebview | TabInputTerminal | null
tab.isDirty    // несохранённые изменения
tab.isActive   // активен в своей группе
tab.isPreview  // preview mode (italic)
tab.isPinned   // pinned
tab.group      // родительский TabGroup
```

### Типы TabInput

| Тип | Поля | Наш интерес |
|---|---|---|
| `TabInputText` | `uri: Uri` | ✅ основной — текстовые файлы |
| `TabInputCustom` | `uri: Uri`, `viewType: string` | ✅ кастомные редакторы |
| `TabInputNotebook` | `uri: Uri`, `notebookType: string` | ✅ Jupyter notebooks |
| `TabInputWebview` | `viewType: string` | ⚠️ нет URI — Settings, Welcome, etc. |
| `TabInputTerminal` | (пусто) | ⚠️ нет URI — терминалы |
| `TabInputTextDiff` | `original: Uri`, `modified: Uri` | ⚠️ два URI — diff |
| `TabInputNotebookDiff` | `original: Uri`, `modified: Uri` | ⚠️ два URI |
| `null` | — | неизвестный тип |

### Мутации

```typescript
await vscode.window.tabGroups.close(tab)          // единственная мутация
await vscode.window.tabGroups.close([tab1, tab2])
```

### Gotchas

- **Multiple fires:** `onDidChangeTabs` может срабатывать 2-3 раза на одно действие — это by design (issue #146786). **Нужен debounce.**
- **Preview replacement:** когда preview tab заменяется другим — приходит `closed` + `opened`, а не `changed`
- `onDidOpenTextDocument` / `onDidCloseTextDocument` — **ненадёжны** для отслеживания табов (document ≠ tab)

---

## R-3: Контекстное меню Explorer — исходный код VS Code

**Статус:** ✅ завершён

### Группы меню (порядок)

```
navigation       → New File, New Folder, Open to Side, Open With
2_workspace      → Add/Remove Folder from Workspace
3_compare        → Select for Compare, Compare with Selected
5_cutcopypaste   → Cut, Copy, Paste
5b_importexport  → Download, Upload
6_copypath       → Copy Path, Copy Relative Path
7_modification   → Rename, Delete
```

### Команды, принимающие URI аргумент (можно вызывать из extension)

| Command ID | Надёжность | Механизм |
|---|---|---|
| `explorer.openWith` | ✅ надёжно | `getResourceForCommand` — URI приоритет |
| `selectForCompare` | ✅ надёжно | `getResourceForCommand` |
| `compareFiles` | ✅ надёжно | `getResourceForCommand` |
| `revealFileInOS` | ✅ надёжно | `getResourceForCommand` |
| `explorer.openToSide` | ⚠️ условно | `getMultiSelectedResources` — URI в fallback |
| `copyFilePath` | ⚠️ условно | `getMultiSelectedResources` — URI в fallback |
| `copyRelativeFilePath` | ⚠️ условно | `getMultiSelectedResources` — URI в fallback |

**"Условно"** = URI используется только если нативный Explorer не сфокусирован. Workaround: вызывать через свой wrapper, который гарантирует что Explorer не в фокусе, или реализовать самостоятельно.

### Команды, НЕ принимающие URI (нужна своя реализация)

| Command ID | Почему | Наша реализация |
|---|---|---|
| `renameFile` | `explorerService.getContext(false)` — internal state | `showInputBox` + `workspace.fs.rename` |
| `moveFileToTrash` | `explorerService.getContext(true)` — internal state | `showWarningMessage` + `workspace.fs.delete({ useTrash: true })` |
| `deleteFile` | `explorerService.getContext(true)` — internal state | `showWarningMessage` + `workspace.fs.delete` |
| `explorer.newFile` | `openExplorerAndCreate` — internal state | `showInputBox` + `workspace.fs.writeFile` |
| `explorer.newFolder` | `openExplorerAndCreate` — internal state | `showInputBox` + `workspace.fs.createDirectory` |
| `filesExplorer.cut` | internal clipboard | не реализуем (low priority) |
| `filesExplorer.copy` | internal clipboard | не реализуем (low priority) |
| `filesExplorer.paste` | internal clipboard | не реализуем (low priority) |

---

## R-4: FileDecorationProvider

**Статус:** ✅ завершён

### Как работает

Если задать `TreeItem.resourceUri = fileUri`, то встроенный git extension автоматически применяет:
- Цвет label (modified → оранжевый, untracked → зелёный, ignored → серый)
- Badge (M, U, A, D, C, R)
- Подсветка контролируется настройками `explorer.decorations.colors` и `explorer.decorations.badges`

### Propagation на папки

`FileDecoration.propagate: true` — распространяет decoration на родительские узлы.
**Вопрос:** работает ли propagation автоматически для кастомного TreeView, или нужно реализовать руками? → **Нужно проверить при реализации.**

### Known issues

- Issue #187756: кастомная `FileDecoration.color` может конфликтовать с git colors
- Issue #209907: decorations иногда не рендерятся при первой установке → workaround: `onDidChangeFileDecorations.fire()` после активации

---

## R-5: Существующие расширения

**Статус:** ✅ завершён

| Расширение | Установки | Подход | Ограничения |
|---|---|---|---|
| Open Editors Tree View (`alexlapwood`) | ~160 | TreeDataProvider + tabGroups | не поддерживается активно |
| Open Editors Hierarchy (`ssk7`) | ~69 | tabGroups | non-text excluded, performance warning 100+ |
| Better Open Editors | — | package.json detection | meta tabs не видны |
| Nested Open Editors v1 (`surranov`) | — | TreeDataProvider | проблемы с синхронизацией, deprecated |

**Общее для всех:** ни одно не реплицирует полный контекстный Explorer menu, ни одно не обрабатывает нефайловые табы полноценно.

---

## R-6: Нефайловые табы в TabGroups API

**Статус:** ⏳ нужно исследовать

### Что нужно выяснить
- Как Settings tab представлен? `TabInputWebview` с каким `viewType`?
- Как Extension Settings представлены?
- Как Keyboard Shortcuts tab представлен?
- Welcome tab?
- Доступна ли иконка / displayable name из API?
- Можно ли их программно закрыть через `tabGroups.close()`?

---

## R-7: Git-deleted файлы

**Статус:** ⏳ нужно исследовать

### Что нужно выяснить
- Можно ли открыть удалённый файл из git history?
- Как он представлен в TabInput? (предположительно `TabInputTextDiff` или `TabInputText` с git: scheme)
- Какой URI scheme? `git:`, `gitfs:`?

---

## R-8: Preview mode setting

**Статус:** ⏳ нужно исследовать

### Что нужно выяснить
- `workspace.getConfiguration('workbench.editor').get('enablePreview')` — читается?
- `workspace.getConfiguration('workbench.editor').update('enablePreview', value)` — записывается?
- Или нужно `workspace.getConfiguration('workbench').get('editor.enablePreview')`?
- Нужно ли перезагружать окно после изменения?

---

## R-9 — R-12

**Статус:** ⏳ нужно исследовать

Описание задач — в SPEC.md, раздел "Задачи исследования".
