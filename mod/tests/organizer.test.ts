import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { groupFor, projectName } from '../hooks/session'

const REPO = 'C:\\Users\\me\\Documents\\frugal-plugin'
const START = { cwd: REPO, surface: 'desktop', isInteractive: true } as const
const groups = [{ id: 'g1', name: 'Archived' }, { id: 'g2', name: 'DevStand' }]
const rows = [
  { sessionId: 'a', title: 'DevStand outreach', cwd: 'C:', group: null },
  { sessionId: 'b', title: 'Fix the parser', cwd: REPO, group: null },
  { sessionId: 'c', title: 'Old notes', cwd: 'C:\\Users\\me', group: null },
  { sessionId: 'd', title: 'Pinned work', cwd: REPO, group: { id: 'g2', name: 'DevStand' } },
]

type Call = { tool: string; args: Record<string, unknown> }

const engine = (on: On, calls: Call[], messages: unknown[] = []) => {
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: messages as never }))
  on('command.register', () => ({ value: {} as never }))
  on('mcp.call', (_, e) => {
    calls.push({ tool: e.tool, args: e.args })
    const data = e.tool === 'list_groups' ? groups : e.tool === 'list_sessions' ? rows : e.tool === 'create_group' ? { id: 'new' } : 'ok'
    return { value: { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false } }
  })
}

test('a project is a folder deeper than home; scratch folders and drive roots are not', () => {
  expect(projectName(REPO)).toBe('frugal-plugin')
  expect(projectName('C:')).toBeNull()
  expect(projectName('C:\\Users\\me')).toBeNull()
  expect(projectName('C:\\Users\\me\\AppData\\Roaming\\Claude\\scratch-workspaces\\x\\y')).toBeNull()
})

test('the group the folder is already filed under wins, then a group the title names', () => {
  expect(groupFor(REPO, 'anything', rows, groups)).toBe('DevStand')
  expect(groupFor('C:', 'DevStand outreach', rows, groups)).toBe('DevStand')
  expect(groupFor('C:', 'Archived notes', rows, groups)).toBeNull()
  expect(groupFor('C:\\Users\\me\\code\\api', 'x', rows, groups)).toBe('api')
})

test('a new session is filed with "self"; a resumed one is left alone', async ($, on) => {
  const calls: Call[] = []
  engine(on, calls)
  await $.session.start(START)
  expect(calls.find(c => c.tool === 'move_sessions')?.args).toEqual({ session_ids: ['self'], group_id: 'g2' })
})

test('a resumed session is not moved', async ($, on) => {
  const calls: Call[] = []
  engine(on, calls, [{ role: 'user', text: 'hi', toolUses: [] }])
  await $.session.start(START)
  expect(calls).toHaveLength(0)
})

test('/frugal-organize files ungrouped sessions and skips the rest', async ($, on) => {
  const calls: Call[] = []
  engine(on, calls)
  const r = await $.command.run({ command: 'frugal-organize', args: '' } as never)
  const moves = calls.filter(c => c.tool === 'move_sessions').map(c => c.args)
  expect(moves).toEqual([{ session_ids: ['a', 'b'], group_id: 'g2' }])
  expect(r.text).toContain('Filed 2 sessions into 1 groups; 1 left ungrouped')
})
