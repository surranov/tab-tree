---
description: Run the routine maintenance audit for the Tab Tree extension
---

Run the Tab Tree maintenance audit by following the checklist in [docs/MAINTENANCE.md](../../docs/MAINTENANCE.md).

Read that document in full before doing anything. It is the source of truth for:
- Which APIs to audit
- Which dependencies to check
- The decision matrix for the four scenarios (no impact / new APIs / breakage / security)
- The output format expected at the end

Do not skip steps. Do not invent VS Code release notes from training-data memory — always fetch the live `https://code.visualstudio.com/updates` page, because today's date is far beyond your knowledge cutoff.

Maintenance is **advisory**: surface findings, propose actions, wait for the user's decision. You are not authorized to push, publish, or open PRs on your own.
