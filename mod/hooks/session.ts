import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account } from '../types'

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

const isOn = async ($: EngineInterface, id: string) => (await read($, modules))[id] ?? true

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

    if ((await isOn($, 'delegate')) && (a ?? []).some(x => x.enabled)) {
      await $.tool.register({
        name: 'delegate',
        description: 'Run a bounded task on one of the user\'s secondary accounts (another Claude login, Codex, or a free model) so this session spends fewer tokens. Use for repo searches and mechanical edits with a clear brief; pass a shell check when one exists. Not for design or judgment calls. If it answers "do it here", do the task yourself.',
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
      })
    }

    return r
  })
}
