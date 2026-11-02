# frugal-mod roadmap

Each phase is benchmarked with `bench/bench.py` against frugal 0.19.0 and dropped if it saves nothing. Every feature is a module the panel can turn on or off.

## Phases

1. Rule injection (done): code.md on the first code prompt, core.md + session.md at 25/45/65/85% context. /frugal detected from `skill.prompt`, no sh, no transcript grep. Rewrites the plugin's sh hook output so rules are not injected twice.
2. Handoff and compact (done): handoff nudge at 40/60% context with the usage line precomputed, so the model skips get_usage. At 80%, compacts when the turn ends (the engine refuses it from prompt.submit). Every compaction while frugal is on, /compact and auto-compaction included, is summarized in the handoff format, and the rules are injected again afterwards. On a cold cache (idle past the TTL with 20k+ tokens of context) it asks Send or Cancel; with nobody to ask (`-p`) it sends.
3. Zero-token Edit/Write gates (done): denies an Edit or Write that grows a file past 1000 lines (shrinking an already large file goes through), and new comment lines that narrate the edit (`// Added ...`), restate the next line in six words or less (`// Increment i`), or label structure (`// Constructor`). Comments already in the file are not judged. Line comments only, by extension (`//`, `#`, `--`); markdown and other text files are skipped.
4. Delegate, verify and escalate (done): a `delegate` tool (`mcp__frugal-mod__delegate`, task + kind `search` or `edit` + optional shell check), listed only when a secondary account is on.
   - Accounts: the main one orchestrates and is never driven by the mod. Secondaries: Claude CLI with its own `CLAUDE_CONFIG_DIR`, Codex CLI, an Anthropic API key, and OpenAI-compatible endpoints (Gemini, Groq, OpenRouter, Cerebras, Mistral, GitHub Models, Ollama). Keys come from environment variables; none are stored or bundled. HTTP accounts only judge text (inspector, reflect); they cannot search or edit the repo.
   - Split: an ordered provider list per module is a preference; with none, the least used account today goes first. Optional daily cap per account.
   - An account whose CLI or API reports a limit is skipped for an hour and the task goes to the next one. Usage and limits persist across sessions.
   - Ladder: the task's shell check, then an inspector (Verify module) for edits, then up to 3 tries on different accounts with the failure and `git diff --stat`, then "do it here" back to the main session.
   - Claude CLI runs haiku for searches and reviews, sonnet for edits; Codex runs low effort for searches and medium for edits.
5. Panel and band (done): `/frugal-panel` opens a pane with tabs. Accounts: main usage line, each secondary (on/off, paid/free, preset, model, uses today, at its limit), remove, and an add form (provider preset + name, with the login step). Modules: on/off, token class, lock (main only, no provider, fixed) or an ordered, editable provider list. Tasks: delegated tasks with status, account, model and tries. A band above the prompt shows task progress and secondary accounts while /frugal is on. All drawn from mod state, zero tokens.

## Modules

- Session organizer (done): a brand-new session is filed into its group with `move_sessions` on "self": the group other sessions from the same folder are in, else a group named in the title, else one named after the project folder (created if missing). `/frugal-organize` does the same for every ungrouped session; sessions already in a group, home and scratch folders are left alone. Uses the desktop app's sidebar tools through `$.mcp.call`, zero tokens; does nothing in the CLI. Can run on a schedule with `/schedule`.
- Reflect per project (done): while /frugal is on, corrections ("no, ...", "don't ...", "never ...", "en vez de ...") and "remember:" notes are queued per project folder, zero tokens. `/frugal-reflect` rewrites each as a rule on a reflect provider (or shows the raw text with none), asks Save or Skip, and writes saved rules to a marked section of `CLAUDE.local.md`, deduplicated and capped at 30. Detecting claude-reflect to avoid double capture is not done.
- Big-task workflow: injected once when a prompt looks large. Only with a big-task benchmark.

## Token classes

- none: no model call, no context.
- low: one small injection or call per session or event.
- normal: calls per task, or a medium injection.
- high: whole tasks on another model.
