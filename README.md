# frugal

A low-token working mode for Claude Code. Type `/frugal` and it stays on for the rest of the session.

frugal is built around one fact about agent sessions: most of the bill is input, not output. Every call re-reads the system prompt, the history, and every file and tool result in context. Shorter replies help a little; keeping the context small and making fewer calls helps much more.

## What it does

`/frugal` loads a 2.4KB entry skill. It keeps replies short, keeps exact values exact, and points to modules that are read only when a task needs them.

| Skill | Loaded | What it does |
|---|---|---|
| `frugal` | on `/frugal` | Terse replies; exact terms, numbers, and negations; batched tool calls; no re-reading unchanged files; verify instead of guessing APIs and versions; one round of questions when the answer changes the result |
| `frugal-code` | writing, reviewing, or debugging code | Minimal code: reuse before writing, stdlib before dependencies, root-cause fixes, one runnable check for non-trivial logic. Never cuts validation, security, or error handling that prevents data loss |
| `frugal-analysis` | data, research, metrics, reports | Finding first; every number with a source or derivation and units; missing data, low confidence, and inferences labeled |
| `frugal-heavy` | more than two files, outputs over ~500 lines, multi-step plans, or the 10th message | Subagent model routing, effort suggestions, handoff block for a fresh chat |
| `frugal-agents` | pipelines, subagent prompts, machine-read output | Structured, parseable output; no narration; never invents paths, endpoints, or field names |
| `frugal-benchmark` | benchmark runs | Edit instead of rewriting, test before declaring done, nothing extra |
| `frugal-compressed` | high-volume prose | Short sentences, result first. Drops the fabrication guards, so pair it with `coding` or `analysis` when accuracy matters |
| `humanizer` | only if you say yes | Rewrites AI-sounding text. Based on [blader/humanizer](https://github.com/blader/humanizer), MIT |

Modules are marked `disable-model-invocation`, so their descriptions do not sit in every session's context. You can pick them yourself: `/frugal analysis coding`.

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
```

Say `normal mode` to turn it off.

## Benchmarks

`bench/bench.py` runs each task as a real headless Claude Code session (`claude -p`) in a temp copy of a fixture and checks the result automatically: tests pass, the right numbers appear, the file exists. Costs are the `total_cost_usd` Claude Code reports.

Tasks: t1 fix a bug without touching the test; t2 find the largest month-over-month drop in a CSV; t3 draft a support reply with placeholders for unknown facts; t4 a 16-message session (bug fix, catalog change, CSV analysis, new function, email, review); t5 log triage, a rate limiter written from scratch, and a long explanation.

### Opus 5.5, 2026-10-01, n=2 per cell

Mean cost per run in USD. Humanizer is off in every arm.

| Arm | t1 | t2 | t3 | t4 (16 msgs) | t5 | First-call context | Checks passed |
|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.141 | 0.134 | 0.143 | 0.732 | 0.303 | 38.6k | 10/10 |
| caveman + ponytail (`full`) | 0.183 | 0.184 | 0.195 | 0.749 | 0.379 | 45.3k | 9/10 |
| frugal | 0.156 | 0.144 | 0.150 | 0.684 | 0.310 | 39.7k | 10/10 |
| caveman alone | pending | | | | | | |
| ponytail alone | pending | | | | | | |

The t2 and t5 frugal figures come from the run before the entry skill was trimmed to 2.4KB. With two runs per cell, differences under about 0.01 USD on t1 to t3 are within noise. The no-plugins t4 cost moved between 0.63 and 0.75 across three batches on the same day.

What the numbers say so far:

- Each task reads about 120k input tokens and writes 600 to 1,000. Opus in Claude Code already answers briefly, so cutting output saves little.
- caveman and ponytail add about 6.7k tokens to every call. That costs 30 to 40% more on short tasks. They did cut some output (t1: 448 vs 594 tokens), not enough to pay for it.
- frugal adds about 1k tokens. It costs 0.007 to 0.015 USD more on one-message tasks and was cheaper on the 16-message session, mainly through fewer tool calls.
- Stacking frugal on top of caveman and ponytail was the most expensive setup in earlier runs (t4: 0.81 to 0.88).

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

`humanizer` is MIT and keeps its `LICENSE` file in its folder. frugal itself has no license file yet.
