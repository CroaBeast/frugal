"""frugal accounts: secondary Claude and Codex logins that take delegated work.

One file, stdlib only, four roles:
  server.py                 MCP server (stdio) exposing `delegate` while an account is set up
  server.py hook-prompt     UserPromptSubmit hook: the delegation rule, then a one-line reminder
  server.py hook-pretool    PreToolUse hook: sends test runs, long explorations and subagents to delegate
  server.py list | add <claude|codex> <id> | remove <id> | login <id> | selftest
Nothing happens while ~/.frugal/accounts.json lists no account, so frugal without accounts is unchanged.
"""
import concurrent.futures, datetime, json, os, re, shutil, subprocess, sys, threading, time
from pathlib import Path

HOME = Path.home()
DIR = HOME / ".frugal"
FILE = DIR / "accounts.json"
TOOL = "mcp__plugin_frugal_accounts__delegate"
DELEGATED = "FRUGAL_DELEGATED"  # set on every delegated run, so it never delegates again
LOCK = threading.Lock()

LEVELS = ["light", "standard", "heavy", "max"]
EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]
# Per provider: model and effort per level, and the efforts it takes (claude --help, ~/.codex/models_cache.json).
RULES = {
    "claude": {"efforts": ["low", "medium", "high", "xhigh", "max"],
               "levels": {"light": ("haiku", "low"), "standard": ("sonnet", "medium"), "heavy": ("opus", "high"), "max": ("opus", "max")}},
    "codex": {"efforts": ["low", "medium", "high", "xhigh", "max", "ultra"],
              "levels": {"light": ("gpt-6-luna", "low"), "standard": ("gpt-6.1-sol", "medium"), "heavy": ("gpt-6.1-sol", "high"), "max": ("gpt-6-astra", "xhigh")}},
}
DEFAULT_LEVEL = {"search": "light", "run": "light", "edit": "standard"}
LIMIT = re.compile(r"usage limit|rate limit|limit reached|session limit|quota|too many requests|\b429\b", re.I)
HEAVY_RUN = re.compile(r"\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck)\b|\b(pytest|jest|vitest|tsc|gradlew?|mvn|bench\.py)\b"
                       r"|\b(cargo|go|dotnet)\s+(test|build)\b|\bclaude\s+plugin\s+test\b", re.I)
EXPLORE_BUDGET = 4
MAX_TRIES = 3
HOUR = 3600


def load():
    try:
        return json.loads(FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"accounts": []}


def save(data):
    DIR.mkdir(exist_ok=True)
    tmp = FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, FILE)  # atomic, so parallel sessions never leave a half-written file


def today():
    return datetime.date.today().isoformat()


def ready(accounts, now=None):
    now = time.time() if now is None else now
    return [a for a in accounts if a.get("enabled", True) and a.get("exhausted_until", 0) <= now]


def active():
    return not os.environ.get(DELEGATED) and bool(ready(load()["accounts"]))


def fit(effort, efforts):
    i = EFFORTS.index(effort) if effort in EFFORTS else 1
    below = [e for e in efforts if EFFORTS.index(e) <= i]
    return below[-1] if below else efforts[0]


def choose(a, kind, level=None, effort=None):
    rule = RULES[a["kind"]]
    model, base = rule["levels"][level if level in LEVELS else DEFAULT_LEVEL.get(kind, "light")]
    # A Codex model the login does not list falls back to the one in its config.toml.
    if a["kind"] == "codex" and model not in (a.get("models") or []):
        model = None
    return model, fit(effort or base, rule["efforts"])


def order(accounts, busy):
    day = today()
    return sorted(ready(accounts), key=lambda a: busy.get(a["id"], 0) * 1000 + (a.get("used", 0) if a.get("day") == day else 0))


def codex_models():
    try:
        cache = json.loads((HOME / ".codex" / "models_cache.json").read_text(encoding="utf-8"))
        return [m["slug"] for m in cache.get("models", []) if m.get("visibility") != "hide"]
    except (OSError, ValueError, KeyError):
        return []


def argv_for(a, kind, model, effort):
    if a["kind"] == "claude":
        tools = ["--allowedTools", "Bash Read Grep Glob"] if kind in ("search", "run") else ["--permission-mode", "acceptEdits"]
        return ["claude", "-p", "--model", model, "--effort", effort, *tools]
    sandbox = ["-s", "workspace-write"] if kind in ("edit", "run") else []
    return ["codex", "exec", "--skip-git-repo-check", *(["-m", model] if model else []), "-c", f"model_reasoning_effort={effort}", *sandbox, "-"]


def run_cli(argv, prompt, cwd, env):
    exe = shutil.which(argv[0])  # finds npm's .cmd shims on Windows
    if not exe:
        return 127, "", f"{argv[0]} not found"
    try:
        p = subprocess.run([exe, *argv[1:]], input=prompt, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", "timed out after 10 minutes"


def run_check(check, cwd):
    try:
        p = subprocess.run(check, shell=True, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        return p.returncode, (p.stdout + p.stderr)[-400:]
    except subprocess.TimeoutExpired:
        return 124, "check timed out after 5 minutes"


BUSY = {}


def brief(text, kind, check, level, effort, cwd):
    failure, tried = "", []
    for n in range(1, MAX_TRIES + 1):
        with LOCK:
            data = load()
            pool = [a for a in order(data["accounts"], BUSY) if a["id"] not in tried]
            if not pool:
                break
            a = pool[0]
            BUSY[a["id"]] = BUSY.get(a["id"], 0) + 1
        tried.append(a["id"])
        model, eff = choose(a, kind, level, effort)
        prompt = (f"{text}\n\nA previous attempt failed: {failure}" if failure else text) + \
            "\n\nReply in under 150 words: what you found or changed, with file paths."
        env = {**os.environ, DELEGATED: "1", **({"CLAUDE_CONFIG_DIR": a["config_dir"]} if a.get("config_dir") else {})}
        try:
            code, out, err = run_cli(argv_for(a, kind, model, eff), prompt, cwd, env)
        finally:
            with LOCK:
                BUSY[a["id"]] -= 1
        with LOCK:
            data = load()
            for x in data["accounts"]:
                if x["id"] == a["id"]:
                    if code != 0 and LIMIT.search(out + err):
                        x["exhausted_until"] = time.time() + HOUR
                    else:
                        x["used"] = (x.get("used", 0) if x.get("day") == today() else 0) + 1
                        x["day"] = today()
            save(data)
        label = f"{a['id']} ({', '.join(filter(None, [model, f'{eff} effort']))})"
        if code != 0 or not out:
            failure = (err or out or f"exit {code}")[-400:]
            continue
        if check:
            c, tail = run_check(check, cwd)
            if c != 0 and kind == "run":
                return f"Run by {label}; check `{check}` exited {c}:\n{tail}\n\n{out[:2000]}"
            if c != 0:
                failure = f"check `{check}` failed: {tail}"
                continue
        return f"Done by {label}{', check passed' if check else ''}.\n{out[:2000]}"
    return f"frugal: no secondary account finished this{f' ({failure})' if failure else ''}. Do it here."


SPEC = {
    "name": "delegate",
    "description": "Runs bounded work on the user's secondary accounts so this account's limits last: searches, reading or summarizing files, "
                   "test or build runs, edits you can brief exactly. Independent pieces go in \"tasks\" and run in parallel. "
                   "Keep design and the final check here; \"do it here\" means do it yourself.",
    "inputSchema": {"type": "object", "required": ["kind"], "properties": {
        "task": {"type": "string", "description": "Goal, exact paths, done-when."},
        "tasks": {"type": "array", "items": {"type": "string"}, "description": "Independent briefs, run in parallel."},
        "kind": {"type": "string", "enum": ["search", "edit", "run"], "description": "search: read-only. edit: changes files. run: runs commands and reports."},
        "check": {"type": "string", "description": "Shell command that exits 0 when done right."},
        "level": {"type": "string", "enum": LEVELS, "description": "light: searches, reads. standard: edits, test runs. heavy: hard multi-file work. max: after heavy failed."},
        "effort": {"type": "string", "enum": EFFORTS[:-1], "description": "Overrides the effort of the level."},
    }},
}


def delegate(args):
    briefs = [*(args.get("tasks") or []), *([args["task"]] if args.get("task") else [])]
    if not briefs:
        return "frugal: give a task or tasks."
    cwd = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    with concurrent.futures.ThreadPoolExecutor(len(briefs)) as ex:
        out = list(ex.map(lambda b: brief(b, args.get("kind", "search"), args.get("check"), args.get("level"), args.get("effort"), cwd), briefs))
    return out[0] if len(out) == 1 else "\n\n".join(f"## Task {i}\n{r}" for i, r in enumerate(out, 1))


def serve():
    def send(msg):
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        rid, method = req.get("id"), req.get("method")
        if rid is None:
            continue  # notifications
        if method == "initialize":
            result = {"protocolVersion": req.get("params", {}).get("protocolVersion", "2025-06-18"),
                      "capabilities": {"tools": {}}, "serverInfo": {"name": "frugal-accounts", "version": "1"}}
        elif method == "tools/list":
            result = {"tools": [SPEC] if active() else []}
        elif method == "tools/call":
            p = req.get("params", {})
            text = delegate(p.get("arguments") or {}) if p.get("name") == "delegate" and active() else "frugal: no secondary account is set up."
            result = {"content": [{"type": "text", "text": text}]}
        elif method == "ping":
            result = {}
        else:
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"unknown method {method}"}})
            continue
        send({"jsonrpc": "2.0", "id": rid, "result": result})


# Hooks keep per-session state (rule shown, reads this prompt, waived denials) next to the accounts file.
def state(sid):
    return DIR / f"session-{re.sub(r'[^A-Za-z0-9_-]', '', sid)[:64]}.json"


def read_state(sid):
    try:
        return json.loads(state(sid).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def hook_prompt(event):
    if not active():
        return ""
    sid = event.get("session_id", "")
    s = read_state(sid)
    ids = ", ".join(a["id"] for a in ready(load()["accounts"]))
    first = s.get("announced") != ids
    DIR.mkdir(exist_ok=True)
    state(sid).write_text(json.dumps({**s, "announced": ids, "reads": 0, "agent": False}), encoding="utf-8")
    if first:
        return (f"frugal: secondary accounts {ids} are set up. Delegate every bounded task with {TOOL}, level per task; "
                "keep here only design, judgment calls and the final check.")
    return f"frugal: delegate bounded work to {ids}; keep here only design and the final check."


def gate(event):
    """The reason to send this tool call to delegate, or None to let it run."""
    if not active() or event.get("agent_id"):
        return None
    sid, tool, inp = event.get("session_id", ""), event.get("tool_name", ""), event.get("tool_input") or {}
    s = read_state(sid)
    reason = None
    if tool in ("Bash", "PowerShell"):
        cmd = inp.get("command", "")
        head = re.split(r"<<-?\s*['\"]?\w+", cmd)[0]  # a heredoc body is data, not a command run here
        if HEAVY_RUN.search(head) and "CLAUDE_CONFIG_DIR=" not in head and cmd not in s.get("waived", []):
            s["waived"] = [*s.get("waived", []), cmd][-20:]
            reason = (f"frugal: a secondary account runs this, not the main one. Call {TOOL} with kind \"run\", the command as \"check\" "
                      "and a brief asking for the failures. If it answers \"do it here\", run the same command again and it goes through.")
    elif tool in ("Read", "Grep", "Glob"):
        s["reads"] = s.get("reads", 0) + 1
        if s["reads"] == EXPLORE_BUDGET + 1:
            reason = (f"frugal: {EXPLORE_BUDGET} reads and searches this prompt already. Hand the rest of this exploration to {TOOL} "
                      "(kind \"search\", pieces in \"tasks\") and work from its summary. If you need the raw text here, call again.")
    elif tool == "Agent" and not s.get("agent"):
        s["agent"] = True
        reason = (f"frugal: a subagent here runs on the main account. Give this to {TOOL} instead (one brief per piece in \"tasks\"). "
                  "If it needs this session's own tools, call again and it goes through.")
    DIR.mkdir(exist_ok=True)
    state(sid).write_text(json.dumps(s), encoding="utf-8")
    return reason


def login(a):
    env = {"CLAUDE_CONFIG_DIR": a["config_dir"]} if a.get("config_dir") else {}
    cmd = "codex login" if a["kind"] == "codex" else "claude auth login"
    if os.name == "nt":
        sets = "".join(f'set "{k}={v}" && ' for k, v in env.items())
        subprocess.Popen(f'start "frugal login {a["id"]}" cmd /k "{sets}{cmd}"', shell=True)
        return f"Opened a terminal for {a['id']}: sign in there, then close it."
    return f"Run in a terminal: {' '.join(f'{k}={v}' for k, v in env.items())} {cmd}".strip()


def cli(args):
    data = load()
    if args[:1] == ["list"] or not args:
        rows = [f"{a['id']}: {a['kind']}{' (off)' if not a.get('enabled', True) else ''}, used today {a.get('used', 0) if a.get('day') == today() else 0}"
                + (", at its limit" if a.get("exhausted_until", 0) > time.time() else "") for a in data["accounts"]]
        return "\n".join(rows) or "No secondary accounts. Add one with: add claude <id> | add codex <id>"
    if args[0] == "add" and len(args) == 3 and args[1] in RULES:
        kind, aid = args[1], args[2]
        if any(a["id"] == aid for a in data["accounts"]):
            return f"{aid} is already set up."
        a = {"id": aid, "kind": kind, "enabled": True, "used": 0, "day": ""}
        if kind == "claude":
            a["config_dir"] = str(HOME / f".claude-{aid}")
        else:
            a["models"] = codex_models()
        data["accounts"].append(a)
        save(data)
        return f"Added {aid}. " + login(a)
    if args[0] == "remove" and len(args) == 2:
        data["accounts"] = [a for a in data["accounts"] if a["id"] != args[1]]
        save(data)
        return f"Removed {args[1]}."
    if args[0] == "login" and len(args) == 2:
        a = next((a for a in data["accounts"] if a["id"] == args[1]), None)
        return login(a) if a else f"No account {args[1]}."
    return __doc__


def selftest():
    claude = {"id": "c", "kind": "claude"}
    codex = {"id": "x", "kind": "codex", "models": ["gpt-6-luna", "gpt-6.1-sol"]}
    assert choose(claude, "search") == ("haiku", "low")
    assert choose(claude, "edit", "heavy") == ("opus", "high")
    assert choose(claude, "search", effort="minimal") == ("haiku", "low")
    assert choose(codex, "search") == ("gpt-6-luna", "low")
    assert choose(codex, "edit", "max") == (None, "xhigh")
    now = time.time()
    pool = [{"id": "a", "used": 5, "day": today()}, {"id": "b", "used": 1, "day": today()}, {"id": "off", "enabled": False},
            {"id": "lim", "exhausted_until": now + 60}, {"id": "old", "used": 9, "day": "2000-01-01"}]
    assert [a["id"] for a in order(pool, {})] == ["old", "b", "a"]
    assert [a["id"] for a in order(pool, {"old": 1})] == ["b", "a", "old"]
    assert "--effort" in argv_for(claude, "search", "haiku", "low") and "Bash Read Grep Glob" in argv_for(claude, "search", "haiku", "low")
    assert argv_for(codex, "run", None, "low")[-3:] == ["-s", "workspace-write", "-"]
    assert HEAVY_RUN.search("cd x && npm test") and not HEAVY_RUN.search(re.split(r"<<-?\s*['\"]?\w+", "python - <<'EOF'\nnpm test\nEOF")[0])
    return "selftest ok"


if __name__ == "__main__":
    cmd = sys.argv[1:]
    if not cmd:
        serve()
    elif cmd[0] in ("hook-prompt", "hook-pretool"):
        event = json.loads(sys.stdin.read() or "{}")
        if cmd[0] == "hook-prompt":
            print(hook_prompt(event))
        elif (reason := gate(event)):
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    elif cmd[0] == "selftest":
        print(selftest())
    else:
        print(cli(cmd))
