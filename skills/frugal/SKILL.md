---
name: frugal
description: Token-efficient working mode. Runs on caveman ultra (prose) and ponytail ultra (code), both set by plugin config defaults, plus whichever token-efficiency profiles (coding, analysis, agents, compressed, benchmark) the current message needs, and model routing for delegated work. Use for /frugal, or when the user asks to work in low-token, cheap, or compressed mode.
---

# Frugal mode

Three layers on top of the user request: plugin compression (caveman for prose, ponytail for code), task profiles (CLAUDE.*.md rules) picked per message, and model routing for work handed to subagents.

## Step 1 - Plugins

Two plugins, two halves, no overlap: caveman shrinks what Claude says, ponytail shrinks what Claude builds.

Do not invoke the caveman or ponytail skills yourself. Each plugin persists its level only from `/caveman <level>` or `/ponytail <level>` typed by the user; a model-side switch does not stick, the per-turn hook pulls the level back, and the injected rules are wasted tokens.

Ultra comes from each plugin's config default, `{"defaultMode": "ultra"}`:

| Plugin | Windows | macOS, Linux |
|---|---|---|
| caveman | `%APPDATA%\caveman\config.json` | `~/.config/caveman/config.json` |
| ponytail | `%APPDATA%\ponytail\config.json` | `~/.config/ponytail/config.json` |

If a hook reports a level other than ultra and the user did not pick it, tell the user once to type `/caveman ultra` or `/ponytail ultra`. If a plugin is not installed, skip it; everything else still applies.

## Step 2 - Universal rules (always apply, do not read a file for these)

- Read existing files before writing. Do not re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.
- Read only the slice you need: a line range, not the whole file, unless the whole file is genuinely required.
- Search with grep plus narrow context instead of dumping a file to find one thing.
- Send long command output to a file, then read only the relevant part.
- Do not repeat a search or a read already done this session.
- Facts worth keeping across sessions go to native memory, not re-explained each session.

## Step 2b - Text for humans (apply without being asked)

Caveman compresses only Claude's own chat replies. Detect this case on every turn:

- Text a person outside the session will read (customer or support emails, ServiceMinder support replies, tickets, docs, posts, messages sent for the user): write it in normal prose, then run the `humanizer` skill on it before delivering. Skip code, commits, and internal notes.

Say in one line that humanizer ran.

## Step 3 - Pick profiles for the work at hand

Read from `profiles/` every profile that matches the work, not just one. Research then implement takes analysis and coding. A pipeline that writes code for a subagent takes agents and coding. None when none fit.

| Work involves | Profile |
|---|---|
| Writing, reviewing, debugging, refactoring code | `profiles/CLAUDE.coding.md` |
| Data analysis, research, investigation, reporting, financial or metric work | `profiles/CLAUDE.analysis.md` |
| Automation pipelines, subagents, bots, scheduled tasks, machine-consumed output | `profiles/CLAUDE.agents.md` |
| High-volume prose where token cost dominates and fabrication risk is low, only when caveman is off (it duplicates caveman and conflicts with it) | `profiles/CLAUDE.compressed.md` |
| Benchmark runs, token-to-green measurement | `profiles/CLAUDE.benchmark.md` |

Load on need, not on speculation.

### Re-evaluate every turn

On each user message, and mid-task when the work turns, ask which profiles the work now needs.

- Newly needed, never read this session: read it.
- Newly needed, already read: apply it, do not re-read.
- No longer relevant: stop applying it.

Say which profiles are active in one clause, only when the set changes.

Explicit override: profile names after the command (`/frugal coding ...`) select exactly those for that message.

## Step 4 - Model routing

The main thread keeps the session model for judgment: architecture, ambiguous bugs, cross-file refactors, synthesis, the final answer, final verification.

While frugal is active, the user authorizes delegating to a subagent with a cheaper `model` when both hold:
- the task is self-contained and fully specified in the prompt, and
- its raw output (files read, logs, pages) is much larger than the result you need back.

| Delegated work | model |
|---|---|
| Locate files or symbols, grep sweeps, read logs or test output, fetch and extract from docs or web pages | `haiku` |
| Bounded mechanical edits, single-file review, routine code from a clear spec | `sonnet` |

Subagents without an explicit `model` default to `CLAUDE_CODE_SUBAGENT_MODEL` (sonnet in the user's settings). Pass `haiku` explicitly for the simple tier.

Rules:
- Do not delegate a lookup of one or two tool calls: subagent cold start (system prompt, tools, CLAUDE.md, skill list) costs more than doing it inline.
- At most 3 parallel subagents unless the user says otherwise.
- Treat delegated results as leads; verify anything the final answer depends on.

Subagent prompt template (fill every line, nothing else):

```
Goal: <one sentence>
Scope: <exact paths, URLs, or search terms; what is out of scope>
Return: <format: file:line table | bullets | JSON>, max <N> lines
Stop when: <done condition>
Do not: edit files | suggest fixes | explain (pick what applies)
```

## Step 4b - Effort

A session cannot change its own effort; only the user can (`/effort <level>`). When the work shifts and the current level clearly mismatches it, suggest the change once in one line, then continue at the current level:
- Simple lookups, small edits, short factual answers: `/effort low`.
- Ambiguous bugs, architecture, multi-step reasoning: `/effort high`.

## Step 4c - Ask before guessing

When something unclear would change what gets built or answered, and reading the code, docs, or conversation cannot resolve it, ask with the AskUserQuestion tool instead of guessing. Rework from a wrong guess costs more than one question.
- Batch every open question into one call (max 4), recommended option first.
- Do not ask what has a conventional default or what you can verify yourself; pick, state it in one line, proceed.

## Step 4d - Handoff

Long chats re-send the whole history every turn. Count the user's messages in this session (approximate after a compaction). Between the 10th and 20th, if work remains (pending tasks, unfinished steps, open questions), end the reply with a handoff block the user can paste into a new chat. Pick the first natural breakpoint in that range, such as a subtask just finished or the work changing phase; do not wait past the 20th. If the user keeps going in the same chat, offer again 10 messages later. Also offer one when a task finishes and the user moves to an unrelated one. No work left: no handoff.

Before writing any handoff block, at those points or when the user asks for a new session or handoff, call `get_usage` (`mcp__ccd_session_mgmt__get_usage`, load it with ToolSearch if deferred) and fill the `Usage` line from it. If the tool is missing or reports unavailable, write `Usage: unavailable`. Do not call it on other turns unless asked.

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

Keep it under 250 words. Facts only; no narration.

## Step 5 - Execute

Do the request. Frugal stays on for the session; the profile set moves with the work.

## Precedence

User instructions > profile rules > universal rules. Between two active profiles, the one governing the current step wins: coding rules shape the code, analysis rules shape the findings, agents rules shape machine-read output. On accuracy discipline, take the stricter rule.

Caveman and ponytail compress wording and code size only. They never remove confidence labels, labeled inferences, sources, units, caveats, validation, security checks, or tests that a profile or the task requires.

Security warnings and irreversible-action confirmations stay in plain full sentences.
