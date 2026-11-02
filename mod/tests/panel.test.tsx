import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyPlan } from '../hooks/panel'
import type { Account } from '../types'

const START = { cwd: '/repo', surface: 'desktop', isInteractive: true } as const
const PANE = {
  plugin: 'frugal-mod',
  component: 'Pane',
  requestId: 'frugal',
  props: { title: 'frugal-mod', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const acc = (id: string, patch: Partial<Account> = {}): Account =>
  ({ id, preset: 'claude', kind: 'claude-cli', enabled: true, status: 'connected', plan: 'max', used: 2, day: '2026-11-01', ...patch })

const runs: (readonly string[])[] = []
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
  on('process.run', (_, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('ui.toast', () => ({ value: undefined }))
  on('clock.every', () => ({ value: (() => undefined) as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 26, tokens: 265_000, window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 21 }] } }))
}

test('accounts: the main account, then each additional account in its own card', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-b'), acc('gemini', { preset: 'gemini', kind: 'openai-compatible', status: 'pending', note: 'Set GEMINI_API_KEY and restart Claude', plan: undefined })] }
  engine(on, store)
  await $.session.start(START)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /265k tokens/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /^Connected$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /^Not connected$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /Set GEMINI_API_KEY/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /Claude · max · 0 tasks today/ })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const drawn = JSON.stringify(await desk.drawn())
  expect(drawn).toContain('>21%<')
  expect(drawn).toContain('"width":632')
  await desk.select({ key: 'acc-pick', value: 'gemini' } as never)
  expect(await desk.find({ type: 'Button', text: /Get a key/ })).toBeDefined()
  await desk.unmount()
})

test('turning an account off and removing one are saved to the store', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-b'), acc('codex', { preset: 'codex', kind: 'codex-cli' })], providers: { delegate: ['codex', 'claude-b'] } }
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'acc-toggle' })
  expect((store.accounts as Account[])[0]?.enabled).toBe(false)
  await ui.select({ key: 'acc-pick', value: 'codex' } as never)
  await ui.press({ key: 'acc-remove' })
  expect((store.accounts as Account[]).map(a => a.id)).toEqual(['claude-b'])
  expect(store.providers).toEqual({ delegate: ['claude-b'] })
  await ui.unmount()
})

test('adding an account opens its login and waits for it', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'add-open' })
  await ui.input({ key: 'add-name', text: 'claude-b' })
  expect(await ui.find({ type: 'Button', text: /Add account/ })).toBeDefined()
  const [added] = store.accounts as Account[]
  expect(added?.kind).toBe('claude-cli')
  expect(added?.status).toBe('pending')
  expect(added?.configDir).toBe('/home/me/.claude-claude-b')
  expect(runs.some(argv => argv.join(' ').includes("export CLAUDE_CONFIG_DIR='/home/me/.claude-claude-b'") && argv.join(' ').includes('claude auth login && exit'))).toBe(true)
  await ui.unmount()
})

test('modules show their locks, and a fixed module cannot be turned off', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-modules' })
  expect(await ui.find({ type: 'Text', text: /Runs on the main account/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'mod-on-panel' } as never)).toBeUndefined()
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

test('the session plan mirrors into main tasks: items, advance, done and start', () => {
  const items = [{ content: 'Read', status: 'completed' }, { content: 'Write', status: 'in_progress' }, { content: 'Test', status: 'pending' }]
  const first = applyPlan([{ id: 'a1', title: 'Explore', kind: 'agent', status: 'done' }], { items })
  expect(first.map(t => t.status)).toEqual(['done', 'running', 'pending', 'done'])
  expect(applyPlan(first, { advance: true }).map(t => t.status)).toEqual(['done', 'done', 'running', 'done'])
  expect(applyPlan(first, { done: [3], start: 1 }).map(t => t.status)).toEqual(['running', 'running', 'done', 'done'])
})

test('a subagent shows on the tasks tab while it runs, then finishes', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  await $.session.start(START)
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'find it', description: 'Find the parser', subagentType: 'Explore', provider: { kind: 'model' }, parentModel: 'opus', background: false, fork: false } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Ship the panel', status: 'in_progress' }] })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-tasks' })
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Find the parser')
  expect(drawn).toContain('claude-haiku-5-5')
  expect(drawn).toContain('Ship the panel')
  expect(drawn).not.toContain('M2 15l4 4 8-9')
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1' } as never)
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('M2 15l4 4 8-9')
  await ui.unmount()
})

test('providers can be added one after another from the dropdown', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('claude-sm'), acc('codex', { preset: 'codex', kind: 'codex-cli' })] }
  engine(on, store)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-modules' })
  await ui.select({ key: 'prov-add-delegate', value: 'claude-sm' } as never)
  await ui.select({ key: 'prov-add-delegate', value: 'codex' } as never)
  expect(store.providers).toEqual({ delegate: ['claude-sm', 'codex'] })
  await ui.unmount()
})

test('wrapping up a turn checks off the whole plan', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.session.start(START)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'One', status: 'in_progress' }, { content: 'Two', status: 'pending' }] })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-tasks' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('>0<')
  expect(drawn).not.toContain('class=\\"spin\\"')
  await ui.unmount()
})

test('tool calls of the main session fill the activity feed', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.session.start(START)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/repo/mod/hooks/panel.tsx', old_string: 'a', new_string: 'a\nb\nc' })
  await $.tool.call({ tool: 'Grep', pattern: 'update($, mainList' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-tasks' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('ACTIVITY')
  expect(drawn).toContain('hooks/panel.tsx')
  expect(drawn).toContain('+3 -1')
  expect(drawn).toContain('>SEARCH<')
  await ui.unmount()
})
