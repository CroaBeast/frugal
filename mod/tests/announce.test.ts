import { expect, test } from 'claude-code/testing'

import type { Account } from '../types'

const acc = (id: string, patch: Partial<Account> = {}): Account =>
  ({ id, preset: 'claude', kind: 'claude-cli', enabled: true, status: 'connected', used: 0, day: '', ...patch })
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

test('connected accounts are announced in full once, then as a one-line reminder', async ($, on) => {
  const store: Record<string, unknown> = { accounts: [acc('a'), acc('b', { status: 'pending' })] }
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [] as never }))
  on('command.register', () => ({ value: {} as never }))
  on('tool.register', () => ({ value: {} as never }))
  on('mcp.call', () => ({ value: { content: [], isError: true } }))
  on('clock.every', () => ({ value: (() => undefined) as never }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const first = await $.prompt.submit(typed('hola'))
  expect(first.context?.join()).toContain('secondary accounts a are connected')
  const second = await $.prompt.submit(typed('hola'))
  expect(first.context?.join()).toContain('keep here only design, judgment calls')
  expect(second.context).toEqual(['frugal-mod: delegate bounded work to a; keep here only design and the final check.'])
})
