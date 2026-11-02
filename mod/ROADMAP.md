# frugal-mod roadmap

Each phase is benchmarked with `bench/bench.py` against frugal 0.19.0 and dropped if it saves nothing. Every feature is a module the panel can turn on or off.

## Phases

1. Rule injection (done): code.md on the first code prompt, core.md + session.md at 25/45/65/85% context. /frugal detected from `skill.prompt`, no sh, no transcript grep. Rewrites the plugin's sh hook output so rules are not injected twice.
2. Handoff and compact by context %. Cold-cache warning (zero tokens) on return after the cache expired.
3. Zero-token Edit/Write gates: files over 1000 lines, filler comments.
4. Delegate, verify and escalate:
   - Accounts: the main one orchestrates; secondaries (Claude CLI with its own `CLAUDE_CONFIG_DIR`, Codex CLI, Anthropic API key, OpenAI-compatible endpoints, Ollama) do delegated work. Each stays inside its own limits; when the main one hits its limit, everything stops.
   - Default split: secondaries round-robin, main only as fallback or for high-judgment tasks. Optional per-account cap.
   - Small atomic tasks; a task cut off by a limit is retried elsewhere with its brief and its `git diff`.
   - Verification ladder: deterministic checks (tests, lint, build), then a cheap inspector, then a strong model only on failure or high risk. Max 2 retries, then main.
   - Model and effort per task type.
   - Free providers are opt-in per provider; no bundled keys.
5. Panel and band: accounts (add, remove, enable, paid or free, usage when the provider exposes it), tasks, modules (token class, ordered provider list, locks: main only, no provider, fixed). Filled from mod events, zero tokens.

## Modules after phase 5

- Session organizer: title prefix by repo on session start (zero tokens); batch sweep as a command or scheduled task that moves ungrouped sessions to their group, creating it if missing and skipping sessions that already have one; optional per-session move. Needs the desktop app's sidebar tools; unverified whether a scheduled task has them.
- Reflect per project: regex capture (zero tokens), classification on a secondary or free model, writes to project memory only on approval, size cap and dedupe. Off when claude-reflect is installed.
- Big-task workflow: injected once when a prompt looks large. Only with a big-task benchmark.

## Token classes

- none: no model call, no context.
- low: one small injection or call per session or event.
- normal: calls per task, or a medium injection.
- high: whole tasks on another model.
