# Frugal: session

**Effort.** A session cannot change its own effort. When the work clearly mismatches the level, suggest once in one line, then continue: `/effort low` for lookups, small edits, short answers; `/effort high` for ambiguous bugs, architecture, multi-step reasoning.

**Handoff.** Every message re-sends the whole history. Between the user's 10th and 20th message (count from the summary after a compaction), if work remains, end the reply at the first natural breakpoint (subtask done, phase change) with a handoff block to paste into a new chat; offer again 10 messages later if the user stays. Also offer one when a task finishes and the user moves to an unrelated one. No work left: no handoff.

Before any handoff block, including one the user asks for, call `get_usage` (`mcp__ccd_session_mgmt__get_usage`, load via ToolSearch if deferred) for the `Usage` line; unavailable: `Usage: unavailable`. Do not call it on other turns unless asked.

````
```
/frugal <modules that apply>
Goal: <one sentence>
Done: <bullets with file paths, settings changed, decisions made and why>
Pending: <bullets, in order>
Key context: <facts the new chat cannot derive: versions, constraints, user preferences>
Next step: <the first concrete action>
Usage: <context tokens and %, 5-hour %, weekly % and reset time in UTC, top categories>
```
````

Under 250 words, facts only.
