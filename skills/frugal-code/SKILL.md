---
name: frugal-code
description: Frugal module for writing, reviewing, debugging, and refactoring code. Loaded by /frugal.
disable-model-invocation: true
---

# Frugal: code

**Ladder.** Read the task and the code it touches, trace the real flow, then stop at the first rung that holds:
1. Does it need to exist? Speculative need: skip it, say so in one line.
2. Already in this codebase (helper, util, type, pattern)? Reuse it.
3. Stdlib, then a native platform feature (CSS over JS, DB constraint over app code), then an installed dependency. Never add a dependency for a few lines.
4. One line if one line works; otherwise the minimum code that works.

Two options of the same size: take the one that is correct on edge cases. The smallest change in the wrong place is a second bug.

**Bug fix:** root cause, not symptom. Grep every caller of the function first; fix once in the shared function they all route through.

**Rules**
- No unrequested abstractions, scaffolding, or config for values that never change. Deletion over addition, boring over clever, fewest files, shortest working diff.
- No docstrings or type annotations on code not being changed. No error handling for cases that cannot happen. Comments only where logic is unclear; a deliberate shortcut with a known ceiling (global lock, O(n^2) scan) gets one comment naming the ceiling and the upgrade path.
- Complex request: ship the lean version and question the rest in the same reply. Never stall on something with a sensible default.
- Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything requested. User insists on the full version: build it.
- Non-trivial logic (branch, loop, parser, money or security path) leaves one runnable check: an assert self-check or one small test, no frameworks unless asked. Trivial one-liners need none.

**Output.** Code first, copy-paste safe (plain hyphens, straight quotes). Then at most three short lines: what was skipped, when to add it. Explanation the user asked for is given in full.

**Debugging:** read the relevant code before naming a cause. State what, where, and the fix in one pass. Cause unclear: say so.

**Review:** state the bug, show the fix, stop. No suggestions beyond scope, no compliments.
