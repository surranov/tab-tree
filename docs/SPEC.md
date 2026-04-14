# Tab Tree — Спецификация

## Контекст

**Проблема:** в больших кодовых базах навигация неудобна. Список табов вверху — плоский, одноимённые файлы из разных папок неотличимы. Нативный File Explorer — перегружен, раскрытые папки превращаются в кашу.

**Решение:** VS Code расширение, которое показывает **файловое дерево только из открытых табов**. Аналог JetBrains "Open Files" в Project Tree. Каждый открытый файл отображается с полным деревом папок от workspace root. Нефайловые табы (Settings, Extension UI и т.д.) — тоже отображаются.

**Критический приоритет:** real-time синхронизация. Любая задержка или рассинхрон — disqualifier. v1 была выброшена именно из-за этого.

---

## Статус

| Этап | Статус |
|------|--------|
| Research | 🔄 в процессе |
| Спецификация | 🔄 в процессе |
| Архитектура | ⏳ ожидает |
| Реализация | ⏳ ожидает |
| Тестирование | ⏳ ожидает |
| Публикация | ⏳ ожидает |

---

## Открытые вопросы

> Вопросы, которые нужно решить до или во время реализации. Каждый закрывается записью в DECISIONS.md.

- [x] **OQ-1: Tab Groups (split editor)** — секции по группам (→ D-005)
- [x] **OQ-2: Compact folders** — нет, всегда полная вложенность (→ D-006)
- [x] **OQ-3: Сортировка** — алфавитная, папки сверху (→ D-008)
- [x] **OQ-4: Multi-root workspaces** — да, сразу. Каждый root folder — корневой узел (→ D-012)
- [x] **OQ-5: Diff editors** — показывать modified файл (→ D-010)
- [x] **OQ-6: Pinned tabs** — да, визуальная индикация (иконка/badge pin) (→ D-011)
- [x] **OQ-7: Терминалы** — нет, пропускать (→ D-009)
- [x] **OQ-8: Расположение view** — в Explorer sidebar (→ D-007)

---

## Задачи исследования

> Технический ресёрч, который нужно провести. Результаты → docs/RESEARCH.md.

- [x] **R-1:** VS Code TreeDataProvider API — возможности, ограничения
- [x] **R-2:** TabGroups API — отслеживание табов, типы TabInput, события
- [x] **R-3:** Контекстное меню Explorer — исходный код VS Code, какие команды принимают URI
- [x] **R-4:** FileDecorationProvider — git decorations через resourceUri
- [x] **R-5:** Существующие расширения на маркетплейсе — аналоги, их ограничения
- [ ] **R-6:** Нефайловые табы — как Settings, Extension Settings, Webviews представлены в TabGroups API. Какие поля доступны. Можно ли получить иконку/название.
- [ ] **R-7:** Git-deleted файлы — можно ли открыть удалённый файл из git history? Как он представлен в TabInput?
- [ ] **R-8:** Preview mode — можно ли программно читать/писать `workbench.editor.enablePreview`? Через `workspace.getConfiguration`?
- [ ] **R-9:** TreeView.reveal() — надёжность auto-reveal для follow-active-file фичи. Работает ли при collapsed parents?
- [ ] **R-10:** Keyboard shortcuts — можно ли зарегистрировать keybinding для toggle follow mode, focus view?
- [ ] **R-11:** State persistence — `workspaceState` / `globalState` для сохранения настроек toggle между сессиями
- [ ] **R-12:** Performance — поведение TreeDataProvider при 50+ открытых файлах. Нужен ли виртуальный список?

---

## Функциональные требования

### 1. Дерево файлов (Core)

- [ ] **1.1** TreeView в sidebar, показывающий nested folder structure по открытым табам
- [ ] **1.2** Полный путь от workspace root до каждого открытого файла
- [ ] **1.3** Папки-узлы для промежуточных директорий (не пустые листья)
- [ ] **1.4** Файловые иконки из текущей icon theme (через `resourceUri`)
- [ ] **1.5** Открытие файла по клику на элемент дерева
- [ ] **1.6** Дерево корректно строится для файлов из разных поддеревьев
- [ ] **1.7** Корректная обработка всех corner cases (см. раздел 11)
- [ ] **1.8** Multi-root: каждый workspace folder — корневой узел (→ D-012)

### 2. Real-time синхронизация

> Критический блок. Ни одно событие не должно быть пропущено.

- [ ] **2.1** Открытие таба → файл появляется в дереве
- [ ] **2.2** Закрытие таба → файл исчезает из дерева, пустые папки удаляются
- [ ] **2.3** Открытие через Quick Open (Ctrl+P) → обновление
- [ ] **2.4** Открытие через клик в нативном Explorer → обновление
- [ ] **2.5** Открытие через внешнюю ссылку (Claude Code, terminal, etc.) → обновление
- [ ] **2.6** Переключение активного таба → подсветка активного файла (если follow mode вкл)
- [ ] **2.7** Перезапуск VS Code → дерево строится по текущим открытым табам
- [ ] **2.8** Tab moved between groups → обновление
- [ ] **2.9** Preview tab заменён другим preview → обновление
- [ ] **2.10** Tab pinned/unpinned → обновление (если есть визуальная индикация)
- [ ] **2.11** File renamed/moved externally → обновление URI
- [ ] **2.12** Debounce на множественные события (50-100ms)
- [ ] **2.13** Нет мерцания дерева при быстрых последовательных обновлениях

### 3. Контекстное меню — файлы

- [ ] **3.1** Open to Side — `vscode.commands.executeCommand('explorer.openToSide', uri)`
- [ ] **3.2** Open With... — `explorer.openWith`
- [ ] **3.3** Copy Path — `copyFilePath`
- [ ] **3.4** Copy Relative Path — `copyRelativeFilePath`
- [ ] **3.5** Reveal in Finder/OS — `revealFileInOS`
- [ ] **3.6** Reveal in Explorer — показать файл в нативном File Explorer
- [ ] **3.7** Select for Compare / Compare with Selected — `selectForCompare` / `compareFiles`
- [ ] **3.8** Rename — `showInputBox` + `workspace.fs.rename` (своя реализация)
- [ ] **3.9** Delete (Move to Trash) — `showWarningMessage` + `workspace.fs.delete` (своя реализация)
- [ ] **3.10** Close Tab — `tabGroups.close(tab)`

### 4. Контекстное меню — папки

- [ ] **4.1** New File... — `showInputBox` + `workspace.fs.writeFile`
- [ ] **4.2** New Folder... — `showInputBox` + `workspace.fs.createDirectory`
- [ ] **4.3** Copy Path — `copyFilePath`
- [ ] **4.4** Copy Relative Path — `copyRelativeFilePath`
- [ ] **4.5** Reveal in Finder/OS — `revealFileInOS`
- [ ] **4.6** Collapse — свернуть папку и всех потомков

### 5. Toolbar (заголовок view)

- [ ] **5.1** Collapse All — свернуть всё дерево
- [ ] **5.2** Expand All — развернуть всё дерево
- [ ] **5.5** Close All Tabs — закрыть все открытые вкладки
- [ ] **5.3** Toggle: Follow Active File — авто-раскрытие и подсветка текущего файла
  - [ ] 5.3.1 При включении: каждая смена активного таба → reveal + select в дереве
  - [ ] 5.3.2 При выключении: дерево не реагирует на смену активного таба
  - [ ] 5.3.3 Состояние сохраняется между сессиями
- [ ] **5.4** Toggle: Show Preview Tabs — включение/выключение показа preview (временных) табов
  - [ ] 5.4.1 Вкл: preview табы видны в дереве (с визуальным отличием — italic?)
  - [ ] 5.4.2 Выкл: только permanently opened табы
  - [ ] 5.4.3 Состояние сохраняется между сессиями

### 6. Git интеграция

- [ ] **6.1** Цветовые decorations файлов (modified, untracked, etc.) через `resourceUri` — бесплатно
- [ ] **6.2** Badges на файлах (M, U, A, D) — бесплатно через `resourceUri`
- [ ] **6.3** Propagation цветов на родительские папки — через `FileDecorationProvider.propagate`
- [ ] **6.4** Корректное обновление при git operations (commit, checkout, stash)

### 7. Нефайловые табы

> Табы без файлового URI: Settings, Extension Settings, Webviews, Terminals, etc.

- [ ] **7.1** Отображение нефайловых табов в дереве
- [ ] **7.2** Размещение: root уровень, выше файлового дерева
- [ ] **7.3** Название: из `tab.label`
- [ ] **7.4** Иконка: из `tab.input` type (Settings → gear icon, Terminal → terminal icon, etc.)
- [ ] **7.5** Контекстное меню: Close Tab (минимум)
- [ ] **7.6** Типы для поддержки:
  - [ ] 7.6.1 Settings (`TabInputWebview` с viewId `workbench.settings`)
  - [ ] 7.6.2 Extension settings (varies)
  - [ ] 7.6.3 Keyboard Shortcuts
  - [ ] 7.6.4 Welcome tab
  - [ ] 7.6.5 Webview tabs (extension UIs)
  - [ ] 7.6.6 Diff editors (→ OQ-5)
  - [ ] 7.6.7 Terminals (→ OQ-7)
  - [ ] 7.6.8 Output/Problems panels (если являются табами)
  - [ ] 7.6.9 Notebook editors

### 8. Inline actions (при наведении)

- [ ] **8.1** Крестик (X) на файлах — inline action, закрывает таб
- [ ] **8.2** Крестик (X) на папках — inline action, закрывает все вложенные табы (рекурсивно)
- [ ] **8.3** Стрелочки collapse/expand на папках — бесплатно через `collapsibleState`

### 9. Визуал

- [ ] **9.1** Нативные file icons через icon theme
- [ ] **9.2** Git decorations (цвет label + badge)
- [ ] **9.3** Active file — выделение текущего активного файла
- [ ] **9.4** Modified indicator — unsaved changes (dot/badge)
- [ ] **9.5** Preview tab indicator — italic или другое визуальное отличие
- [ ] **9.6** Pinned tab indicator (→ D-011)

### 10. Настройки расширения (settings)

- [ ] **10.1** `tabTree.followActiveFile` — boolean, default true
- [ ] **10.2** `tabTree.showPreviewTabs` — boolean, default true
- [ ] **10.3** `tabTree.showNonFileTabs` — boolean, default true

### 11. Corner cases построения дерева

> Все ситуации, в которых дерево должно корректно строиться и обновляться.
> Каждый кейс должен быть покрыт unit-тестом.

#### 11.1 Расположение файлов

- [ ] **11.1.1** Файл в корне workspace (без родительской папки) — отображается напрямую в корневом узле workspace folder, без промежуточных папок
- [ ] **11.1.2** Файл за пределами workspace — открыт из `/tmp/`, домашней папки или другого диска. Отображается в отдельной секции (например, "External Files" или по абсолютному пути)
- [ ] **11.1.3** Файл из другого workspace root (multi-root) — попадает в свой корневой узел
- [ ] **11.1.4** Глубокая вложенность (src/a/b/c/d/e/f/file.ts) — все промежуточные папки создаются, дерево не ломается
- [ ] **11.1.5** Все файлы из одной папки — дерево схлопывается до одной ветки, не создаёт пустых параллельных узлов

#### 11.2 Именование

- [ ] **11.2.1** Одноимённые файлы в разных папках (index.ts в 5 местах) — каждый в своей ветке, `description` показывает относительный путь для различия
- [ ] **11.2.2** Одноимённые файлы + одноимённые родительские папки (components/Button/index.ts vs containers/Button/index.ts) — дерево разводит по разным веткам от точки расхождения
- [ ] **11.2.3** Точки в именах папок (.github, .vscode, node_modules) — корректно отображаются
- [ ] **11.2.4** Файлы без расширения (Makefile, Dockerfile, LICENSE) — корректная иконка через `resourceUri`
- [ ] **11.2.5** Unicode в именах (файлы на кириллице, иероглифы, эмодзи) — корректное отображение и сортировка
- [ ] **11.2.6** Пробелы в путях — корректная обработка URI

#### 11.3 URI schemes (типы файлов)

- [ ] **11.3.1** `file://` — обычные файлы, основной путь
- [ ] **11.3.2** `untitled:` — новый несохранённый файл (Untitled-1). Нет реального пути → отображается в нефайловой секции или в корне с именем из `tab.label`
- [ ] **11.3.3** `vscode-remote://` — SSH, WSL, containers. URI содержит путь, но scheme другой. Нужно корректно извлекать path part
- [ ] **11.3.4** `git:/` — файл из git history. Может быть удалённый файл. Отображать в нефайловой секции или по пути с пометкой
- [ ] **11.3.5** `vscode-vfs://` — virtual file system (GitHub remote repos). Извлекать path, строить дерево
- [ ] **11.3.6** Неизвестный scheme — fallback: отображать `tab.label` в нефайловой секции

#### 11.4 Динамические изменения

- [ ] **11.4.1** Файл удалён на диске, пока таб открыт — таб всё ещё в tabGroups, файл остаётся в дереве (VS Code сам помечает таб как deleted)
- [ ] **11.4.2** Файл переименован извне (не через наше расширение) — таб получает новый URI → дерево обновляется через `onDidChangeTabs`
- [ ] **11.4.3** Папка переименована извне — все табы внутри получают обновление → дерево перестраивается
- [ ] **11.4.4** Workspace folder добавлен/удалён — дерево перестраивается полностью

#### 11.5 Граничные состояния дерева

- [ ] **11.5.1** Ноль открытых файлов — пустое дерево, welcome message или placeholder
- [ ] **11.5.2** Один открытый файл — корректное отображение, все папки до root
- [ ] **11.5.3** 100+ открытых файлов — performance, проверить отсутствие зависаний
- [ ] **11.5.4** Быстрое открытие/закрытие 20 файлов подряд — debounce отрабатывает, дерево не мерцает
- [ ] **11.5.5** Один файл открыт в нескольких tab groups — отображается в секции каждой группы
- [ ] **11.5.6** Закрытие последнего файла в папке — папка-узел удаляется из дерева
- [ ] **11.5.7** Закрытие последнего файла в workspace root — корневой узел удаляется (или остаётся пустым?)
- [ ] **11.5.8** Все файлы из одного поддерева закрыты, файлы из соседнего остались — ветка удаляется без влияния на соседей

#### 11.6 Tab groups

- [ ] **11.6.1** Один tab group — нет секции "Group 1", дерево плоское от workspace roots
- [ ] **11.6.2** Два+ tab groups — появляются секции "Group 1", "Group 2"
- [ ] **11.6.3** Tab group закрыт — секция исчезает, если остался один group — дерево упрощается до плоского
- [ ] **11.6.4** Tab перемещён из одного group в другой — обновляются обе секции

---

## Roadmap реализации

### Phase 0: Scaffolding
- [ ] Инициализация VS Code extension проекта
- [ ] package.json, tsconfig, eslint, build pipeline (esbuild)
- [ ] Тест-инфраструктура: vitest (unit) + @vscode/test-electron (integration)
- [ ] Базовая структура: src/, test/unit/, test/integration/
- [ ] Git init + первый коммит

### Phase 1: Core Tree + Sync (MVP) — TDD
- [ ] Unit тесты на построение дерева (TDD — тесты первыми)
- [ ] Реализация TreeDataProvider
- [ ] tabGroups API — подписка на все события
- [ ] Debounce обновлений
- [ ] Открытие файла по клику
- [ ] Активный файл — подсветка
- [ ] Перезапуск VS Code — корректное восстановление
- [ ] Integration тесты на sync

### Phase 2: Context Menu
- [ ] Контекстное меню файлов (все пункты из раздела 3)
- [ ] Контекстное меню папок (все пункты из раздела 4)
- [ ] Rename — своя реализация
- [ ] Delete — своя реализация
- [ ] New File/Folder — своя реализация

### Phase 3: Toolbar + Toggles
- [ ] Collapse All / Expand All
- [ ] Follow Active File toggle
- [ ] Show Preview Tabs toggle
- [ ] Persistence состояний toggle между сессиями

### Phase 4: Git + Visual Polish
- [ ] Git decorations (должны работать из коробки через resourceUri)
- [ ] Propagation на папки
- [ ] Modified/Preview/Pinned индикаторы
- [ ] Тестирование visual consistency с нативным Explorer

### Phase 5: Non-file Tabs
- [ ] Обработка всех типов TabInput
- [ ] Рендеринг нефайловых табов в root секции
- [ ] Иконки для нефайловых табов

### Phase 6: CI/CD + Publishing
- [ ] GitHub репозиторий (использовать существующий `nested-open-editors`, force push)
- [ ] GitHub Actions: lint + build + test на каждый PR
- [ ] GitHub Actions: auto-publish в VS Code Marketplace при мёрже в main
  - [ ] `vsce` (Visual Studio Code Extension CLI) для сборки .vsix и публикации
  - [ ] Secret `VSCE_PAT` (Personal Access Token) в GitHub repo settings
  - [ ] Версионирование: автоматический bump из commit/PR или ручной в package.json
- [ ] Релиз одной кнопкой: merge PR → CI публикует автоматически
- [ ] GitHub Release создаётся автоматически с .vsix артефактом

### Phase 7: Polish + Edge Cases
- [ ] Performance при 50+ табах
- [ ] Edge cases из раздела 11 — все corner cases покрыты тестами и обработаны

---

## Тестирование

### Подход

- **Unit тесты (TDD)** — vitest, чистая логика без VS Code API. Пишутся ДО реализации.
- **Integration тесты** — `@vscode/test-electron`, запускает реальный VS Code headless. Проверяет sync, события, команды.

### Unit тесты (vitest) — TDD

> Покрывают раздел 11 (corner cases). Тесты пишутся первыми.

- [ ] Построение дерева из списка URI (базовый сценарий)
- [ ] Файл в корне workspace — без промежуточных папок
- [ ] Файл за пределами workspace — попадает в "External"
- [ ] Глубокая вложенность — все промежуточные папки создаются
- [ ] Одноимённые файлы в разных папках — разводятся по веткам
- [ ] Сортировка: алфавитная, папки сверху
- [ ] URI schemes: file://, untitled:, vscode-remote://, git:/
- [ ] Добавление URI → корректное обновление дерева
- [ ] Удаление URI → узел исчезает, пустые папки удаляются
- [ ] Закрытие последнего файла в папке → папка удаляется
- [ ] Multi-root workspace — разделение по root folders
- [ ] Tab groups: один group → плоское дерево, два+ → секции
- [ ] Diff editor → берётся modified URI
- [ ] Пустое дерево (ноль файлов)
- [ ] Один файл
- [ ] 100+ файлов — не падает, корректная структура
- [ ] Unicode, пробелы, точки в именах

### Integration тесты (@vscode/test-electron)

> Проверяют взаимодействие с VS Code API в реальном окружении.

- [ ] Открытие файла → появляется в дереве
- [ ] Закрытие таба → исчезает из дерева
- [ ] Ctrl+P → Quick Open → дерево обновляется
- [ ] Перезапуск extension host → дерево восстанавливается
- [ ] Follow mode: переключение таба → reveal в дереве
- [ ] Контекстные команды: copyFilePath, revealFileInOS вызываются с правильным URI
- [ ] Rename через команду → файл переименован, дерево обновлено
- [ ] Delete через команду → файл удалён, дерево обновлено
- [ ] Close All → все табы закрыты, дерево пустое
- [ ] Split editor → секции по группам

### Ручное тестирование (чеклист)

- [ ] Открыть 5-10 файлов из разных папок → дерево корректно
- [ ] Закрыть файл → исчезает, пустые папки убираются
- [ ] Ctrl+P → открыть файл → моментально появляется
- [ ] Перезапуск VS Code → дерево восстанавливается
- [ ] Rename через контекстное меню → файл переименован
- [ ] Delete через контекстное меню → файл удалён
- [ ] New File на папке → файл создан, открыт
- [ ] Follow mode вкл/выкл → поведение соответствует
- [ ] Preview tab toggle → видимость preview табов
- [ ] Git: изменить файл → цвет меняется
- [ ] Открыть Settings → появляется в нефайловой секции
- [ ] 50 открытых файлов → без тормозов
- [ ] Split editor → секции по группам
- [ ] Крестик на файле → таб закрывается
- [ ] Крестик на папке → все вложенные табы закрываются

---

## Процесс разработки и релизный цикл

### Репозиторий

- [ ] Использовать существующий GitHub repo `nested-open-editors` (force push нового кода)
- [ ] Основная ветка: `main`
- [ ] Разработка через PR: feature branch → PR → review → merge

### CI/CD (GitHub Actions)

#### На каждый PR:
- [ ] Lint (ESLint)
- [ ] Type check (tsc --noEmit)
- [ ] Unit тесты (jest / vitest)
- [ ] Build (esbuild / webpack → .vsix)
- [ ] Статус checks блокируют merge при провале

#### При merge в main:
- [ ] Автоматическая сборка .vsix
- [ ] Автоматическая публикация в VS Code Marketplace через `vsce publish`
- [ ] Создание GitHub Release с .vsix артефактом и changelog
- [ ] Версия берётся из `package.json` (bump вручную в PR)

### Секреты GitHub

- [ ] `VSCE_PAT` — Personal Access Token для публикации в Marketplace
  - Создаётся в https://dev.azure.com → Personal Access Tokens
  - Scope: Marketplace → Manage
  - Добавляется в repo Settings → Secrets → Actions

### Версионирование

- Semver: `MAJOR.MINOR.PATCH`
- PATCH: багфиксы, мелкие улучшения
- MINOR: новые фичи (новый toggle, новый тип табов)
- MAJOR: breaking changes (если будут)
- Версия обновляется вручную в `package.json` в каждом PR

### Процесс релиза (одна кнопка)

```
1. Создать PR с изменениями + bump версии в package.json
2. CI проверяет: lint + types + tests + build
3. Merge PR в main
4. CI автоматически:
   → собирает .vsix
   → публикует в Marketplace (vsce publish)
   → создаёт GitHub Release
5. Готово — новая версия в Marketplace
```
