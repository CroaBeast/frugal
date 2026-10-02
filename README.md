# frugal

A low-token working mode for Claude Code. Type `/frugal` and it stays on for the rest of the session.

frugal is built around one fact about agent sessions: most of the bill is input, not output. Every call re-reads the system prompt, the history, and every file and tool result in context. Shorter replies help a little; keeping the context small and making fewer calls helps much more.

## What it does

`/frugal` loads a 3.1KB entry skill. It keeps replies short, keeps exact values exact, and picks modules per task: a module is read when a task needs it and kept until the task changes.

| Skill | Loaded | What it does |
|---|---|---|
| `frugal` | on `/frugal` | Terse replies that report results, not process; exact terms, numbers, and negations; batched tool calls; no re-reading unchanged files; verify instead of guessing APIs and versions; asks only when missing information changes the result |
| `frugal-tight` | `/frugal tight` or "tight mode" | The fewest output tokens and calls that stay correct: `Done.` confirmations, bare answers, short reasoning, smallest diffs. Never cuts exact values, warnings, requested deliverables, or required tests |
| `frugal-code` | writing, reviewing, or debugging code | Minimal code: reuse before writing, stdlib before dependencies, root-cause fixes, one runnable check for non-trivial logic. Never cuts validation, security, or error handling that prevents data loss |
| `frugal-analysis` | data, research, metrics, reports | Finding first; every number with a source or derivation and units; missing data, low confidence, and inferences labeled |
| `frugal-delegate` | the task reads far more than it returns, or splits into independent parts | Hands reading to `haiku` and bounded edits to `sonnet`, never above the session model |
| `frugal-session` | the 10th message, a compaction, or a new unrelated task | Effort suggestions and a handoff block for a fresh chat |
| `frugal-agents` | pipelines, subagent prompts, machine-read output | Structured, parseable output; no narration; never invents paths, endpoints, or field names |
| `humanizer` | only if you say yes | Rewrites AI-sounding text. Based on [blader/humanizer](https://github.com/blader/humanizer), MIT |

Modules are marked `disable-model-invocation`, so their descriptions do not sit in every session's context. You can pick them yourself: `/frugal analysis coding`.

**Cheaper models without settings.** The plugin ships two subagents, `frugal-scout` (read-only search and extraction) and `frugal-worker` (bounded edits). `frugal-delegate` passes the model on every call, so nothing in your settings changes:

| Session model | Search, read, extract | Bounded edits |
|---|---|---|
| Opus | haiku | sonnet |
| Sonnet | haiku | sonnet |
| Haiku | haiku | haiku |

It delegates only when the raw material would add more than about 20k tokens to the main context, because each subagent starts with an empty cache.

**Humanizer is opt-in.** The first time frugal is about to write text for people (a customer email, a ticket reply, docs, a post), it asks once: Yes, No, Always this session, or Never this session. It never runs for code, commits, or internal notes.

frugal covers what caveman and ponytail do, so you do not need them. If they are enabled, disable them: their rules are added to every call and cost more than they save in this setup (see [Benchmarks](#benchmarks)).

## Install

```
/plugin marketplace add <path-or-repo>
/plugin install frugal@frugal
```

Open a new session and type `/frugal`. If you also have a separate copy of `humanizer` or of the frugal skills in `~/.claude/skills`, remove it so they do not show up twice.

## Usage

```
/frugal                   # modules picked per task
/frugal analysis          # force a module
/frugal coding agents     # several modules
/frugal tight             # shortest replies
```

Say `normal mode` to turn it off.

## Benchmarks

`bench/bench.py` runs each task as a real headless Claude Code session (`claude -p`) in a temp copy of a fixture and checks the result automatically: tests pass, the right numbers appear, the file exists. Costs are the `total_cost_usd` Claude Code reports.

Tasks: t1 fix a bug without touching the test; t2 find the largest month-over-month drop in a CSV; t3 draft a support reply with placeholders for unknown facts; t4 a 16-message session (bug fix, catalog change, CSV analysis, new function, email, review); t5 log triage, a rate limiter written from scratch, and a long explanation.

### Opus 5.5, 2026-10-01, n=2 per cell

All arms ran in the same batch. caveman and ponytail ran at `ultra`, their strongest level. Humanizer was off in every arm. Cells are the mean cost per run in USD. t1 uses only the second run of each arm, because the first run of a batch pays for writing the system prompt cache (up to 0.40 USD) and that landed on different arms by chance.

| Arm | t1 | t2 | t3 | t4 (16 msgs) | t5 | Sum | vs no plugins | First-call context | Checks passed |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.144 | 0.132 | 0.145 | 0.635 | 0.295 | 1.351 | | 38.7k | 10/10 |
| caveman ultra | 0.171 | 0.166 | 0.171 | 0.698 | 0.324 | 1.530 | +13% | 42.4k | 10/10 |
| ponytail ultra | 0.165 | 0.162 | 0.164 | 0.708 | 0.350 | 1.549 | +15% | 41.6k | 10/10 |
| caveman ultra + ponytail ultra | 0.181 | 0.184 | 0.203 | 0.729 | 0.360 | 1.657 | +23% | 45.3k | 10/10 |
| frugal 3.3 | 0.149 | 0.141 | 0.147 | 0.641 | 0.302 | 1.380 | +2% | 39.7k | 10/10 |

frugal 4 (tight profile, delegation) has not been benchmarked yet.

What the numbers say:

- Every arm passed every check, so the difference is cost.
- Each task reads about 120k input tokens and writes 600 to 1,000. Opus in Claude Code already answers briefly, so cutting output saves little.
- caveman and ponytail add 3k to 7k tokens to every call. That costs 13 to 23% more than no plugins, and stacking them adds the overheads while the output savings overlap.
- frugal adds about 1k tokens and wrote the least output of any arm except caveman + ponytail (median 798 tokens per task, against 943 with no plugins). It lands within about 2% of plain Claude Code, inside the noise of two runs per cell.

### How this relates to the published numbers

caveman and ponytail publish their own benchmarks, measured in other setups:

- **caveman** reports 65% fewer output tokens on single API calls against a model with no system prompt, whose average reply was 1,214 tokens. Its README notes that the rules cost 1 to 1.5k input tokens per turn and that already-terse workloads can lose money.
- **ponytail** reports 54% fewer lines of code and 20% lower cost in headless Claude Code sessions on 12 feature tasks in a FastAPI + React template, with Haiku 4.5 and n=4. The savings are largest where the baseline over-builds (a date picker went from 404 to 23 lines) and near zero where the code is already minimal.

Both results can hold at the same time as ours. These tasks are mostly fixes, analysis, and writing with Opus 5.5, where replies are already short and input dominates the cost. A run of frugal on ponytail's own harness is planned.

### Reproduce

```
cd bench
python bench.py run --conds AE --reps 2            # A: no plugins, E: /frugal
python bench.py run --conds AE --tasks t1_bug,t4_long
python bench.py report
```

`bench.py run` skips any run that already has results, so move old `results/<cond>_*` folders aside before re-running a condition. The system prompt changes between days (org skills, connector notices), so compare arms from the same batch.

## Licenses

frugal is MIT (see `LICENSE`). `humanizer` keeps its own MIT `LICENSE` file in its folder.
