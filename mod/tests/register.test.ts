import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SKILL = 'C:\\plugins\\frugal\\skills\\frugal\\SKILL.md'
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

const engine = (on: On, pct: { value: number }) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: pct.value }, rateLimits: [] } as never }))
  on('fs.read', (_, e) => ({ value: `<${e.path}>` }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
}

const skill = { skill: 'frugal:frugal', text: 'SKILL', frontmatter: {}, source: 'plugin', path: SKILL } as const

test('nothing is injected before /frugal runs', async ($, on) => {
  engine(on, { value: 90 })
  const r = await $.prompt.submit(typed('fix the bug in api.ts'))
  expect(r.context).toBeUndefined()
})

test('code rules go in once, on the first code prompt', async ($, on) => {
  engine(on, { value: 5 })
  await $.prompt.submit(typed('hola'))
  await $.skill.prompt(skill)
  const first = await $.prompt.submit(typed('fix the bug in api.ts'))
  expect(first.context?.join()).toMatch(/skills[\\/]frugal[\\/]code\.md>/)
  const second = await $.prompt.submit(typed('add a test'))
  expect(second.context).toBeUndefined()
})

test('/frugal on a code prompt adds the code rules to the skill text', async ($, on) => {
  engine(on, { value: 5 })
  await $.prompt.submit(typed('/frugal code refactor this'))
  const r = await $.skill.prompt(skill)
  expect(r.text).toContain('code.md>')
})

test('session rules go in when context crosses a mark, not again below the next', async ($, on) => {
  const pct = { value: 30 }
  engine(on, pct)
  await $.skill.prompt(skill)
  pct.value = 44
  expect((await $.prompt.submit(typed('hola'))).context).toBeUndefined()
  pct.value = 47
  const r = await $.prompt.submit(typed('hola'))
  expect(r.context?.join()).toContain('core.md>')
  expect(r.context?.join()).toContain('session.md>')
  expect((await $.prompt.submit(typed('hola'))).context).toBeUndefined()
})
