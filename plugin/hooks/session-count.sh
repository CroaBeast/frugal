#!/bin/sh
# Runs on every user prompt; prints nothing unless /frugal is active in this session.
# - First code-looking prompt: injects code.md, so the model has the code rules without spending a turn on Read.
# - 10th prompt, then every 15th: injects core.md and session.md (a skill cannot count messages reliably; a hook can).
# Keeps small per-session marker files in CLAUDE_PLUGIN_DATA; prune by age if that ever matters.
input=$(cat)
field() { printf '%s' "$input" | sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p"; }
sid=$(field session_id)
[ -n "$sid" ] || exit 0
# Background-task notifications arrive as prompts too; only count what the user typed.
printf '%s' "$input" | grep -q '<task-notification>' && exit 0
dir="${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}}"
mkdir -p "$dir" 2>/dev/null
n=$(( $(cat "$dir/count-$sid" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$dir/count-$sid"
prompt=$(field prompt)
transcript=$(field transcript_path | sed 's/\\\\/\//g')
active() { printf '%s' "$prompt" | grep -q '/frugal' || grep -qE 'command-name>/frugal|"skill":"frugal' "$transcript" 2>/dev/null; }
root=$(printf '%s' "$CLAUDE_PLUGIN_ROOT" | sed 's/\\/\//g')
skill="$root/skills/frugal"
case $n in 10|25|40|55|70|85|100)
  active || exit 0
  echo "frugal: this is the user's message $n. The session rules below are loaded; apply them."
  cat "$skill/core.md" "$skill/modules/session.md"
  exit 0 ;;
esac
[ -f "$dir/code-$sid" ] && exit 0
printf '%s' "$prompt" | grep -qiE '\b(implement|fix|bug|refactor|endpoint|component|function|class|method|test|crash|exception|traceback|migrat|review|diff|commit|compile|build|add|api|script|code)|\.(py|ts|tsx|js|jsx|go|rs|java|kt|cs|rb|php|cpp|c|h|sql|css|html|sh)\b' || exit 0
active || exit 0
touch "$dir/code-$sid"
echo "frugal code rules (loaded by a hook; do not Read code.md):"
cat "$skill/code.md"
