import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SKILL = 'C:\\plugins\\frugal\\skills\\frugal\\SKILL.md'
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const
const skill = { skill: 'frugal:frugal', text: 'SKILL', frontmatter: {}, source: 'plugin', path: SKILL } as const
const MSG = { role: 'user', text: 'x', toolUses: [] }
const TURN = { reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as const

type World = { pct: number; now: number; compacts: (string | undefined)[] }

const engine = (on: On, w: World) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { percent: w.pct, tokens: w.pct * 10_000, window: 1_000_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 21 }],
    },
  }))
  on('clock.now', () => ({ value: w.now }))
  on('fs.read', (_, e) => ({ value: `<${e.path}>` }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: 'ok' }) as never)
  on('session.compact', (_, e) => {
    w.compacts.push(e.instructions)
    w.pct = 10
    return { messages: [MSG] } as never
  })
}

const world = (pct: number): World => ({ pct, now: 0, compacts: [] })

test('nothing is injected before /frugal runs', async ($, on) => {
  engine(on, world(90))
  const r = await $.prompt.submit(typed('fix the bug in api.ts'))
  expect(r.context).toBeUndefined()
})

test('code rules go in once, on the first code prompt', async ($, on) => {
  engine(on, world(5))
  await $.prompt.submit(typed('hola'))
  await $.skill.prompt(skill)
  const first = await $.prompt.submit(typed('fix the bug in api.ts'))
  expect(first.context?.join()).toMatch(/skills[\\/]frugal[\\/]code\.md>/)
  const second = await $.prompt.submit(typed('add a test'))
  expect(second.context).toBeUndefined()
})

test('/frugal on a code prompt adds the code rules to the skill text', async ($, on) => {
  engine(on, world(5))
  await $.prompt.submit(typed('/frugal code refactor this'))
  const r = await $.skill.prompt(skill)
  expect(r.text).toContain('code.md>')
})

test('session rules go in when context crosses a mark, not again below the next', async ($, on) => {
  const w = world(30)
  engine(on, w)
  await $.skill.prompt(skill)
  w.pct = 39
  expect((await $.prompt.submit(typed('hola'))).context).toBeUndefined()
  w.pct = 47
  const r = await $.prompt.submit(typed('hola'))
  expect(r.context?.join()).toContain('core.md>')
  expect(r.context?.join()).toContain('session.md>')
  expect((await $.prompt.submit(typed('hola'))).context).toBeUndefined()
})

test('the handoff nudge carries the usage line', async ($, on) => {
  const w = world(30)
  engine(on, w)
  await $.skill.prompt(skill)
  w.pct = 41
  const r = await $.prompt.submit(typed('hola'))
  expect(r.context?.join()).toContain('handoff block')
  expect(r.context?.join()).toContain('context 410k tokens (41%), 5-hour 21%')
})

test('a turn that ends at 80% compacts as a handoff, then the rules go back in', async ($, on) => {
  const w = world(70)
  engine(on, w)
  await $.skill.prompt(skill)
  w.pct = 81
  await $.turn.complete(TURN)
  expect(w.compacts).toHaveLength(1)
  expect(w.compacts[0]).toContain('frugal handoff')
  const r = await $.prompt.submit(typed('hola'))
  expect(r.context?.join()).toContain('session.md>')
})

test('/compact gets the handoff format unless it names its own', async ($, on) => {
  const w = world(30)
  engine(on, w)
  await $.skill.prompt(skill)
  await $.session.compact({ trigger: 'manual', messages: [MSG] } as never)
  await $.session.compact({ trigger: 'manual', messages: [MSG], instructions: 'keep the API notes' } as never)
  expect(w.compacts[0]).toContain('frugal handoff')
  expect(w.compacts[1]).toBe('keep the API notes')
})

test('a cold cache with nobody to ask still sends the prompt', async ($, on) => {
  const w = world(30)
  engine(on, w)
  await $.skill.prompt(skill)
  await $.turn.complete(TURN)
  w.now = 61 * 60_000
  const r = await $.prompt.submit(typed('hola'))
  expect(r.text).toBe('hola')
})
