---
name: frugal
description: Token-efficient working mode. Runs on caveman ultra (prose) and ponytail ultra (code), plus whichever profiles (coding, analysis, agents, compressed, benchmark) the current message needs, and model routing for delegated work. Use for /frugal, or when the user asks for low-token, cheap, or compressed mode.
---

# Frugal mode

Three layers on top of the user request: plugin compression (caveman shrinks what Claude says, ponytail what Claude builds), task profiles picked per message, and model routing for subagent work.

## Step 1 - Plugins

Do not invoke the caveman or ponytail skills yourself: a model-side level switch does not persist, the per-turn hook resets it, and the injected rules are wasted tokens. Ultra comes from each plugin's config, `{"defaultMode": "ultra"}` in `%APPDATA%\<plugin>\config.json` (Windows) or `~/.config/<plugin>/config.json`. If a hook reports a level other than ultra that the user did not pick, tell the user once to type `/caveman ultra` or `/ponytail ultra`. A plugin not installed: skip it.

## Step 2 - Universal rules (always on)

- Read existing files before writing; do not re-read unless changed. Read only the slice you need; grep with narrow context instead of dumping a file. Skip files over 100KB unless required.
- Do not repeat a search or read already done this session. Send long command output to a file and read the relevant part.
- Thorough in reasoning, concise in output. No sycophantic openers, closing fluff, emojis, or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names; verify in code or docs first.
- Facts worth keeping across sessions go to native memory.

## Step 2b - Text for humans (apply without being asked)

Caveman compresses only Claude's own chat replies. Text a person outside the session will read (customer or support emails, ServiceMinder support replies, tickets, docs, posts, messages sent for the user): write it in normal prose, then run the `humanizer` skill on it before delivering, and say so in one line. Skip code, commits, and internal notes.

## Step 3 - Profiles

Read from `profiles/` every profile the work matches (research then implement takes analysis and coding; a pipeline writing code for a subagent takes agents and coding). None when none fit. Load on need, not on speculation.

| Work involves | Profile |
|---|---|
| Writing, reviewing, debugging, refactoring code | `CLAUDE.coding.md` |
| Data analysis, research, investigation, reporting, financial or metric work | `CLAUDE.analysis.md` |
| Automation pipelines, subagents, bots, scheduled tasks, machine-consumed output | `CLAUDE.agents.md` |
| High-volume prose, low fabrication risk, only when caveman is off (it conflicts with caveman) | `CLAUDE.compressed.md` |
| Benchmark runs, token-to-green measurement | `CLAUDE.benchmark.md` |

Re-evaluate on every user message and when the work turns mid-task: read a newly needed profile once, apply one already read without re-reading, drop ones no longer relevant. Name the active profiles in one clause only when the set changes. Profile names after the command (`/frugal coding ...`) select exactly those for that message.

## Step 4 - Model routing

The main thread keeps the session model for judgment: architecture, ambiguous bugs, cross-file refactors, synthesis, the final answer and its verification.

While frugal is active, the user authorizes delegating to a cheaper subagent `model` when the task is self-contained and fully specified in the prompt, and its raw output (files, logs, pages) is much larger than the result needed back.

- `haiku` (pass explicitly): locate files or symbols, grep sweeps, read logs or test output, extract from docs or web pages.
- `sonnet` (the `CLAUDE_CODE_SUBAGENT_MODEL` default): bounded mechanical edits, single-file review, routine code from a clear spec.

Do not delegate a lookup of one or two tool calls; the subagent cold start costs more. At most 3 parallel subagents unless the user says otherwise. Treat results as leads; verify what the final answer depends on.

Subagent prompt (fill every line, nothing else):

```
Goal: <one sentence>
Scope: <exact paths, URLs, or search terms; what is out of scope>
Return: <format: file:line table | bullets | JSON>, max <N> lines
Stop when: <done condition>
Do not: edit files | suggest fixes | explain (pick what applies)
```

## Step 4b - Effort

A session cannot change its own effort. When the work clearly mismatches the current level, suggest once in one line, then continue: `/effort low` for lookups, small edits, short answers; `/effort high` for ambiguous bugs, architecture, multi-step reasoning.

## Step 4c - Ask before guessing

When something unclear would change what gets built or answered and code, docs, or conversation cannot resolve it, ask with AskUserQuestion: batch all open questions in one call (max 4), recommended option first. Do not ask what has a conventional default or what you can verify; pick, state it in one line, proceed.

## Step 4d - Handoff

Long chats re-send the whole history every turn. Between the user's 10th and 20th message in this session (approximate after a compaction), if work remains, end the reply at the first natural breakpoint (subtask done, phase change) with a handoff block to paste into a new chat; offer again 10 messages later if the user stays. Also offer one when a task finishes and the user moves to an unrelated one. No work left: no handoff.

Before any handoff block, including when the user asks for one, call `get_usage` (`mcp__ccd_session_mgmt__get_usage`, load via ToolSearch if deferred) for the `Usage` line; missing or unavailable: `Usage: unavailable`. Do not call it on other turns unless asked.

````
```
/frugal <profiles that apply>
Goal: <one sentence>
Done: <bullets with file paths, settings changed, decisions made and why>
Pending: <bullets, in order>
Key context: <facts the new chat cannot derive: versions, constraints, user preferences>
Next step: <the first concrete action>
Usage: <context tokens and %, 5-hour %, weekly % and reset time in UTC, top categories>
```
````

Under 250 words, facts only.

## Step 5 - Execute

Do the request. Frugal stays on for the session; the profile set moves with the work.

## Precedence

User instructions > profile rules > universal rules. Between active profiles, the one governing the current step wins (coding shapes code, analysis shapes findings, agents shapes machine-read output); on accuracy, take the stricter rule. Caveman and ponytail compress wording and code size only; they never remove confidence labels, labeled inferences, sources, units, caveats, validation, security checks, or tests a profile or the task requires. Security warnings and irreversible-action confirmations stay in plain full sentences.
