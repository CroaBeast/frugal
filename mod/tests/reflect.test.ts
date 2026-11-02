import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { mergeRules } from '../hooks/delegate'
import type { Account } from '../types'

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const
const skill = { skill: 'frugal:frugal', text: 'SKILL', frontmatter: {}, source: 'plugin', path: '/f/SKILL.md' } as const
const KEY = 'reflect:/repo'

const engine = (on: On, store: Record<string, unknown>, files: Record<string, string>, answer?: string) => {
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'x', toolUses: [] }] as never }))
  on('command.register', () => ({ value: {} as never }))
  on('tool.register', () => ({ value: {} as never }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 5, window: 1 }, rateLimits: [] } }))
  on('clock.now', () => ({ value: 0 }))
  on('fs.read', (_, e) => ({ value: files[e.path] ?? '' }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.write', (_, e) => { files[e.path] = e.text; return { value: undefined } })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: String(e.init?.stdin).includes('SKIP') && String(e.init?.stdin).includes('this file') ? 'SKIP' : 'Use pnpm, not npm.', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  if (answer) on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => ({ result: { questions: e.questions, answers: { [e.questions[0]!.question]: answer } } }) as never)
}

test('corrections and "remember:" notes are queued once; other prompts are not', async ($, on) => {
  const store: Record<string, unknown> = {}
  engine(on, store, {})
  await $.skill.prompt(skill)
  await $.prompt.submit(typed('no, use pnpm here'))
  await $.prompt.submit(typed('no, use pnpm here'))
  await $.prompt.submit(typed('add a login page'))
  await $.prompt.submit(typed('ok. remember: tests live in spec/'))
  expect(store[KEY]).toEqual(['no, use pnpm here', 'ok. remember: tests live in spec/'])
})

test('rules merge into one marked section, deduplicated, after what the file had', () => {
  const once = mergeRules('# Notes\nmine', ['Use pnpm.'])
  expect(once).toBe('# Notes\nmine\n\n<!-- frugal-reflect -->\n- Use pnpm.\n<!-- /frugal-reflect -->\n')
  const twice = mergeRules(once, ['use pnpm.', 'Tests live in spec/.'])
  expect(twice).toBe('# Notes\nmine\n\n<!-- frugal-reflect -->\n- use pnpm.\n- Tests live in spec/.\n<!-- /frugal-reflect -->\n')
})

test('with nobody to ask, /frugal-reflect saves nothing and clears the queue', async ($, on) => {
  const store: Record<string, unknown> = { [KEY]: ['no, use pnpm'] }
  const files: Record<string, string> = {}
  engine(on, store, files)
  const r = await $.command.run({ command: 'frugal-reflect', args: '' } as never)
  expect(r.text).toContain('nothing saved')
  expect(store[KEY]).toEqual([])
  expect(Object.keys(files)).toEqual([])
})

test('a secondary account rewrites the correction as a rule before the user saves it', async ($, on) => {
  const acc: Account = { id: 'claude-b', preset: 'claude', kind: 'claude-cli', paid: true, enabled: true, model: 'sonnet', used: 0, day: '' }
  const store: Record<string, unknown> = { [KEY]: ['no, use pnpm'], accounts: [acc] }
  const files: Record<string, string> = {}
  engine(on, store, files, 'Save')
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'frugal-reflect', args: '' } as never)
  expect(r.text).toContain('Saved 1 of 1')
  expect(Object.entries(files).find(([k]) => k.endsWith('CLAUDE.local.md'))?.[1]).toContain('- Use pnpm, not npm.')
})
