import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Account } from '../types'

const START = { cwd: '/repo', surface: 'desktop', isInteractive: true } as const
const PANE = {
  plugin: 'frugal-mod',
  component: 'Pane',
  requestId: 'frugal',
  props: { title: 'frugal-mod', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const acc = (id: string, patch: Partial<Account> = {}): Account =>
  ({ id, preset: 'claude', kind: 'claude-cli', paid: true, enabled: true, model: 'sonnet', used: 2, day: '2026-11-01', ...patch })

const engine = (on: On, store: Record<string, unknown>) => {
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] as never }))
  on('command.register', () => ({ value: {} as never }))
  on('tool.register', () => ({ value: {} as never }))
  on('mcp.call', () => ({ value: { content: [], isError: true } }))
  on('clock.now', () => ({ value: 0 }))
  on('env.get', () => ({ value: '/home/me' }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 26, tokens: 265_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 21 }] } }))
}

test('the accounts tab lists main and each secondary, on every surface', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-b'), acc('gemini', { preset: 'gemini', kind: 'openai-compatible', paid: false, model: 'gemini-2.5-flash' })] }
  engine(on, store)
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /265k tokens \(26%\), 5-hour 21%/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^gemini$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^free$/ }))).toBeDefined()
    await ui.unmount()
  }
})

test('turning an account off and removing one are saved to the store', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-b'), acc('codex', { preset: 'codex', kind: 'codex-cli', model: '' })], providers: { delegate: ['codex', 'claude-b'] } }
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'acc-on-claude-b' })
  expect((store.accounts as Account[])[0]?.enabled).toBe(false)
  await ui.press({ key: 'acc-rm-codex' })
  expect((store.accounts as Account[]).map(a => a.id)).toEqual(['claude-b'])
  expect(store.providers).toEqual({ delegate: ['claude-b'] })
  await ui.unmount()
})

test('a new account gets its preset and its own Claude config folder', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'add-name', text: 'claude-b' })
  const [added] = store.accounts as Account[]
  expect(added?.kind).toBe('claude-cli')
  expect(added?.configDir).toBe('/home/me/.claude-claude-b')
  await ui.unmount()
})

test('modules show their locks, and a fixed module cannot be turned off', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-modules' })
  expect(await ui.find({ type: 'Text', text: /main only · writes to this session/ })).toBeDefined()
  await ui.press({ key: 'mod-on-panel' })
  await ui.press({ key: 'mod-on-gates' })
  expect(store.modules).toEqual({ gates: false })
  await ui.unmount()
})

test('the band shows only once /frugal runs', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-b')] }
  engine(on, store)
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start(START)
  const band = { plugin: 'frugal-mod', component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, bodyColumns: 80, view: {} } } as never
  const before = await $.ui.mount({ ...(band as object), surface: 'terminal' } as never)
  expect(await before.find({ type: 'Text', text: /^frugal$/ })).toBeUndefined()
  await before.unmount()
  await $.skill.prompt({ skill: 'frugal:frugal', text: 'SKILL', frontmatter: {}, source: 'plugin', path: '/f/SKILL.md' })
  const after = await $.ui.mount({ ...(band as object), surface: 'terminal' } as never)
  expect(await after.find({ type: 'Text', text: /1 secondary account/ })).toBeDefined()
  await after.unmount()
})
