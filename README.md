# frugal

A low-token working mode for Claude Code. Type `/frugal` and it stays on for the rest of the session.

frugal is built around one fact about agent sessions: most of the bill is input, not output. Every call re-reads the system prompt, the history, and every file and tool result in context. Shorter replies help a little; keeping the context small and making fewer calls helps much more.

## What it does

`/frugal` loads a 2.9KB entry skill. It keeps replies short, keeps exact values exact, and picks modules per task: a module is read when a task needs it and kept until the task changes.

| Part | Loaded | What it does |
|---|---|---|
| `frugal` | on `/frugal` | Terse replies that report results, not process; exact terms, numbers, and negations; batched tool calls; no re-reading unchanged files; verify instead of guessing APIs and versions; asks only when missing information changes the result |
| `code.md` | read with `core.md` when a task over 3 tool calls writes, fixes, or reviews code | Minimal code: reuse before writing, stdlib before dependencies, root-cause fixes, one runnable check for non-trivial logic. Never cuts validation, security, or error handling that prevents data loss |
| `modules/analysis.md` | data, research, metrics, reports | Finding first; every number with a source or derivation and units; missing data, low confidence, and inferences labeled |
| `modules/delegate.md` | the raw material is too big to read directly (roughly 100k+ tokens), or splits into independent heavy parts | Hands reading to `haiku` and bounded edits to `sonnet`, never above the session model |
| `modules/session.md` | the 10th message, a compaction, or a new unrelated task | Effort suggestions and a handoff block for a fresh chat |
| `modules/agents.md` | pipelines, subagent prompts, machine-read output | Structured, parseable output; no narration; never invents paths, endpoints, or field names |
| `humanizer` | only if you say yes | Rewrites AI-sounding text. Based on [blader/humanizer](https://github.com/blader/humanizer), MIT |

Short tasks load only a small core (`SKILL.md`, ~1.2KB). A task that needs more than 3 tool calls also reads `core.md` (tool, question, and module rules) and the modules it needs, all plain files read by path, so nothing extra is loaded for a quick fix or a one-line answer. You can pick them yourself: `/frugal analysis coding`.

**Cheaper models without settings.** The plugin ships two subagents, `frugal-scout` (read-only search and extraction) and `frugal-worker` (bounded edits). The `delegate` module passes the model on every call, so nothing in your settings changes:

| Session model | Search, read, extract | Bounded edits |
|---|---|---|
| Opus | haiku | sonnet |
| Sonnet | haiku | sonnet |
| Haiku | haiku | haiku |

It delegates only when the raw material is too big to read directly (roughly 100k+ tokens), or more than ~30k tokens in a session that continues for many turns. Each subagent starts with an empty cache, and in the bench reading 30 contracts (~32k tokens) directly cost less than splitting them across three subagents. Once it delegates, the main thread does not re-read the material: it spot-checks at most two results.

**Humanizer is opt-in.** The first time frugal is about to write text for people (a customer email, a ticket reply, docs, a post), it asks once: Yes, No, Always this session, or Never this session. It never runs for code, commits, or internal notes.

frugal covers what caveman and ponytail do, so you do not need them. If they are enabled, disable them: their rules are added to every call and cost more than they save in this setup (see [Benchmarks](#benchmarks)).

## Install

### Let your agent install it

Paste this into Claude Code (CLI, desktop, or IDE), Claude Cowork, Codex, Cursor, or any agent that can run shell commands:

```text
Install the frugal plugin from https://github.com/<github-user>/frugal for me.

1. If you are Claude Code: run `claude plugin marketplace add <github-user>/frugal`, then `claude plugin install frugal@frugal`. Tell me to start a new session and type /frugal.
2. Otherwise, if you support Agent Skills (folders containing a SKILL.md): clone the repo to a temporary folder and copy every folder under skills/ into your user skills directory. Tell me how to invoke the frugal skill.
3. Otherwise: add the text of skills/frugal/SKILL.md, without its front matter, followed by skills/frugal/core.md, to your persistent instructions file (for example AGENTS.md) and tell me which file you changed.

Change nothing else. If the caveman or ponytail plugins are enabled, tell me, but do not disable them yourself.
```

Outside Claude Code, the subagents (`frugal-scout`, `frugal-worker`) and the model routing in `modules/delegate.md` do not apply, and step 3 installs only the core rules.

### By hand, in Claude Code

```
/plugin marketplace add <github-user>/frugal
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

## Should you use it?

On these benchmarks, plain Claude Code costs about the same as frugal and less than caveman or ponytail. Use frugal when one of these matters to you:

- **Long sessions and heavy tasks.** That is where frugal came out cheaper (3 to 13%). Every call re-reads the whole history, so shorter replies and fewer re-reads compound as a session grows, and the handoff block moves you to a fresh chat before the history gets expensive.
- **Shorter replies to read.** 15 to 18% less output overall, and about half the chat text on simple tasks, with every check still passing.
- **Behavior, not just tokens.** Verify APIs and versions instead of guessing, ask only when the answer changes the result, minimal code that keeps validation and tests, opt-in humanizer for text people read.

Skip it for short one-off tasks: there it costs about 0.01 to 0.02 USD more per task, the price of loading its rules.

caveman and ponytail make sense in the setups they were measured in: caveman with a model that writes long answers and has no system prompt telling it to be brief, ponytail on feature work where the model over-builds. In Claude Code with Opus or Sonnet on fixes, analysis, and writing, their rules cost more than they save.

**Questions cost tokens too.** Each question is one extra call: the model writes the question, your answer comes back, and the whole context is read again (mostly from cache, which is cheaper). That is why frugal asks only when missing information would change the result: one question is much cheaper than redoing work built on a wrong guess.

## Benchmarks

`bench/bench.py` runs each task as a real headless Claude Code session (`claude -p`) in a temp copy of a fixture and checks the result automatically: tests pass, the right numbers appear, the file exists. Costs are the `total_cost_usd` Claude Code reports.

Tasks: t1 fix a bug without touching the test; t2 find the largest month-over-month drop in a CSV; t3 draft a support reply with placeholders for unknown facts; t4 a 16-message session (bug fix, catalog change, CSV analysis, new function, email, review); t5 log triage, a rate limiter written from scratch, and a long explanation.

Every run below passed every check, so the differences are cost. Cells are the mean cost per run in USD, n=2. caveman and ponytail ran at `ultra`, their strongest level. Humanizer was off in every arm. Arms are only compared within the same batch, because the system prompt changes between batches.

### frugal 1.0, Opus 5.5 (batch 2, 2026-10-01)

Batches 2 and 3 ran on 0.4.x, which is 1.0 plus the experimental `tight` profile described below; `/frugal` itself did not load it.


| Arm | t1 | t2 | t3 | t4 (16 msgs) | t5 | Sum | vs no plugins | Output tokens per rep |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.133 | 0.129 | 0.144 | 0.669 | 0.323 | 1.398 | | 16.9k |
| caveman ultra + ponytail ultra | 0.187 | 0.182 | 0.196 | 0.733 | 0.384 | 1.681 | +20% | 15.4k |
| **frugal 1.0** | 0.153 | 0.153 | 0.152 | 0.649 | 0.280 | **1.387** | **-1%** | **13.9k (-18%)** |

### frugal 1.0, Sonnet 5.5 (batch 3, 2026-10-01)

| Arm | t1 | t2 | t3 | t4 (16 msgs) | t5 | Sum | vs no plugins | Output tokens per rep |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.083 | 0.072 | 0.078 | 0.447 | 0.185 | 0.865 | | 13.0k |
| **frugal 1.0** | 0.092 | 0.087 | 0.086 | 0.441 | 0.176 | **0.883** | **+2%** | **11.1k (-15%)** |

### caveman and ponytail separately, Opus 5.5 (batch 1, frugal 0.3.3)

t1 uses only the second run of each arm here: the first run of a batch pays for writing the system prompt cache (up to 0.40 USD), and that landed on different arms by chance.

| Arm | t1 | t2 | t3 | t4 (16 msgs) | t5 | Sum | vs no plugins | First-call context |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.144 | 0.132 | 0.145 | 0.635 | 0.295 | 1.351 | | 38.7k |
| caveman ultra | 0.171 | 0.166 | 0.171 | 0.698 | 0.324 | 1.530 | +13% | 42.4k |
| ponytail ultra | 0.165 | 0.162 | 0.164 | 0.708 | 0.350 | 1.549 | +15% | 41.6k |
| caveman ultra + ponytail ultra | 0.181 | 0.184 | 0.203 | 0.729 | 0.360 | 1.657 | +23% | 45.3k |
| frugal 0.3.3 | 0.149 | 0.141 | 0.147 | 0.641 | 0.302 | 1.380 | +2% | 39.7k |

### What the numbers say

- Each task reads about 120k input tokens and writes 600 to 1,000. Opus and Sonnet in Claude Code already answer briefly, so cutting output alone saves little.
- caveman and ponytail add 3k to 7k tokens to every call: 13 to 23% more than no plugins, with no quality gain on these checks. Stacking them adds the overheads while the output savings overlap.
- frugal 1.0 adds about 1.5k tokens, writes 15 to 18% less, and makes no extra calls. It costs the same as plain Claude Code overall: about 0.01 to 0.02 USD more on one-message tasks, and 3 to 13% less on the long session and the heavy task.
- Delegation (0.6, forced with `/frugal delegate` on t5, t6, t8): when it delegated to three haiku scouts it cost 1.6 to 2.3 times plain Claude Code at the same quality. The haiku agents were cheap (0.14 to 0.22 USD); the main thread re-read the material to verify and woke up for each background agent. 0.6.1 delegates only above ~100k tokens of raw material, never re-reads what it delegated, and runs agents in the foreground: it delegated in 2 of 8 runs instead of 4, at 0.45 to 0.55 USD instead of 0.51 to 0.84.
- Short tasks (0.6.2, same batch, n=4): 0.6.1 cost 4 to 11% more than plain Claude Code on one-message tasks, almost all of it from its ~1k tokens of rules (the plugin being enabled adds ~0.3k). 0.6.2 loads a ~1.2KB core and reads the rest only for tasks over 3 tool calls: +0 to 3% on short tasks (within noise), -11% on the 16-message session, -8% on the heavy task, -5% overall, same pass rate. It read `core.md` in 4 of 4 heavy runs and 1 of 12 short ones.

### Experiment: a `tight` profile (discarded)

0.4 shipped an opt-in `tight` profile to test whether cutting output harder than the default would lower total cost. It replaced the reply rules with `Done.` confirmations, bare answers, no headings or tables, short reasoning, and the fewest calls, while keeping exact values, warnings, deliverables, and tests.

It did not work. On Opus 5.5 in batch 2 it cost 1.425 USD (+2% vs no plugins) against 1.387 for the default profile, and wrote about the same output (13.7k vs 13.9k tokens per rep). The model loaded the profile in only 4 of 10 runs even after the rule was made mandatory, and one t4 run made 29 tool calls instead of 17. The default profile already sits near the floor: what output is left is deliverables (code, emails, explanations), which frugal never shortens, and reasoning, which a skill cannot limit (`/effort low` does that, and is not benchmarked here). 1.0 removed `tight`.

### How this relates to the published numbers

caveman and ponytail publish their own benchmarks, measured in other setups:

- **caveman** reports 65% fewer output tokens on single API calls against a model with no system prompt, whose average reply was 1,214 tokens. Its README notes that the rules cost 1 to 1.5k input tokens per turn and that already-terse workloads can lose money.
- **ponytail** reports 54% fewer lines of code and 20% lower cost in headless Claude Code sessions on 12 feature tasks in a FastAPI + React template, with Haiku 4.5 and n=4. The savings are largest where the baseline over-builds (a date picker went from 404 to 23 lines) and near zero where the code is already minimal.

Both results can hold at the same time as ours. These tasks are mostly fixes, analysis, and writing with Opus 5.5 and Sonnet 5.5, where replies are already short and input dominates the cost. A run of frugal on ponytail's own harness is planned.

### Reproduce

```
cd bench
python bench.py run --conds AE --reps 2            # A: no plugins, E: /frugal
python bench.py run --conds AE --tasks t1_bug,t4_long
python bench.py report
```

`bench.py run` skips any run that already has results, so move old `results/<cond>_*` folders aside before re-running a condition. The system prompt changes between days (org skills, connector notices), so compare arms from the same batch.

## Versions

- **1.0.0**: per-task modules read by path, delegation to haiku and sonnet subagents shipped in the plugin, session handoff, questions only when needed, opt-in humanizer with a shorter core. Benchmarked equal in cost to plain Claude Code on Opus 5.5 and Sonnet 5.5, with 15 to 18% less output.
- **0.4**: first plugin build of the above, plus the experimental `tight` profile (discarded).
- **0.3**: modular skills loaded on demand, standalone (no caveman or ponytail needed).
- **0.1, 0.2**: single skill on top of caveman and ponytail at `ultra`; the most expensive setup in the benchmarks.

## Licenses

frugal is MIT (see `LICENSE`). `humanizer` keeps its own MIT `LICENSE` file in its folder.
