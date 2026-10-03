#!/bin/sh
# Counts user prompts per session. At the 10th (then every 15th) prompt of a session where /frugal is active,
# tells the model to read its session rules: a skill cannot count messages reliably, a hook can.
# Leaves one small counter file per session in CLAUDE_PLUGIN_DATA; prune by age if that ever matters.
input=$(cat)
field() { printf '%s' "$input" | sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p"; }
sid=$(field session_id)
[ -n "$sid" ] || exit 0
dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}"
mkdir -p "$dir" 2>/dev/null
n=$(( $(cat "$dir/count-$sid" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$dir/count-$sid"
case $n in 10|25|40|55|70|85|100) ;; *) exit 0 ;; esac
transcript=$(field transcript_path | sed 's/\\\\/\//g')
grep -qE 'command-name>/frugal|"skill":"frugal' "$transcript" 2>/dev/null || exit 0
root=$(printf '%s' "$CLAUDE_PLUGIN_ROOT" | sed 's/\\/\//g')
echo "frugal: this is the user's message $n. Read $root/skills/frugal/core.md and $root/skills/frugal/modules/session.md once, batched with your next tool call or before replying, and apply them."
