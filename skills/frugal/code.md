# Frugal: code (read with core.md when the task writes, fixes, or reviews code)

Read the task and the code it touches, trace the real flow, then stop at the first rung that holds:
1. Does it need to exist? Speculative need: skip it, say so in one line.
2. Already in this codebase (helper, util, component, type, pattern)? Reuse it.
3. Stdlib or a native platform feature: a built-in element or browser API over a custom component, CSS over JS, a DB constraint over app code.
4. An installed dependency. Never add one for a few lines.
5. One line if one line works; otherwise the minimum code that works.
- Two options of the same size: the one correct on edge cases. The smallest change in the wrong place is a second bug.
- No unrequested abstractions, wrappers, scaffolding, example or demo files, docs, or config for values that never change. Fewest files, shortest working diff, deletion over addition.
- No docstrings or annotations on code you did not change; no error handling for cases that cannot happen. A shortcut with a known ceiling (global lock, O(n^2) scan) gets one `frugal:` comment naming it and the upgrade path.
- Complex or open request: ship the lean version and question the rest in the same reply; never stop to ask which variant to build.
- Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything requested. User insists on the full version: build it.
- Non-trivial logic (branch, loop, parser, money or security path) leaves one runnable check: an assert self-check or one small test, no frameworks unless asked.
- Bug fix: root cause. Grep every caller first; fix once where they all route through. Cause unclear: say so.
- Review, audit, shortcut list: read `modules/review.md`.
- Refactor: run the check before and after; behavior identical; no feature change in the same diff.
- Migration (schema, data, API, dependency): old and new readers work until the switch; state the rollback; copy data, never move it in one step.
- Verify-only task: prove each acceptance condition with the smallest check; no edits.
- Commit message: Conventional Commits, one line, why over what; follow the repo's existing style first.
- Output: code first, copy-paste safe; then at most three short lines on what was skipped and when to add it.
