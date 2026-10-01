# Frugal: heavy work

Read once when triage says heavy; keep applying for the rest of the session.

## Model routing

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

## Effort

A session cannot change its own effort. When the work clearly mismatches the current level, suggest once in one line, then continue: `/effort low` for lookups, small edits, short answers; `/effort high` for ambiguous bugs, architecture, multi-step reasoning.

## Handoff

Long chats re-send the whole history every turn. Between the user's 10th and 20th message (approximate after a compaction), if work remains, end the reply at the first natural breakpoint (subtask done, phase change) with a handoff block to paste into a new chat; offer again 10 messages later if the user stays. Also offer one when a task finishes and the user moves to an unrelated one. No work left: no handoff.

Before any handoff block, including when the user asks for one, call `get_usage` (`mcp__ccd_session_mgmt__get_usage`, load via ToolSearch if deferred) for the `Usage` line; missing or unavailable: `Usage: unavailable`. Do not call it on other turns unless asked.

````
```
/frugal <rule sets that apply>
Goal: <one sentence>
Done: <bullets with file paths, settings changed, decisions made and why>
Pending: <bullets, in order>
Key context: <facts the new chat cannot derive: versions, constraints, user preferences>
Next step: <the first concrete action>
Usage: <context tokens and %, 5-hour %, weekly % and reset time in UTC, top categories>
```
````

Under 250 words, facts only.
