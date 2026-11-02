import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account } from '../types'
import { DELEGATE_SPEC, PRESETS } from './delegate'

const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const providers = atom({ plugin: 'frugal-mod', key: 'providers' } as const, {})
const mainTasks = atom({ plugin: 'frugal-mod', key: 'mainTasks' } as const, [])
const now = atom({ plugin: 'frugal-mod', key: 'now' } as const, 0)
const turn = atom({ plugin: 'frugal-mod', key: 'turn' } as const, null)

export type TokenClass = 'none' | 'low' | 'normal' | 'high'
// main: acts on this session, so it cannot run on another account. none: uses no model. fixed: always on.
export type Lock = 'main' | 'none' | 'fixed'

export const MODULES: { id: string; name: string; tokens: TokenClass; lock?: Lock; why?: string }[] = [
  { id: 'rules', name: 'Rule injection', tokens: 'low', lock: 'main', why: 'writes to this session' },
  { id: 'handoff', name: 'Handoff and compact', tokens: 'low', lock: 'main', why: 'summarizes this session' },
  { id: 'cold-cache', name: 'Cold cache guard', tokens: 'none', lock: 'none', why: 'uses no model' },
  { id: 'gates', name: 'Edit and Write gates', tokens: 'none', lock: 'none', why: 'uses no model' },
  { id: 'delegate', name: 'Delegate tasks', tokens: 'high' },
  { id: 'verify', name: 'Verify and escalate', tokens: 'normal' },
  { id: 'organizer', name: 'Session organizer', tokens: 'none', lock: 'none', why: 'uses the sidebar, no model' },
  { id: 'reflect', name: 'Reflect per project', tokens: 'low' },
  { id: 'panel', name: 'Panel and band', tokens: 'none', lock: 'fixed', why: 'this menu' },
]

type Group = { id: string; name: string }
type Row = { sessionId: string; title: string; cwd: string; group?: Group | null }

// A folder deep enough to be a project; drive roots, home and scratch folders are not.
export const projectName = (cwd: string) => {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.length > 3 && !cwd.includes('scratch-workspaces') ? parts[parts.length - 1]! : null
}

// The group the user already files this folder under, then a group the title names, then the folder's name.
export const groupFor = (cwd: string, title: string, rows: Row[], groups: Group[]) => {
  const votes = new Map<string, number>()
  for (const r of rows) if (r.cwd === cwd && r.group) votes.set(r.group.name, (votes.get(r.group.name) ?? 0) + 1)
  const usual = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]
  const named = groups.find(g => g.name !== 'Archived' && title.toLowerCase().includes(g.name.toLowerCase()))?.name
  return usual ?? named ?? projectName(cwd)
}

const isOn = async ($: EngineInterface, id: string) => (await read($, modules))[id] ?? true

const sidebar = async ($: EngineInterface, server: string, tool: string, args: Record<string, unknown> = {}) => {
  const r = await $.mcp.call(server, tool, args)
  const text = r.content.find(c => c.type === 'text')?.text ?? ''
  if (r.isError) throw new Error(text)
  try { return JSON.parse(text) } catch { return text }
}

const groupId = async ($: EngineInterface, name: string, groups: Group[]) => {
  const found = groups.find(g => g.name.toLowerCase() === name.toLowerCase())
  if (found) return found.id
  const made = await sidebar($, 'ccd_sidebar', 'create_group', { name })
  const id: string = typeof made === 'string' ? made : made.id
  groups.push({ id, name })
  return id
}

// $.env.get takes literal names only.
const keyFor = async ($: EngineInterface, preset: string) => {
  switch (preset) {
    case 'anthropic': return $.env.get('ANTHROPIC_API_KEY')
    case 'gemini': return $.env.get('GEMINI_API_KEY')
    case 'grok': return $.env.get('XAI_API_KEY')
    case 'groq': return $.env.get('GROQ_API_KEY')
    case 'openrouter': return $.env.get('OPENROUTER_API_KEY')
    case 'cerebras': return $.env.get('CEREBRAS_API_KEY')
    case 'mistral': return $.env.get('MISTRAL_API_KEY')
    case 'github': return $.env.get('GITHUB_TOKEN')
    default: return undefined
  }
}

// Windows resolves npm's .cmd shims only through cmd.
const cli = async ($: EngineInterface, argv: string[]) =>
  (await $.env.get('OS')) === 'Windows_NT' ? ['cmd', '/c', ...argv] : argv

// Asks the provider whether the account is signed in, and on what plan.
const checkAccount = async ($: EngineInterface, a: Account): Promise<Partial<Account>> => {
  if (a.kind === 'claude-cli' || a.kind === 'codex-cli') {
    const argv = a.kind === 'claude-cli' ? ['claude', 'auth', 'status', '--json'] : ['codex', 'login', 'status']
    const env: Record<string, string> = a.configDir ? { CLAUDE_CONFIG_DIR: a.configDir } : {}
    const r = await $.process.run(await cli($, argv), { env, timeoutMs: 20_000 }).catch(() => null)
    const out = r ? r.stdout + r.stderr : ''
    if (!r || /not recognized|not found|ENOENT/i.test(out)) {
      return { status: 'missing', note: a.kind === 'codex-cli' ? 'CLI not installed (npm i -g @openai/codex)' : 'CLI not installed (npm i -g @anthropic-ai/claude-code)' }
    }
    if (a.kind === 'claude-cli') {
      const info = (() => { try { return JSON.parse(r.stdout) as { loggedIn?: boolean; subscriptionType?: string } } catch { return {} } })()
      if (!info.loggedIn) return { status: 'pending', note: 'Waiting for login' }
      const plan = info.subscriptionType
      return { status: 'connected', plan: plan ?? 'API key', paid: plan ? plan !== 'free' : undefined, note: undefined }
    }
    if (!/logged in/i.test(out)) return { status: 'pending', note: 'Waiting for login' }
    const chatgpt = /chatgpt/i.test(out)
    return { status: 'connected', plan: chatgpt ? 'ChatGPT' : 'API key', paid: chatgpt ? true : undefined, note: undefined }
  }
  const p = PRESETS[a.preset]
  const key = a.preset === 'ollama' ? 'ollama' : await keyFor($, a.preset)
  if (!p?.baseUrl) return { status: 'error', note: 'Unknown provider' }
  if (!key) return { status: 'pending', note: `Set ${p.env} and restart Claude` }
  const headers: Record<string, string> = a.kind === 'anthropic-api'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${key}` }
  const r = await $.http.fetch(`${p.baseUrl}/models`, { headers }).catch(() => null)
  if (!r) return { status: 'pending', note: a.preset === 'ollama' ? 'Ollama is not running' : 'No connection' }
  if (r.status === 401 || r.status === 403) return { status: 'error', note: 'Key rejected' }
  if (!r.ok) return { status: 'pending', note: `Provider answered ${r.status}` }
  const body = (() => { try { return JSON.parse(r.text) as { data?: { id: string }[] } } catch { return {} } })()
  const models = (body.data ?? []).map(m => m.id)
  if (a.preset === 'openrouter') {
    const k = await $.http.fetch('https://openrouter.ai/api/v1/key', { headers }).catch(() => null)
    const free = k?.ok ? (JSON.parse(k.text) as { data?: { is_free_tier?: boolean } }).data?.is_free_tier : undefined
    if (free !== undefined) return { status: 'connected', models, plan: free ? 'Free tier' : 'Paid', paid: !free, note: undefined }
  }
  return { status: 'connected', models, plan: a.preset === 'ollama' ? 'Local' : 'API key', paid: a.preset === 'ollama' ? false : undefined, note: undefined }
}

const checkAll = async ($: EngineInterface, onlyPending: boolean) => {
  const list = (await read($, accounts)).filter(a => !onlyPending || ['pending', 'missing'].includes(a.status ?? 'pending'))
  for (const a of list) {
    const patch = await checkAccount($, a)
    await update($, accounts, l => l.map(x => x.id === a.id ? { ...x, ...patch } : x))
  }
  if (list.length) await $.store.set('accounts', await read($, accounts))
}

export const registerSession = (on: On) => {
  // Accounts, module switches and provider lists outlive the session in $.store.
  on('session.start', async ($, e, next) => {
    const a = (await $.store.get('accounts')) as Account[] | undefined
    const m = (await $.store.get('modules')) as Record<string, boolean> | undefined
    const p = (await $.store.get('providers')) as Record<string, string[]> | undefined
    if (a) await update($, accounts, () => a)
    if (m) await update($, modules, () => m)
    if (p) await update($, providers, () => p)
    const r = await next(e)

    // One clock: elapsed time of running subagents every second, account checks every 4 (all of them first).
    let tick = 0
    $.clock.every(1000, () => {
      void (async () => {
        if ((await read($, mainTasks)).some(t => t.status === 'running') || (await read($, turn))?.running) {
          const at = await $.clock.now()
          await update($, now, () => at)
        }
        if (tick++ % 4 === 0) await checkAll($, tick > 1)
      })()
    })

    await $.command.register({ name: 'frugal-panel', description: 'Open the frugal-mod panel: accounts, modules, tasks' })
    await $.command.register({ name: 'frugal-organize', description: 'File ungrouped sessions into sidebar groups' })
    await $.command.register({ name: 'frugal-reflect', description: 'Review the corrections frugal-mod queued for this project' })

    if ((await isOn($, 'delegate')) && (a ?? []).some(x => x.enabled)) {
      await $.tool.register(DELEGATE_SPEC)
    }

    // Only a brand-new session is filed: a resumed one may sit where the user put it.
    if ((await isOn($, 'organizer')) && (await $.session.messages()).length === 0) {
      try {
        const groups: Group[] = await sidebar($, 'ccd_sidebar', 'list_groups')
        const rows: Row[] = await sidebar($, 'ccd_session_mgmt', 'list_sessions', { limit: 100 })
        const name = groupFor(e.cwd, '', rows, groups)
        if (name) await sidebar($, 'ccd_sidebar', 'move_sessions', { session_ids: ['self'], group_id: await groupId($, name, groups) })
      } catch {
        // No desktop sidebar here (CLI, -p): nothing to file.
      }
    }
    return r
  })

  on('command.run', { command: 'frugal-organize' }, async $ => {
    try {
      const groups: Group[] = await sidebar($, 'ccd_sidebar', 'list_groups')
      const rows: Row[] = await sidebar($, 'ccd_session_mgmt', 'list_sessions', { limit: 100 })
      const moves = new Map<string, string[]>()
      let left = 0
      for (const r of rows.filter(r => r.group === null)) {
        const name = groupFor(r.cwd, r.title, rows, groups)
        if (!name) { left++; continue }
        moves.set(name, [...(moves.get(name) ?? []), r.sessionId])
      }
      for (const [name, ids] of moves) {
        await sidebar($, 'ccd_sidebar', 'move_sessions', { session_ids: ids, group_id: await groupId($, name, groups) })
      }
      const moved = [...moves.values()].reduce((n, ids) => n + ids.length, 0)
      return { text: `Filed ${moved} sessions into ${moves.size} groups; ${left} left ungrouped (no project folder or group name in the title).` }
    } catch (err) {
      return { text: `The sidebar tools are not available here (${String(err).slice(0, 120)}). Run this in the desktop app.` }
    }
  })
}
