# Tab Tree — Maintenance Checklist

> Routine update procedure for the Tab Tree extension.
> Triggered by the `/maintenance` Claude Code command (see [.claude/commands/maintenance.md](../.claude/commands/maintenance.md)).
> Run roughly every 3–6 months, or whenever the user asks.

The goal is **not** to push updates blindly. The goal is: detect drift between Tab Tree and the VS Code platform, report it, and let the user decide what to do.

---

## 1. Establish the baseline

Determine **the period to audit** — i.e. "what changed in VS Code since we last looked".

- Read `CHANGELOG.md` — find the date of the most recent published release.
- If `CHANGELOG.md` is empty or missing dates, fall back to `git log -1 --format='%aI' -- package.json` to get the last `package.json` modification.
- Note the current `engines.vscode` value from `package.json` — that's our minimum supported VS Code version.
- Note the current `version` from `package.json` — that's what we'll bump if we ship.

Report to the user:
- Period being audited (start date → today)
- Current `engines.vscode`
- Current extension version

## 2. Pull the VS Code changelog

Use **WebFetch** (or **WebSearch** if the canonical URL has changed) against:

```
https://code.visualstudio.com/updates
```

Each VS Code release has its own page (`/updates/v1_NN`). Fetch every release that landed in the audit period. **Do not** rely on training-data knowledge of what's in those releases — you must read the actual release notes for the current date, because they are updated continuously and your knowledge cutoff is stale relative to today.

For each release, scan for:
- **Tab API changes** (`window.tabGroups`, `TabInputText`, `TabInputCustom`, `TabInputNotebook`, `TabInputTextDiff`, `TabInputWebview`)
- **Tree view changes** (`TreeDataProvider`, `TreeView`, `TreeView.reveal`, `TreeItem`, `TreeItemCollapsibleState`, `ThemeIcon`, drag-and-drop controller)
- **Command/extension API changes** (`commands.getCommands`, `commands.executeCommand`, `extensions.onDidChange`, `setContext`)
- **Workspace API changes** (`workspace.workspaceFolders`, `workspace.onDidChangeConfiguration`)
- **Engine bumps** (does the new release affect what we can target with `engines.vscode`?)
- **Deprecations and removals** anywhere in the surface above

## 3. Audit the extension against the changelog

For each finding from step 2, classify it into one of four buckets:

| Bucket | Meaning | Example |
|---|---|---|
| **A. Doesn't touch us** | API we don't use, or change that's transparent | New language server feature, settings UI redesign |
| **B. Breaking change** | API we use was deprecated, removed, or changed signature | `TabInputCustom.uri` renamed |
| **C. New API we should adopt** | New API would let us do something we can't do today, or simplify code we already have | New `TreeView.expand()` method that replaces our reveal-with-expand workaround |
| **D. Security / critical** | Security advisory affecting our deps or runtime | CVE in `@vscode/test-electron` |

Cross-reference **only** against the actual API surface used by the extension. The exhaustive list:

- `src/extension.ts` — activation, commands, context keys, `extensions.onDidChange`, `commands.getCommands`
- `src/tabTracker.ts` — `window.tabGroups`, all `TabInput*` types, `onDidChangeTabs`, `onDidChangeTabGroups`
- `src/treeDataProvider.ts` — `TreeDataProvider`, `TreeView.reveal`, `TreeItem`, `ThemeIcon`, `TreeDragAndDropController`, `DataTransfer`
- `src/thirdPartyCommands.ts` — third-party `commandId` whitelist; check whether GitLens / TS extension renamed any of them

Use **Grep** against `src/` to confirm whether a given API appears in the codebase before classifying it as "affects us".

## 4. Audit dependencies

Run:

```bash
npm outdated
```

For each outdated package, classify:

| Package | Class | Action policy |
|---|---|---|
| `@types/vscode` | Must match `engines.vscode` | Bump only if we also bump `engines.vscode` (decision required from user) |
| `@vscode/test-electron`, `@vscode/test-cli` | Test harness | Patch/minor → safe; major → review changelog |
| `@vscode/vsce` | Publishing tool | Patch/minor → safe; major → review changelog |
| `esbuild`, `typescript`, `eslint`, `typescript-eslint` | Build/lint | Patch/minor → safe; major → review for breaking config changes |
| `vitest`, `mocha`, `@types/mocha` | Test runners | Patch/minor → safe; major → review |
| `@types/node` | Should track Node version we run on (currently 20.x) | Stay on `^20` major |
| `husky`, `lint-staged` | Git hooks | Patch/minor → safe; major → review |
| `@resvg/resvg-js` | Icon build script only | Patch/minor → safe; not shipped to users |

Run `npm audit` separately. Anything **high** or **critical** goes into bucket **D** above.

**Do not** auto-apply major version bumps. Always report majors to the user with the changelog link and let them decide.

## 5. Apply safe updates

If after step 4 there are dependency updates that fall into "safe" (patch/minor, not blocked on user decision):

```bash
npm update <package1> <package2> ...
```

Then run the full check cycle:

```bash
npm run check          # typecheck + lint + unit tests (276+ tests)
npm run test:integration   # full @vscode/test-electron integration suite
npm run build:prod     # production bundle
npm run package        # vsce package (smoke test that .vsix builds)
```

If **anything fails**, stop. Move to scenario **C. Something broke** below.

## 6. Decide the scenario

Based on the buckets in step 3 and the test results in step 5:

### Scenario A — Nothing interesting

All findings in bucket A, no broken tests, no security issues, only patch/minor dep updates.

**Action:**
1. Bump `version` in `package.json` (patch increment, e.g. `0.0.1 → 0.0.2`)
2. Add a `CHANGELOG.md` entry under a new dated section: dependency updates summary
3. Stage changes, propose a commit message in the form `chore: routine maintenance YYYY-MM-DD`
4. **Do not commit, push, or open a PR automatically.** Show the diff to the user and wait for explicit approval.

### Scenario B — Useful new APIs found

Findings include bucket C (new APIs we should adopt) or bucket B (breaking changes we need to handle).

**Action:** Stop. Do not bump version, do not modify code beyond the safe dep updates from step 5. Report:
- What you found (per finding: API name, link to release notes, why it's relevant)
- Concrete suggestion: "We could replace `<current code in file:line>` with `<new API>`"
- Wait for the user to decide which to adopt. Each adoption is a separate task with its own design discussion.

### Scenario C — Something broke

Tests failed in step 5, or a breaking change in bucket B is already biting us today.

**Action:** Stop. Revert any uncommitted dep updates that broke things (`git checkout package.json package-lock.json`). Report:
- Exact failure (test name, error message, file:line)
- Suspected cause (which dep update or which VS Code change)
- **Do not** attempt a fix on your own — this is a collaborative debugging session. Wait for the user.

### Scenario D — Security update

`npm audit` reported high/critical, or a CVE was published against a runtime dep.

**Action:**
1. Apply the security fix (`npm audit fix` for clean cases, manual update for cases that need a major bump)
2. Run the full check cycle from step 5
3. If clean: bump `version` (patch), update `CHANGELOG.md` with a `Security` section, propose commit `fix(security): <package> <CVE>` and wait for user approval
4. If broken: revert and report — security regressions are still regressions

## 7. Output to the user

Whatever the scenario, end with a structured report:

```
## Maintenance run YYYY-MM-DD

**Period audited:** <start date> → <today>
**VS Code releases reviewed:** <list of release versions>
**Current engines.vscode:** <value>
**Current extension version:** <value>

### Findings
- Bucket A (no impact): <count> items, summary in 1 line each
- Bucket B (breaking): <count> items, full detail
- Bucket C (new APIs): <count> items, full detail with adoption suggestion
- Bucket D (security): <count> items, full detail

### Dependencies
- Updated safely: <list>
- Awaiting user decision (major bumps): <list>
- Held back due to breakage: <list>

### Test results
- Unit: PASS / FAIL (count)
- Integration: PASS / FAIL (count)
- Build: PASS / FAIL
- Package: PASS / FAIL

### Recommended scenario
A / B / C / D — with one-paragraph explanation

### Next action required from user
<concrete ask>
```

---

## Notes for the agent

- **You are not authorized to push, publish, or open PRs.** Maintenance is advisory. The user always reviews and ships.
- **Do not invent VS Code release notes from training data.** Always fetch them from the live URL — your knowledge is months stale relative to today.
- **Do not silence test failures.** A failing test is signal, not noise. Stop and report.
- **Do not bundle "while I was here" refactors** into a maintenance run. If you spot something unrelated that looks wrong, mention it in the report — don't fix it.
- **Respect the existing CLAUDE.md process** in `~/.claude/CLAUDE.md` — interview, research, surface findings, get decisions from the user. Maintenance is not an exception to that process; it's a structured instance of it.
