# frugal

A low-token working mode for Claude Code. Type `/frugal` and it stays on for the rest of the session.

The plugin ships two skills:

| Skill | What it does | Source |
|---|---|---|
| `frugal` | Token-saving rules, task profiles, model routing for subagents, and handoff to a fresh chat | this repo |
| `humanizer` | Rewrites AI-sounding text so it reads like a person wrote it | [blader/humanizer](https://github.com/blader/humanizer), MIT |

## What frugal does

On top of whatever you ask for, Claude follows these rules for the session:

1. [caveman](https://github.com/juliusbrussee/caveman) shortens Claude's chat replies, and [ponytail](https://github.com/DietrichGebert/ponytail) pushes it toward the shortest code that works. frugal does not switch them on; both have to be installed and set to `ultra` (see below).
2. Claude reads a file before editing it and does not read it again unless it changed. It reads only the slice it needs and uses grep instead of opening whole files. It does not guess APIs, versions, or package names, and it skips emojis and filler.
3. Customer emails, support-ticket replies, tickets, and docs are written in normal prose and then run through `humanizer`.
4. Five profiles live in `skills/frugal/profiles/`: coding, analysis, agents, compressed, and benchmark. Claude loads only the ones the current task needs and checks again on every message. You can also pick them yourself with `/frugal analysis coding`.
5. Large searches and log reading go to a `haiku` subagent, and bounded edits go to `sonnet`. Decisions and the final answer stay with the main model.
6. When the `/effort` level does not fit the task, Claude suggests a change once.
7. When something ambiguous would change the result, Claude asks before guessing and batches its questions into one round.
8. Every message re-sends the whole history, so long chats get expensive. Between the 10th and 20th message, if work remains, Claude gives you a block to paste into a new chat. The block includes current usage from `get_usage`.

## What you get

- Shorter replies, so fewer output tokens.
- Less context piling up, because Claude reads in slices, delegates, and hands off long chats in time.
- Heavy mechanical work done by cheaper models.
- Less rework, since Claude checks APIs instead of guessing and asks when something is unclear.
- Emails and docs that do not read like AI wrote them.

There is no measurement of frugal's total savings. To see your real usage, run `/usage`, or ask for session usage in the desktop app.

## Requirements

| Requirement | Required | Without it |
|---|---|---|
| Claude Code (CLI or desktop app) | yes | nothing works |
| caveman plugin | no | chat replies are not compressed |
| ponytail plugin | no | the minimal-code rule does not apply |
| `ultra` config for caveman and ponytail | no | both plugins run at their default level |
| `get_usage` (desktop app only) | no | the handoff block shows `Usage: unavailable` |
| `CLAUDE_CODE_SUBAGENT_MODEL` in settings | no | subagents without an explicit model use the session model |

## Install

1. Add this plugin from its folder, or from the repo if you publish it:

   ```
   /plugin marketplace add <path-to-this-folder>
   /plugin install frugal@frugal
   ```

2. Install caveman and ponytail:

   ```
   /plugin marketplace add juliusbrussee/caveman
   /plugin install caveman@caveman
   /plugin marketplace add DietrichGebert/ponytail
   /plugin install ponytail@ponytail
   ```

3. Create these two files, each containing `{"defaultMode": "ultra"}`:

   | OS | caveman | ponytail |
   |---|---|---|
   | Windows | `%APPDATA%\caveman\config.json` | `%APPDATA%\ponytail\config.json` |
   | macOS, Linux | `~/.config/caveman/config.json` | `~/.config/ponytail/config.json` |

4. Open a new session and type `/frugal`.

If you already have `humanizer` installed separately, uninstall that copy. Otherwise it shows up twice in the skill list, which costs extra tokens and can make Claude pick the wrong one.

## Usage

```
/frugal                   # profiles picked automatically per task
/frugal analysis          # force the analysis profile for this message
/frugal coding agents     # several profiles
```

To change a plugin's level mid-session, type `/caveman <level>` or `/ponytail <level>` yourself. A level change made by Claude does not stick.

## Licenses

`humanizer` is MIT licensed and keeps its `LICENSE` file in its folder.
