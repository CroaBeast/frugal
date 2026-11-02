import { expect, test } from 'claude-code/testing'

import { agentRow, band, delegatedRow, esc, fit, hero, planRow, tiles } from '../hooks/art'

test('text is escaped and cut to the width it gets', () => {
  expect(esc('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
  expect(fit('a'.repeat(100), 13, 130)).toHaveLength(17)
  expect(fit('short', 13, 130)).toBe('short')
  expect(planRow(300, { id: 'p', title: '<evil>', kind: 'plan', status: 'pending' }, 1)).not.toContain('<evil>')
})

test('every drawing is one svg document at the width it was given', () => {
  const docs = [
    hero(320, [{ label: 'Context', pct: 40, note: '398k tokens' }, { label: '5-hour', pct: 91 }]),
    tiles(320, [{ k: 'Running', v: '2' }, { k: 'Tokens', v: '41k' }]),
    planRow(320, { id: 'p', title: 'Ship it', kind: 'plan', status: 'running' }, 1),
    agentRow(320, { id: 'a', title: 'Find it', kind: 'agent', status: 'running', detail: 'Explore', model: 'haiku', effort: 'low', tokens: 41_000, context: 8000, window: 200_000, startedAt: 0 }, 41_000),
    delegatedRow(320, { id: 'd', title: 'Fix it', account: 'codex', model: 'medium effort', status: 'escalated', tries: 3 }),
    band(320, 1, 2, 1, 3),
  ]
  for (const d of docs) {
    expect(d.startsWith('<svg')).toBe(true)
    expect(d).toContain('width="320"')
    expect(d.endsWith('</svg>')).toBe(true)
  }
  expect(docs[0]).toContain('>91%<')
  expect(docs[3]).toContain('ctx 4% · 41k · 0:41')
  expect(docs[4]).toContain('handed back · try 3')
})
