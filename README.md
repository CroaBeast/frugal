# frugal

A low-token working mode for Claude Code. Type `/frugal` and it stays on for the rest of the session.

frugal is built around one fact about agent sessions: most of the bill is input, not output. Every call re-reads the system prompt, the history, and every file and tool result in context. Shorter replies help a little; keeping the context small and making fewer calls helps much more.

## What it does

`/frugal` loads a 2.3KB core. A short task (3 tool calls or fewer) needs nothing else. Longer tasks read more rules by path, only the ones they need:

| Part | Loaded | What it does |
|---|---|---|
| `SKILL.md` | on `/frugal` | Terse replies that report results, not process; exact terms, numbers, and negations; verify APIs and versions instead of guessing; a few always-on code rules; opt-in humanizer |
| `core.md` | tasks over 3 tool calls, the 10th message, or any module named after `/frugal` | Batched tool calls, no re-reading unchanged files, questions only when the answer changes the result, module picking |
| `code.md` | with `core.md`, when the task writes, fixes, or reviews code | Minimal code: does it need to exist, reuse what the codebase has, stdlib and native platform features before dependencies, root-cause fixes, one runnable check for non-trivial logic. Refactors, migrations, verify-only tasks, and commit messages in one line each. Never cuts validation, security, accessibility, or error handling that prevents data loss |
| `modules/analysis.md` | data, research, metrics, reports | Finding first; every number with a source or derivation and units; missing data, low confidence, and inferences labeled |
| `modules/delegate.md` | raw material too big to read directly (roughly 100k+ tokens), or independent heavy parts | Hands reading to `haiku` and bounded edits to `sonnet`, never above the session model; escalates a part only when it fails |
| `modules/session.md` | the 10th message (then every 15th, from a hook), a compaction, a new unrelated task, or a model or effort that does not fit the task | Says which model and effort fit, with a ready-to-paste prompt per task, and a handoff block for a fresh chat |
| `modules/review.md` | reviews, audits, shortcut lists | Diff review with bugs and over-engineering in one pass, one line per finding; whole-repo audit ranked by lines saved; a ledger of `frugal:` shortcut comments |
| `modules/compress.md` | on request | Rewrites CLAUDE.md or another memory file to fewer bytes with a backup, keeping every instruction; saved on every call after |
| `scripts/usage.sh` | before a handoff in the CLI, or when you ask about usage | Context size and token totals from the session transcript, where `get_usage` is not available |
| `modules/agents.md` | pipelines, subagent prompts, machine-read output | Structured, parseable output; no narration; never invents paths, endpoints, or field names |
| `hooks/session-count.sh` | every prompt, prints nothing until the 10th | Counts messages per session and, when `/frugal` is active, tells the model to read `core.md` and `session.md` at the 10th message and every 15th after. A skill cannot count messages reliably; the hook can. Needs `sh` (Git Bash on Windows) |
| `humanizer` | only if you say yes | Rewrites AI-sounding text. Based on [blader/humanizer](https://github.com/blader/humanizer), MIT |

The read instruction is the first line of the core and names both files at once. Haiku skipped a chain of reads ("read core, then the module it points to") in every run, and follows a single direct instruction in every run. You can force modules yourself: `/frugal analysis coding`.

**Cheaper models without settings.** The plugin ships two subagents, `frugal-scout` (read-only search and extraction) and `frugal-worker` (bounded edits). The `delegate` module passes the model on every call, so nothing in your settings changes:

| Session model | Search, read, extract | Bounded edits |
|---|---|---|
| Fable | haiku | sonnet |
| Opus | haiku | sonnet |
| Sonnet | haiku | sonnet |
| Haiku | haiku | haiku |

It delegates only when the raw material is too big to read directly, or more than ~30k tokens in a session that continues for many turns. Each subagent starts with an empty cache, and in the bench reading 30 contracts (~32k tokens) directly cost less than splitting them across three subagents. Once it delegates, the main thread does not redo the work: it spot-checks at most two results, or all of them when an error would touch money, security, legal terms, or unrecoverable data. A part that fails is re-run one model up (`haiku` to `sonnet`), and only that part.

**Humanizer is opt-in.** The first time frugal is about to write text for people (a customer email, a ticket reply, docs, a post), it asks once: Yes, No, Always this session, or Never this session. It never runs for code, commits, or internal notes.

frugal covers what caveman and ponytail do, so you do not need them. If they are enabled, disable them: their rules are added to every call (see [Benchmarks](#benchmarks)).

## Install

### Let your agent install it

Paste this into Claude Code (CLI, desktop, or IDE), Claude Cowork, Codex, Cursor, or any agent that can run shell commands:

```text
Install the frugal plugin from https://github.com/CroaBeast/frugal for me.

1. If you are Claude Code: run `claude plugin marketplace add CroaBeast/frugal`, then `claude plugin install frugal@frugal`. Tell me to start a new session and type /frugal.
2. Otherwise, if you support Agent Skills (folders containing a SKILL.md): clone the repo to a temporary folder and copy every folder under skills/ into your user skills directory. Tell me how to invoke the frugal skill.
3. Otherwise: add the text of skills/frugal/SKILL.md without its front matter, then skills/frugal/core.md and skills/frugal/code.md, to your persistent instructions file (for example AGENTS.md) and tell me which file you changed.

Change nothing else. If the caveman or ponytail plugins are enabled, tell me, but do not disable them yourself.
```

Outside Claude Code, the subagents (`frugal-scout`, `frugal-worker`) and the model routing in `modules/delegate.md` do not apply, and step 3 installs only the core rules.

### By hand, in Claude Code

```
/plugin marketplace add CroaBeast/frugal
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

On the nine-task batch (0.11) frugal cost 6% less than plain Claude Code, wrote 17% less, and passed every check plain Claude Code passed. 0.12's six-task rerun on Opus came out even on cost with 11% less output:

- **Long sessions and heavy tasks:** 10 to 12% cheaper on the 40-message session, the heavy coding task, and the contract risk review. Every call re-reads the whole history, so shorter replies and fewer re-reads compound as a session grows. The 16-message session came out -2%: at the 10th message frugal writes a handoff block for a fresh chat, which only pays back when you actually move to one.
- **Short one-off tasks:** -4 to +7% across batches. Only the small core loads; this is where frugal has the least to save.
- **Writing features:** on ponytail's own harness (Haiku 4.5), 0.12 wrote less code than ponytail on the frontend tasks, cost less, and scored 0.00 for over-engineering against ponytail's 1.25 in the same batch (see below; n=2).
- **Behavior, not just tokens:** verify APIs and versions instead of guessing, build the sensible default instead of stopping to ask, minimal code that keeps validation and tests, opt-in humanizer for text people read.

**Questions cost tokens too.** Each question is one extra call: the model writes the question, your answer comes back, and the whole context is read again (mostly from cache, which is cheaper). That is why frugal asks only when missing information would change the result: one question is much cheaper than redoing work built on a wrong guess.

## Model routing and other tools

A skill cannot switch the session's model or effort. frugal routes its subagents, and when a task fits another model: a bounded task goes to a subagent on the cheaper model automatically; open-ended work, or work that needs a stronger model than the session, gets a prompt to paste in a new chat with the model and effort to use. Small tasks it does in place, since a new chat re-pays the system prompt. Beyond that, Claude Code has its own controls, and they combine with frugal:

| Option | What it routes | Notes |
|---|---|---|
| `/model opusplan` | Opus while planning, Sonnet while executing | Switches at the plan-mode boundary, not per request |
| `/effort low` to `max` | How much the model thinks per step | Set it per session; `low` for simple work |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Default model for subagents | frugal passes the model explicitly anyway |
| A proxy such as claude-code-router or OmniRoute | Every request, by rules or cost | Needs provider API keys and routes to non-Anthropic models, so the quality claim above no longer holds |

Switching models inside one session also throws away the prompt cache, which is per model: the next call re-pays the whole context at the uncached rate. That is why per-request routing pays off in your own app with independent requests, and much less inside one long agent session.

Knowledge-graph tools such as Graphify target a different cost (exploring very large repos) and are not measured here.

## Benchmarks

`bench/bench.py` runs each task as a real headless Claude Code session (`claude -p`) in a temp copy of a fixture and checks the result automatically: tests pass, the right numbers appear, the file exists. Costs are the `total_cost_usd` Claude Code reports. Arms are only compared within the same batch, because the system prompt changes between batches.

Tasks: t1 fix a bug without touching the test; t2 find the largest month-over-month drop in a CSV; t3 draft a support reply with placeholders for unknown facts; t4 a 16-message session; t5 log triage, a rate limiter from scratch, and a long explanation; t6 extract notice periods from 30 contracts into a CSV; t7 a 40-message session; t8 a risk review of the same 30 contracts; t9 a risk review of 150 contracts (~165k tokens), each with one planted risk that must be named, checked for at least 90% of vendors.

### frugal 0.12

**Opus 5.5, six tasks** (2026-10-03), median cost per run in USD, n=3. Every run passed every check.

| Task | No plugins | frugal | Difference | Output tokens |
|---|---|---|---|---|
| t1 bug fix | 0.135 | 0.157 | +16% | 608 to 724 |
| t2 CSV question | 0.127 | 0.134 | +6% | 632 to 566 |
| t3 support reply | 0.137 | 0.147 | +7% | 1,145 to 1,125 |
| t5 heavy | 0.347 | 0.287 | -17% | 5,946 to 4,134 |
| t6 30 contracts | 0.232 | 0.221 | -5% | 1,994 to 1,855 |
| t8 risk review | 0.398 | 0.432 | +9% | 5,700 to 5,895 |
| **Sum** | **1.376** | **1.378** | **0%** | **16.0k to 14.3k (-11%)** |

t1 cost more because this batch made every code task read `code.md`. That rule now applies on Opus and Fable only past 3 tool calls; a t1 rerun of 3 runs each came out 0.136 to 0.145 (+7%), with fewer output tokens. t4, t7, and t9 were not rerun.

**ponytail's harness, Haiku 4.5.** First batch, nine tasks (security, reuse, root cause, open-ended, vibe, frontend, backend), n=2, every cell correct:

| Arm | Cost, sum of task means | Lines of code, sum | Over-engineering (judge, 0 to 3) |
|---|---|---|---|
| No plugins | 0.660 | 1,016 | 0.56 |
| frugal | 0.602 | 556 | 0.33 |
| ponytail | 0.615 | 384 | 0.28 |

frugal lost on the frontend: Haiku built a calendar instead of the native date input, and added demo files. 0.12 then named the native elements in `code.md` (`<input type="date">`, `type="color"`, `<dialog>`, `<details>`), made code tasks read the code rules, and put the root-cause rule in the core. Rerun of the four weakest tasks, same batch for both arms, n=2:

| Task | frugal USD | ponytail USD | frugal lines | ponytail lines |
|---|---|---|---|---|
| Date picker | 0.083 | 0.102 | 37 | 80 |
| Color picker | 0.061 | 0.130 | 22 | 226 |
| Mandelbrot | 0.037 | 0.065 | 33 | 61 |
| trace-transfer | 0.028 | 0.039 | 17 | 17 |
| **Over-engineering (judge)** | **0.00** | **1.25** | | |

ponytail's color picker ranged from 68 to 226 lines between the two batches: at n=2 single tasks swing a lot. The harness checks root-cause fixes on trace-transfer (the bug report names `transfer`, the shared `_debit` also breaks `withdraw`): after the core rule, frugal fixed the shared cause in 4 of 7 runs across three batches, ponytail in 1 of 6. The judge is the harness's own `judge.py` (Sonnet, validated by its selftest), run through `claude -p` when no API key is set; on template tasks it reads the agent's diff instead of the whole repo.

**caveman's eval, Opus 5.5.** caveman's own ten dev questions (`evals/prompts/en.txt`), each answered with a replaced system prompt: "Answer concisely." alone, plus caveman's `SKILL.md`, or plus frugal's. n=20 answers per arm; a Sonnet judge scored each answer blind, 0 to 3.

| Arm | Median output tokens | Mean output tokens | Mean cost per answer | Judge score |
|---|---|---|---|---|
| "Answer concisely." | 560 | 605 | 0.0172 | 2.95 |
| caveman | 514 | 483 | 0.0159 | 3.00 |
| frugal | 488 | 524 | 0.0158 | 2.95 |

A tie on caveman's ground: lower median, higher mean, same cost, same quality (one answer at 2 in each of the control and frugal arms). Script: `bench/caveman_eval.py`.

### frugal 0.11, Opus 5.5

One batch (2026-10-02), median cost per run in USD, n=4 (t7 and t9 n=2). Every run passed every check.

| Task | No plugins | frugal | Difference | Output tokens |
|---|---|---|---|---|
| t1 bug fix | 0.134 | 0.130 | -4% | 620 to 412 |
| t2 CSV question | 0.126 | 0.134 | +6% | 483 to 594 |
| t3 support reply | 0.139 | 0.143 | +3% | 1,222 to 1,002 |
| t4 16 messages | 0.626 | 0.613 | -2% | 8,807 to 7,554 |
| t5 heavy | 0.322 | 0.284 | -12% | 5,308 to 3,776 |
| t6 30 contracts | 0.225 | 0.259 | +15% | 1,920 to 1,972 |
| t7 40 messages | 1.498 | 1.316 | -12% | 19,788 to 15,884 |
| t8 risk review | 0.384 | 0.345 | -10% | 5,696 to 4,736 |
| t9 150 contracts | 0.325 | 0.336 | +4% | 5,223 to 4,712 |
| **Sum** | **3.779** | **3.560** | **-6%** | **49.1k to 40.6k (-17%)** |

Single tasks move a lot between batches at n=4: t6 ranged from -12% to +29% across six batches, and t8 from -18% to +13% across four. The sum is the number to trust.

### ponytail's harness, Haiku 4.5

`bench/ponytail_agentic` is ponytail's own agentic benchmark (MIT) with a frugal arm added: feature tasks in a FastAPI + React template, scored by its own checks. caveman and ponytail ran at `full`, their default. Same batch as above, mean cost per run, n=4:

| Task | No plugins | frugal | ponytail | caveman |
|---|---|---|---|---|
| Date picker, USD | 0.141 | 0.129 (-8%) | **0.116 (-18%)** | 0.197 (+40%) |
| Date picker, lines of code | 461 | 234 | **102** | 393 |
| Search endpoint, USD | 0.100 | 0.106 (+6%) | 0.104 (+4%) | 0.124 (+24%) |
| Search endpoint, lines of code | 46 | 45 | 41 | 46 |

Every cell passed. On the date picker the cost follows one design decision per run: in this batch frugal used the browser's native date input once in 21 lines, wrapped it in 320 lines once, and built a calendar component twice (211 and 256 lines). Across five batches while frugal's rules changed, frugal ranged from -8% to -57% on the date picker and ponytail from -18% to -58%; on the search endpoint every arm writes the same ~44 lines, so no rule set has anything to save and results swing from -20% to +35%.

One earlier 0.11 batch was stopped: a frugal run asked "standalone component or inside a form?" instead of building, and in a headless run nobody answers. 0.11 now builds the simplest option and names the alternative in one line.

### Earlier versions, Opus 5.5 and Sonnet 5.5

frugal 0.5, n=2, mean cost per run in USD. caveman and ponytail ran at `ultra`, their strongest level.

| Arm (Opus 5.5, batch 2) | t1 | t2 | t3 | t4 | t5 | Sum | vs no plugins | Output tokens per rep |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.133 | 0.129 | 0.144 | 0.669 | 0.323 | 1.398 | | 16.9k |
| caveman ultra + ponytail ultra | 0.187 | 0.182 | 0.196 | 0.733 | 0.384 | 1.681 | +20% | 15.4k |
| frugal 0.5 | 0.153 | 0.153 | 0.152 | 0.649 | 0.280 | 1.387 | -1% | 13.9k (-18%) |

| Arm (Sonnet 5.5, batch 3) | t1 | t2 | t3 | t4 | t5 | Sum | vs no plugins | Output tokens per rep |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.083 | 0.072 | 0.078 | 0.447 | 0.185 | 0.865 | | 13.0k |
| frugal 0.5 | 0.092 | 0.087 | 0.086 | 0.441 | 0.176 | 0.883 | +2% | 11.1k (-15%) |

caveman and ponytail separately (Opus 5.5, batch 1, frugal 0.3.3; t1 uses only the second run of each arm, because the first run of a batch pays for writing the system prompt cache):

| Arm | t1 | t2 | t3 | t4 | t5 | Sum | vs no plugins | First-call context |
|---|---|---|---|---|---|---|---|---|
| Claude Code, no plugins | 0.144 | 0.132 | 0.145 | 0.635 | 0.295 | 1.351 | | 38.7k |
| caveman ultra | 0.171 | 0.166 | 0.171 | 0.698 | 0.324 | 1.530 | +13% | 42.4k |
| ponytail ultra | 0.165 | 0.162 | 0.164 | 0.708 | 0.350 | 1.549 | +15% | 41.6k |
| caveman ultra + ponytail ultra | 0.181 | 0.184 | 0.203 | 0.729 | 0.360 | 1.657 | +23% | 45.3k |
| frugal 0.3.3 | 0.149 | 0.141 | 0.147 | 0.641 | 0.302 | 1.380 | +2% | 39.7k |

### What the numbers say

- Input dominates: a one-message task reads 100k to 160k input tokens and writes 450 to 1,200. Opus and Sonnet in Claude Code already answer briefly, so cutting output alone saves little; loading fewer rules matters as much.
- caveman and ponytail add 3k to 7k tokens to every call in Claude Code. On fixes, analysis, and writing with Opus that cost 13 to 23% more than no plugins. On feature work with Haiku, where the model over-builds, ponytail pays for itself.
- Rules loaded on every call are the main cost on short tasks. 0.7 loaded ~1k tokens of rules on every task and cost 4 to 11% more than no plugins on one-message tasks (enabling the plugin alone adds ~0.3k). From 0.8 on, short tasks load only the small core: +0 to 3%.
- Delegation, forced with `/frugal delegate` on t5, t6, and t8: in 0.6, three haiku scouts cost 1.6 to 2.3 times plain Claude Code at the same quality. The haiku agents were cheap (0.14 to 0.22 USD); the main thread re-read the material to verify and woke up for each background agent. From 0.7 on, frugal delegated in 2 of 8 runs instead of 4, at 0.45 to 0.55 USD instead of 0.51 to 0.84.
- t9 was built to show delegation paying off at ~165k tokens. It did not get there: every arm, including the one forced to load `delegate`, found the planted clauses with a script instead of reading all 150 contracts, and none delegated. Opus scripts its way through regular documents; delegation pays off only on material a script cannot shortcut, which synthetic fixtures do not provide. The delegation rules are therefore checked for not wasting tokens, not yet for saving them.
- The 10th-message trigger was unreliable while it lived in the skill: the model loaded the session rules in 1 of 6 forty-message runs. With the hook it loaded them in all 6 long-session runs of the final batch (t4 and t7).

### Experiment: a `tight` profile (discarded)

0.4 shipped an opt-in `tight` profile to test whether cutting output harder than the default would lower total cost. It replaced the reply rules with `Done.` confirmations, bare answers, no headings or tables, short reasoning, and the fewest calls, while keeping exact values, warnings, deliverables, and tests.

It did not work. On Opus 5.5 in batch 2 it cost 1.425 USD (+2% vs no plugins) against 1.387 for the default profile, and wrote about the same output (13.7k vs 13.9k tokens per rep). The model loaded the profile in only 4 of 10 runs even after the rule was made mandatory, and one t4 run made 29 tool calls instead of 17. What output is left is deliverables (code, emails, explanations), which frugal never shortens, and reasoning, which a skill cannot limit (`/effort low` does that). 0.5 removed `tight`.

### How this relates to the published numbers

- **caveman** reports 65% fewer output tokens on single API calls against a model with no system prompt, whose average reply was 1,214 tokens. Its README notes that the rules cost 1 to 1.5k input tokens per turn and that already-terse workloads can lose money.
- **ponytail** reports 54% fewer lines of code and 20% lower cost on 12 feature tasks in its harness, with Haiku 4.5 and n=4. Our runs of the same harness on two of those tasks agree on the date picker and show how noisy small tasks are at n=4.

### Reproduce

```
cd bench
python bench.py run --conds AE --reps 4 --out results      # A: no plugins, E: /frugal
python bench.py run --conds AE --tasks t1_bug,t4_long --out results
python bench.py report --out results

cd ponytail_agentic
FRUGAL_PLUGIN_DIR=<path to this repo> python run.py --task tmpl-fe-datepicker --arms baseline,ponytail,caveman,frugal --models haiku --runs 4
```

`bench.py run` skips runs that already have results, and does not save runs that hit the `claude -p` session limit, so re-running the same command fills the gaps. The system prompt changes between days (org skills, connector notices), so compare arms from the same batch, and discard the first run of a batch when it pays for writing the cache.

## Versions

- **0.12.0**: suggests the model and effort that fit each task (a subagent for bounded work, a prompt for a new chat otherwise); Fable in the delegation table; `review` and `compress` modules; usage totals in the CLI; code rules for the worker subagent and for every code task on Haiku and Sonnet; native UI elements named; root-cause rule in the core; the session hook ignores background-task notifications.
- **0.11.0**: a hook loads the session rules at the 10th message; frugal builds the default instead of stopping to ask. Benchmarked 6% cheaper than plain Claude Code on Opus 5.5 with 17% less output and the same pass rate.
- **0.10.0**: code rules in `code.md`, read with `core.md` only for code tasks.
- **0.9.0**: one direct read instruction first in the core (Haiku follows it); always-on code essentials; delegated parts verified by risk and escalated only on failure.
- **0.8.0, 0.8.1**: small always-on core; `core.md` and modules only for tasks over 3 tool calls or from the 10th message.
- **0.7.0**: delegation only for large inputs, never redone after delegating.
- **0.6.0**: always-on AI-tell rule; humanizer patterns 26 to 30 and a scoring step.
- **0.5.0, 0.5.1**: `tight` removed; modules read by path instead of listed as skills.
- **0.4.0 to 0.4.2**: first plugin build: per-task modules, delegation to haiku and sonnet subagents, session handoff, experimental `tight` profile.
- **0.3.0 to 0.3.3**: modular skills, standalone (no caveman or ponytail needed), opt-in humanizer.
- **0.2.0**: light and heavy work triaged per message; coding and analysis profiles dropped.
- **0.1.0, 0.1.1**: single skill on top of caveman and ponytail at `ultra`, with task profiles; the most expensive setup in the benchmarks.

## Licenses

frugal is MIT (see `LICENSE`). `humanizer` keeps its own MIT `LICENSE` file in its folder. `bench/ponytail_agentic` is ponytail's benchmark, MIT (see `LICENSE.ponytail`).
