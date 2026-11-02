---
name: accounts
description: Set up secondary Claude or Codex accounts that take frugal's delegated work, so the main account's limits last. Use when the user asks to add, list, remove or log in a secondary account, or asks why delegation is off.
---

# frugal: secondary accounts

Accounts live in `~/.frugal/accounts.json`. While it lists at least one account, frugal exposes the `delegate` tool, adds the delegation rule to each prompt, and sends test runs, long explorations and subagents to those accounts. With none, nothing changes.

Run the matching command with Bash and show its output; `<base>` is this skill's base directory.

- List: `python "<base>/../../accounts/server.py" list`
- Add a Claude login: `python "<base>/../../accounts/server.py" add claude <id>` (its config lives in `~/.claude-<id>`; a login terminal opens)
- Add Codex: `python "<base>/../../accounts/server.py" add codex <id>` (uses the Codex login on this machine)
- Log in again: `python "<base>/../../accounts/server.py" login <id>`
- Remove: `python "<base>/../../accounts/server.py" remove <id>`

After the first account is added, the `delegate` tool appears in the next session (or after `/mcp` reconnects the frugal server).
