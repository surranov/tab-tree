# Decision Log — Nested Open Editors v2

> Каждое решение фиксируется здесь с обоснованием. Формат: дата, ID, решение, альтернативы, почему так.
> ID решения совпадает с OQ-* из SPEC.md, если решение закрывает открытый вопрос.

---

## D-001: Подход к реализации — TreeDataProvider

**Дата:** 2026-04-14
**Закрывает:** —

**Решение:** кастомный `TreeDataProvider` в sidebar — единственный жизнеспособный подход.

**Отвергнутые альтернативы:**

| Альтернатива | Почему не подходит |
|---|---|
| Подмена data source нативного Explorer | Нет публичного API. Explorer завязан на ~15 internal сервисов VS Code |
| Fork Explorer из исходников VS Code | Explorer не самостоятельный модуль — зависит от `IExplorerService`, `IInstantiationService`, `IContextKeyService` и др. Невозможно извлечь без переписывания половины VS Code. Ломался бы с каждым обновлением |
| `FileSystemProvider` (virtual FS in native Explorer) | Слишком сложно, не даёт нужного контроля над деревом, проблемы с контекстным меню |
| WebviewView (HTML-based tree) | Нет нативных file icons, нет git decorations, нет keyboard nav, accessibility, плохая интеграция. Больше работы, хуже результат |

**Обоснование:** TreeDataProvider даёт:
- Нативные file icons через `resourceUri` — бесплатно
- Git decorations через `resourceUri` — бесплатно
- Нативную keyboard navigation и accessibility
- Контекстное меню через `view/item/context`
- D&D через `TreeDragAndDropController`
- `TreeView.reveal()` для follow-active-file

---

## D-002: API для отслеживания табов — tabGroups

**Дата:** 2026-04-14
**Закрывает:** —

**Решение:** `window.tabGroups` API + `onDidChangeTabs` / `onDidChangeTabGroups`

**Отвергнутая альтернатива:** `onDidOpenTextDocument` / `onDidCloseTextDocument` — ненадёжно: document может быть открыт без видимого таба (background load), и не закрыт при закрытии таба.

**Gotcha:** debounce обязателен (50-100ms) — события могут приходить по 2-3 штуки на одно действие (by design, issue #146786).

---

## D-003: Rename/Delete — своя реализация

**Дата:** 2026-04-14
**Закрывает:** —

**Решение:** реализуем Rename и Delete самостоятельно через `workspace.fs` API.

**Причина:** встроенные команды `renameFile`, `moveFileToTrash`, `deleteFile` не принимают URI аргумент — завязаны на internal `explorerService.getContext()`. Проверено по исходникам VS Code.

**Реализация:**
- Rename: `window.showInputBox({ value: currentName })` → `workspace.fs.rename(oldUri, newUri)`
- Delete: `window.showWarningMessage('Delete?', 'Move to Trash', 'Delete Permanently')` → `workspace.fs.delete(uri, { useTrash })` или `workspace.fs.delete(uri, { recursive })`

---

## D-004: New File / New Folder — своя реализация

**Дата:** 2026-04-14
**Закрывает:** —

**Решение:** аналогично D-003 — `showInputBox` + `workspace.fs.writeFile` / `workspace.fs.createDirectory`.

**Причина:** `explorer.newFile` и `explorer.newFolder` используют `openExplorerAndCreate()` — internal function, зависящая от текущего выделения в нативном Explorer.

---

## D-005: Tab Groups — секции по группам

**Дата:** 2026-04-14
**Закрывает:** OQ-1

**Решение:** дерево разбивается на секции по editor groups. Каждая группа — root-узел ("Group 1", "Group 2", ...), внутри — своё поддерево папок и файлов. Файл, открытый в двух группах, отображается в обеих.

**Отвергнутая альтернатива:** одно общее дерево (ближе к JetBrains, но теряется информация о том, в какой группе файл).

---

## D-006: Compact folders — нет

**Дата:** 2026-04-14
**Закрывает:** OQ-2

**Решение:** всегда полная вложенность. Каждая папка — отдельный узел. Compact folders не реализуем.

---

## D-007: Расположение view — Explorer sidebar

**Дата:** 2026-04-14
**Закрывает:** OQ-8

**Решение:** view размещается в Explorer sidebar (`viewsContainers.explorer`). Пользователь может перетащить в другое место вручную (стандартная возможность VS Code).

---

## D-008: Сортировка — алфавитная

**Дата:** 2026-04-14
**Закрывает:** OQ-3

**Решение:** алфавитная сортировка, папки сверху — как в нативном Explorer.

---

## D-009: Терминалы — не показывать

**Дата:** 2026-04-14
**Закрывает:** OQ-7

**Решение:** `TabInputTerminal` пропускается. Терминалы не относятся к файловому дереву.

---

## D-010: Diff editors — показывать modified

**Дата:** 2026-04-14
**Закрывает:** OQ-5

**Решение:** `TabInputTextDiff` — в дереве показывается `modified` URI. Original игнорируется. Логика: modified — тот файл, который редактируется.

---

## D-011: Pinned tabs — визуальная индикация

**Дата:** 2026-04-14
**Закрывает:** OQ-6

**Решение:** pinned табы получают визуальный индикатор (badge или decoration). `tab.isPinned` доступен через API.

---

## D-012: Multi-root workspaces — поддерживаем сразу

**Дата:** 2026-04-14
**Закрывает:** OQ-4

**Решение:** поддержка multi-root с первой версии. Каждый workspace folder — отдельный корневой узел в дереве. Файлы из каждого folder группируются под своим root.

---

## D-013: Название — Tab Tree

**Дата:** 2026-04-14

**Решение:** extension name: `tab-tree`, display name: `Tab Tree`.

**Отвергнутые альтернативы:** Canopy (красиво, но не мгновенно понятно), TreeTabs (менее броское), Arbor (абстрактно).

**Обоснование:** максимальная ясность + searchability. "Tabs as a tree" — сразу понятно, легко вспомнить через год.

---

## Все решения — сводка

| ID | Вопрос | Решение |
| --- | --- | --- |
| D-001 | Подход | TreeDataProvider |
| D-002 | Tab tracking | tabGroups API |
| D-003 | Rename/Delete | Своя реализация через workspace.fs |
| D-004 | New File/Folder | Своя реализация через workspace.fs |
| D-005 | Tab Groups | Секции по группам |
| D-006 | Compact folders | Нет, полная вложенность |
| D-007 | Расположение | Explorer sidebar |
| D-008 | Сортировка | Алфавитная, папки сверху |
| D-009 | Терминалы | Не показывать |
| D-010 | Diff editors | Показывать modified |
| D-011 | Pinned tabs | Визуальная индикация |
| D-012 | Multi-root | Поддерживаем сразу |
| D-013 | Название | Tab Tree |
