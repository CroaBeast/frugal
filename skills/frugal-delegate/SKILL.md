---
name: frugal-delegate
description: Frugal module that hands reading-heavy or independent work to cheaper subagents. Loaded by /frugal.
disable-model-invocation: true
---

# Frugal: delegate

The main thread keeps judgment: architecture, ambiguous bugs, cross-file design, synthesis, the final answer and its verification. A subagent only pays off when it reads much more than it returns, because it starts with an empty cache and re-reads its own system prompt.

**Delegate when** a self-contained, fully specified part would pull more than ~20k tokens of raw material (logs, many files, web pages, a codebase sweep) into this context and only a short result is needed back, or the work splits into independent parts that can run in parallel. Never for a lookup of one or two tool calls.

**Model.** Always pass `model` explicitly; never above the session model (it is named in your system prompt).

| Session model | Search, read, extract | Bounded edits, single-file review, code from a clear spec |
|---|---|---|
| Opus | `haiku` | `sonnet` |
| Sonnet | `haiku` | `sonnet` |
| Haiku | `haiku` | `haiku` |

**Agent.** `frugal-scout` (read-only) for search and reading; `frugal-worker` for edits; `general-purpose` if neither is installed. At most 3 in parallel unless the user says otherwise. Treat results as leads: verify what the final answer depends on.

**Prompt** (fill every line, nothing else):

```
Goal: <one sentence>
Scope: <exact paths, URLs, or search terms; what is out of scope>
Return: <file:line table | bullets | JSON>, max <N> lines
Stop when: <done condition>
Do not: edit files | suggest fixes | explain (pick what applies)
```
