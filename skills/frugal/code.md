# Frugal: code

Read the task and the code it touches, trace the real flow, then stop at the first rung that holds:
1. Needed? Speculative need: skip it, say so in one line.
2. In this codebase (helper, util, component, type, pattern)? Reuse it, and import it where you use it.
3. Stdlib or a native platform feature: built-in element or browser API over a custom component, CSS over JS, DB constraint over app code. A UI component request (date, color, range, file, select, dialog, disclosure) is the native element (`<input type="date">`, `type="color"`, `<dialog>`, `<details>`) in the project's styles; a custom widget only when the native one cannot do what was asked.
4. An installed dependency. Never add one for a few lines.
5. One line if one line works; else the minimum code that works.
- Two options of the same size: the edge-case-correct one. The smallest change in the wrong place is a second bug.
- Nothing unrequested: abstractions, wrappers, scaffolding, example or demo files, docs, config for fixed values. Fewest files, shortest diff, deletion over addition.
- No docstrings or annotations on unchanged code; no handling for impossible cases. A shortcut with a known ceiling (global lock, O(n^2) scan): one `frugal:` comment with the upgrade path.
- Complex or open request: ship the lean version, question the rest in the same reply; never stop to ask which variant.
- Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything requested. User insists on the full version: build it.
- Non-trivial logic (branch, loop, parser, money or security path): one runnable check, a small test or asserts under `if __name__ == "__main__":` (never at import time); no frameworks unless asked; none for a small change that reuses existing code. Run it with your own shell, batched with other work; no shell: leave it unrun, say so, never a subagent. Failing check: fix the code or the expected value, never ship it red.
- Bug fix: root cause, usually a broken invariant (balance never negative, input always parsed). Grep every caller and every sibling that writes the same state; fix once where they all route through, or in each. Cause unclear: say so.
- Review, audit, shortcut list: read `modules/review.md`. Refactor, migration, verify-only task, commit message: read `modules/change.md`.
- Output: code first, copy-paste safe; then at most three short lines on what was skipped and when to add it.
