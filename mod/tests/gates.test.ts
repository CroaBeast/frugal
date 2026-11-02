import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const skill = { skill: 'frugal:frugal', text: 'SKILL', frontmatter: {}, source: 'plugin', path: 'C:\\f\\SKILL.md' } as const
const lines = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`).join('\n')

const engine = (on: On, files: Record<string, string>) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 5, window: 1 }, rateLimits: [] } }))
  const base = (p: string) => p.replace(/^.*[\\/]/, '')
  on('fs.exists', (_, e) => ({ value: base(e.path) in files }))
  on('fs.read', (_, e) => ({ value: files[base(e.path)] ?? '' }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }) as never)
}

test('no gate before /frugal runs', async ($, on) => {
  engine(on, {})
  const r = await $.tool.call({ tool: 'Write', file_path: '/a.ts', content: lines(1200) })
  expect(r.deny).toBeUndefined()
})

test('a write that grows a file past 1000 lines is denied', async ($, on) => {
  engine(on, {})
  await $.skill.prompt(skill)
  const r = await $.tool.call({ tool: 'Write', file_path: '/a.ts', content: lines(1001) })
  expect(r.deny).toContain('1001 lines')
})

test('an edit that shrinks a file already past 1000 lines goes through', async ($, on) => {
  engine(on, { 'big.py': lines(1500) })
  await $.skill.prompt(skill)
  const r = await $.tool.call({ tool: 'Edit', file_path: '/big.py', old_string: 'x10\nx11', new_string: 'x10' })
  expect(r.deny).toBeUndefined()
})

test('filler comments in new lines are denied, with the offending lines', async ($, on) => {
  engine(on, { 'a.ts': 'let i = 0\n' })
  await $.skill.prompt(skill)
  const r = await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'let i = 0', new_string: '// Increment the counter\nlet i = 1' })
  expect(r.deny).toContain('// Increment the counter')
  const w = await $.tool.call({ tool: 'Write', file_path: '/b.py', content: '# Added retry logic\nretry()\n' })
  expect(w.deny).toContain('# Added retry logic')
})

test('comments that say why, and markdown headings, go through', async ($, on) => {
  engine(on, {})
  await $.skill.prompt(skill)
  const code = '// Return early: the API rejects empty batches with a 500\nif (!batch.length) return\n'
  expect((await $.tool.call({ tool: 'Write', file_path: '/a.ts', content: code })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Write', file_path: '/README.md', content: '# Imports\n' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Write', file_path: '/b.ts', content: '// Fixed-size buffer: the device caps reads at 4k\n' })).deny).toBeUndefined()
})

test('comments already in the file are not judged again', async ($, on) => {
  engine(on, { 'a.ts': '// Constructor\nclass A {}\n' })
  await $.skill.prompt(skill)
  const r = await $.tool.call({ tool: 'Write', file_path: '/a.ts', content: '// Constructor\nclass A { x = 1 }\n' })
  expect(r.deny).toBeUndefined()
})
