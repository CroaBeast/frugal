import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account, AccountKind, Task, TaskStatus } from '../types'

const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const providers = atom({ plugin: 'frugal-mod', key: 'providers' } as const, {})
const tasks = atom({ plugin: 'frugal-mod', key: 'tasks' } as const, [])

export type Kind = 'search' | 'edit' | 'review' | 'classify'

export const PRESETS: Record<string, { kind: AccountKind; model: string; paid: boolean; baseUrl?: string; login: string }> = {
  claude: { kind: 'claude-cli', model: 'sonnet', paid: true, login: 'CLAUDE_CONFIG_DIR=~/.claude-<name> claude, then /login' },
  codex: { kind: 'codex-cli', model: '', paid: true, login: 'codex login' },
  anthropic: { kind: 'anthropic-api', model: 'claude-haiku-5-5', paid: true, baseUrl: 'https://api.anthropic.com/v1', login: 'set ANTHROPIC_API_KEY' },
  gemini: { kind: 'openai-compatible', model: 'gemini-2.5-flash', paid: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', login: 'set GEMINI_API_KEY' },
  groq: { kind: 'openai-compatible', model: 'llama-3.3-70b-versatile', paid: false, baseUrl: 'https://api.groq.com/openai/v1', login: 'set GROQ_API_KEY' },
  openrouter: { kind: 'openai-compatible', model: 'meta-llama/llama-3.3-70b-instruct:free', paid: false, baseUrl: 'https://openrouter.ai/api/v1', login: 'set OPENROUTER_API_KEY' },
  cerebras: { kind: 'openai-compatible', model: 'llama-3.3-70b', paid: false, baseUrl: 'https://api.cerebras.ai/v1', login: 'set CEREBRAS_API_KEY' },
  mistral: { kind: 'openai-compatible', model: 'mistral-small-latest', paid: false, baseUrl: 'https://api.mistral.ai/v1', login: 'set MISTRAL_API_KEY' },
  github: { kind: 'openai-compatible', model: 'openai/gpt-4.1-mini', paid: false, baseUrl: 'https://models.github.ai/inference', login: 'set GITHUB_TOKEN' },
  ollama: { kind: 'openai-compatible', model: 'qwen2.5-coder', paid: false, baseUrl: 'http://localhost:11434/v1', login: 'run ollama serve' },
}

// Claude CLI model and Codex effort per kind of task; HTTP providers use the account's model.
const CLAUDE_MODEL: Record<Kind, string> = { search: 'haiku', edit: 'sonnet', review: 'haiku', classify: 'haiku' }
const CODEX_EFFORT: Record<Kind, string> = { search: 'low', edit: 'medium', review: 'low', classify: 'low' }
const LIMIT = /usage limit|rate limit|limit reached|quota|too many requests|\b429\b/i
const HOUR = 3_600_000
const MAX_TRIES = 3
export const DELEGATE_TOOL = 'mcp__frugal-mod__delegate'
export const DELEGATE_SPEC = {
  name: 'delegate',
  description: `Run a bounded task on one of the user's secondary accounts (another Claude login, Codex, or a free model) so this session spends fewer tokens. Use for repo searches and mechanical edits with a clear brief; pass a shell check when one exists. Not for design or judgment calls. If it answers "do it here", do the task yourself.`,
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The full brief: goal, exact paths, done-when.' },
      kind: { type: 'string', enum: ['search', 'edit'] },
      check: { type: 'string', description: 'Shell command that exits 0 when the task is done right.' },
    },
    required: ['task', 'kind'],
  },
  isDeferred: false,
}

// HTTP providers see only the prompt, so they cannot search or edit the repo.
export const serves = (a: Account, kind: Kind) => a.kind === 'claude-cli' || a.kind === 'codex-cli' || kind === 'review' || kind === 'classify'

export const modelFor = (a: Account, kind: Kind) => a.kind === 'claude-cli' ? CLAUDE_MODEL[kind] : a.kind === 'codex-cli' ? a.model || `default, ${CODEX_EFFORT[kind]} effort` : a.model

// An ordered provider list is a preference; with none, the least used account goes first.
export const candidates = (list: Account[], kind: Kind, order: string[], now: number, day: string) => {
  const ready = list.filter(a => a.enabled && serves(a, kind) && !((a.exhaustedUntil ?? 0) > now) &&
    !(a.cap && a.day === day && a.used >= a.cap))
  if (order.length) return order.map(id => ready.find(a => a.id === id)).filter((a): a is Account => !!a)
  return [...ready].sort((x, y) => (x.day === day ? x.used : 0) - (y.day === day ? y.used : 0))
}

const isOn = async ($: EngineInterface, id: string) => (await read($, modules))[id] ?? true

// $.env.get takes literal names only.
const keyFor = async ($: EngineInterface, preset: string) => {
  switch (preset) {
    case 'anthropic': return $.env.get('ANTHROPIC_API_KEY')
    case 'gemini': return $.env.get('GEMINI_API_KEY')
    case 'groq': return $.env.get('GROQ_API_KEY')
    case 'openrouter': return $.env.get('OPENROUTER_API_KEY')
    case 'cerebras': return $.env.get('CEREBRAS_API_KEY')
    case 'mistral': return $.env.get('MISTRAL_API_KEY')
    case 'github': return $.env.get('GITHUB_TOKEN')
    default: return 'none'
  }
}

const run = async ($: EngineInterface, a: Account, kind: Kind, prompt: string, cwd: string) => {
  if (a.kind === 'claude-cli' || a.kind === 'codex-cli') {
    const argv = a.kind === 'claude-cli'
      ? ['claude', '-p', '--model', CLAUDE_MODEL[kind], ...(kind === 'edit' ? ['--permission-mode', 'acceptEdits'] : [])]
      : ['codex', 'exec', '--skip-git-repo-check', '-c', `model_reasoning_effort="${CODEX_EFFORT[kind]}"`,
          ...(a.model ? ['-m', a.model] : []), ...(kind === 'edit' ? ['--full-auto'] : []), '-']
    const env: Record<string, string> = a.configDir ? { CLAUDE_CONFIG_DIR: a.configDir } : {}
    const r = await $.process.run(argv, { cwd, env, stdin: prompt, timeoutMs: 10 * 60_000 })
    const out = r.stdout.trim()
    return { ok: r.exitCode === 0 && out !== '', text: out || r.stderr.trim(), limited: r.exitCode !== 0 && LIMIT.test(r.stderr + r.stdout) }
  }
  const key = await keyFor($, a.preset)
  if (!key) return { ok: false, text: `no API key for ${a.preset}`, limited: false }
  const isAnthropic = a.kind === 'anthropic-api'
  const r = await $.http.fetch(`${a.baseUrl}/${isAnthropic ? 'messages' : 'chat/completions'}`, {
    method: 'POST',
    headers: isAnthropic
      ? { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: a.model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) return { ok: false, text: `HTTP ${r.status}`, limited: r.status === 429 }
  const body = JSON.parse(r.text)
  const text: string = isAnthropic ? body.content?.[0]?.text ?? '' : body.choices?.[0]?.message?.content ?? ''
  return { ok: text !== '', text: text.trim(), limited: false }
}

const setTask = async ($: EngineInterface, id: string, patch: Partial<Task>) =>
  update($, tasks, list => list.map(t => t.id === id ? { ...t, ...patch } : t))

// Runs one prompt on the first account that answers, marking accounts that hit a limit.
const ask = async ($: EngineInterface, module: string, kind: Kind, prompt: string, cwd: string, skip: string[] = []) => {
  const now = await $.clock.now()
  const day = new Date(now).toISOString().slice(0, 10)
  const order = (await read($, providers))[module] ?? []
  for (const a of candidates(await read($, accounts), kind, order, now, day).filter(a => !skip.includes(a.id))) {
    const r = await run($, a, kind, prompt, cwd)
    await update($, accounts, list => list.map(x => x.id !== a.id ? x : r.limited
      ? { ...x, exhaustedUntil: now + HOUR }
      : { ...x, day, used: (x.day === day ? x.used : 0) + 1 }))
    await $.store.set('accounts', await read($, accounts))
    if (!r.limited) return { account: a, ...r }
  }
}

export const registerDelegate = (on: On) => {
  on('tool.call', { tool: DELEGATE_TOOL }, async ($, e) => {
    const input = e as unknown as { task: string; kind: Kind; check?: string }
    const cwd = (await $.session.cwd()) ?? '.'
    const id = e.tool_use_id
    const title = input.task.split('\n')[0]!.slice(0, 60)
    const verify = await isOn($, 'verify')
    await update($, tasks, list => [...list, { id, title, account: '', model: '', status: 'running' as TaskStatus, tries: 0 }].slice(-20))

    let failure = ''
    const tried: string[] = []
    for (let n = 1; n <= MAX_TRIES; n++) {
      const diff = failure && input.kind === 'edit' ? (await $.process.run(['git', 'diff', '--stat'], { cwd })).stdout : ''
      const prompt = `${input.task}${failure ? `\n\nA previous attempt failed: ${failure}${diff ? `\nCurrent git diff --stat:\n${diff}` : ''}` : ''}\n\nReply in under 150 words: what you found or changed, with file paths.`
      const r = await ask($, 'delegate', input.kind, prompt, cwd, tried)
      if (!r) break
      tried.push(r.account.id)
      await setTask($, id, { account: r.account.id, model: modelFor(r.account, input.kind), tries: n, status: 'running' })
      if (!r.ok) { failure = r.text.slice(-400); continue }

      if (input.check) {
        await setTask($, id, { status: 'checking' })
        const c = await $.process.run(['sh', '-c', input.check], { cwd, timeoutMs: 5 * 60_000 })
        if (c.exitCode !== 0) {
          failure = `check \`${input.check}\` failed: ${(c.stdout + c.stderr).slice(-400)}`
          await setTask($, id, { status: 'retrying' })
          continue
        }
      }
      if (verify && input.kind === 'edit') {
        await setTask($, id, { status: 'inspecting' })
        const v = await ask($, 'verify', 'review', `Brief:\n${input.task}\n\nResult:\n${r.text}\n\nDoes the result satisfy the brief? Answer PASS, or FAIL: <reason>.`, cwd)
        if (v?.ok && /^\W*FAIL/i.test(v.text)) {
          failure = `inspector (${v.account.id}): ${v.text.slice(0, 300)}`
          await setTask($, id, { status: 'retrying' })
          continue
        }
      }
      await setTask($, id, { status: 'accepted' })
      const done = `Done by ${r.account.id} (${modelFor(r.account, input.kind)})${input.check ? ', check passed' : ''}.\n${r.text.slice(0, 2000)}`
      return { result: done, text: done }
    }
    await setTask($, id, { status: 'escalated' })
    const failed = `frugal-mod: no secondary account finished this${failure ? ` (${failure})` : ''}. Do it here.`
    return { result: failed, text: failed }
  })

  // Rules are classified on a secondary or free account; with none, the user judges the raw text.
  on('command.run', { command: 'frugal-reflect' }, async $ => {
    const cwd = (await $.session.cwd()) ?? '.'
    const key = `reflect:${cwd}`
    const queue = ((await $.store.get(key)) as string[] | undefined) ?? []
    if (!queue.length) return { text: 'Nothing queued: frugal-mod saves corrections and "remember:" notes while /frugal is on.' }
    const saved: string[] = []
    for (const item of queue) {
      const c = await ask($, 'reflect', 'classify', `${REFLECT_PROMPT}\n\n${item}`, cwd)
      const rule = c?.ok ? c.text.split('\n')[0]!.trim() : item
      if (/^\W*SKIP\b/i.test(rule)) continue
      const pick = await $.ui.ask(`Save this rule to CLAUDE.local.md? ${rule}`, ['Save', 'Skip']).catch(() => 'Skip')
      if (pick === 'Save') saved.push(rule)
    }
    await $.store.set(key, [])
    if (!saved.length) return { text: `Reviewed ${queue.length}; nothing saved.` }
    const path = `${cwd}/CLAUDE.local.md`
    const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    await $.fs.write(path, mergeRules(before, saved))
    return { text: `Saved ${saved.length} of ${queue.length} to CLAUDE.local.md.` }
  })
}

const REFLECT_PROMPT = 'The user said this to a coding agent. If it states a preference or rule that should hold in future sessions of this project, rewrite it as one imperative rule under 20 words. If it only applies to the task at hand, answer SKIP. Answer with the rule or SKIP only.'
const OPEN = '<!-- frugal-reflect -->'
const CLOSE = '<!-- /frugal-reflect -->'
const MAX_RULES = 30

// Rules live in one marked section, deduplicated, newest kept when over the cap.
export const mergeRules = (file: string, rules: string[]) => {
  const start = file.indexOf(OPEN)
  const end = file.indexOf(CLOSE)
  const has = start >= 0 && end > start
  const old = has ? file.slice(start + OPEN.length, end).split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean) : []
  const seen = new Set<string>()
  const all = [...old, ...rules].reverse().filter(r => !seen.has(r.toLowerCase()) && seen.add(r.toLowerCase())).reverse().slice(-MAX_RULES)
  const section = `${OPEN}\n${all.map(r => `- ${r}`).join('\n')}\n${CLOSE}`
  if (has) return file.slice(0, start) + section + file.slice(end + CLOSE.length)
  return `${file}${file && !file.endsWith('\n') ? '\n' : ''}${file ? '\n' : ''}${section}\n`
}
