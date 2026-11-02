import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account } from '../types'
import { DELEGATE_SPEC } from './delegate'

const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const providers = atom({ plugin: 'frugal-mod', key: 'providers' } as const, {})

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
