import type { Account, Activity, MainTask, Task, Turn } from '../types'

// SVG drawings for the desktop panel, sized to the pane (W) and themed by the
// app's light or dark mode through CSS classes. Pure functions: data in, markup out.
const CLAY = '#d97757'
const GREEN = '#3fa37a'
const AMBER = '#d4a13a'
const RED = '#d9614c'
const BLUE = '#5b8fd6'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
const SERIF = "'Tiempos Headline',Georgia,serif"

const CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}.ring{stroke:#ecebe8}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}.ring{stroke:#2c2c2b}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
.spin{animation:r 1.2s linear infinite;transform-box:fill-box;transform-origin:center}@keyframes r{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.live,.spin{animation:none}}
</style>`

export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// Text cut to fit maxW pixels at the given size, with an ellipsis.
export const fit = (s: string, size: number, maxW: number) => {
  const max = Math.floor(maxW / (size * 0.56))
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + '…'
}

// The pane measures a little narrower than its columns suggest: draw inside W - 6.
const svg = (W: number, H: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W + 6} ${H}" font-family="${FONT}">${CSS}${body}</svg>`

const tone = (pct: number) => pct >= 85 ? RED : pct >= 60 ? AMBER : GREEN

export const fmtTokens = (n = 0) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`
export const fmtTime = (ms = 0) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type Gauge = { label: string; pct: number; note?: string }

// The main account: a ring per limit, spread over the pane's width.
export const hero = (W: number, gauges: Gauge[]) => {
  const slot = W / Math.max(1, gauges.length)
  const r = Math.max(22, Math.min(32, slot / 2 - 20))
  const cy = 76 + r
  const H = cy + r + 44
  const rings = gauges.map((g, i) => {
    const cx = Math.round(slot * i + slot / 2)
    const len = 2 * Math.PI * r
    const arc = ((Math.min(100, Math.max(0, g.pct)) / 100) * len).toFixed(1)
    return `<circle class="ring" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="7"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tone(g.pct)}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arc} ${len.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` +
      `<text class="t" x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="600">${Math.round(g.pct)}%</text>` +
      `<text class="t" x="${cx}" y="${cy + r + 19}" text-anchor="middle" font-size="12" font-weight="600">${esc(g.label)}</text>` +
      (g.note ? `<text class="m" x="${cx}" y="${cy + r + 34}" text-anchor="middle" font-size="10">${esc(fit(g.note, 10, slot - 8))}</text>` : '')
  }).join('')
  return svg(W, H,
    `<text x="0" y="16" fill="${CLAY}" font-size="11" font-weight="600" letter-spacing="1.3">MAIN ACCOUNT</text>` +
    `<text class="t" x="0" y="42" font-size="19" font-family="${SERIF}">Orchestrator</text>` +
    `<text class="s" x="0" y="61" font-size="12">${esc(fit('Plans, delegates and verifies. Its limits stop everything.', 12, W))}</text>` +
    rings)
}

// Stat tiles in one row, as savvy-progress heads its panel.
export const tiles = (W: number, items: { k: string; v: string }[]) => {
  const gap = 6
  const tw = (W - gap * (items.length - 1)) / items.length
  return svg(W, 44, items.map((it, i) => {
    const x = i * (tw + gap)
    return `<rect class="tile" x="${x.toFixed(1)}" y="0" width="${tw.toFixed(1)}" height="42" rx="8"/>` +
      `<text class="s" x="${(x + 10).toFixed(1)}" y="16" font-size="11">${esc(it.k)}</text>` +
      `<text class="t" x="${(x + 10).toFixed(1)}" y="34" font-size="15" font-weight="600">${esc(fit(it.v, 15, tw - 16))}</text>`
  }).join(''))
}

const mark = (x: number, y: number, status: MainTask['status'], color: string) =>
  status === 'done' ? `<path d="M${x - 6} ${y}l4 4 8-9" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    : status === 'failed' ? `<path d="M${x - 5} ${y - 5}l10 10M${x + 5} ${y - 5}l-10 10" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>`
      : status === 'running' ? `<circle class="spin" cx="${x}" cy="${y}" r="6" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="22 16"/>`
        : `<circle class="ln" cx="${x}" cy="${y}" r="5.5" fill="none" stroke-width="1.5"/>`

// One item of the session's own task list.
export const planRow = (W: number, t: MainTask, n: number) => svg(W, 30,
  mark(8, 14, t.status, CLAY) +
  `<text class="${t.status === 'done' ? 's' : 't'}" x="26" y="19" font-size="13"${t.status === 'running' ? ' font-weight="600"' : ''}>${esc(fit(`${n}. ${t.title}`, 13, W - 30))}</text>` +
  `<line class="ln" x1="0" y1="29.5" x2="${W}" y2="29.5"/>`)

const TYPE_COLOR: Record<string, string> = { Explore: BLUE, Plan: AMBER, 'general-purpose': CLAY }

// A subagent the main session started: model and effort, context, tokens and time, live.
export const agentRow = (W: number, t: MainTask, at: number) => {
  const color = TYPE_COLOR[t.detail ?? ''] ?? CLAY
  const ctx = t.window ? Math.min(100, Math.round(((t.context ?? 0) / t.window) * 100)) : 0
  const time = fmtTime((t.endedAt ?? at) - (t.startedAt ?? at))
  const stats = `ctx ${ctx}% · ${fmtTokens(t.tokens)} · ${time}`
  const barW = W - 26
  const fill = t.status === 'done' ? barW : Math.round(barW * (ctx / 100))
  return svg(W, 62,
    mark(8, 15, t.status, color) +
    `<text class="t" x="26" y="19" font-size="13" font-weight="600">${esc(fit(t.title, 13, W - 30))}</text>` +
    `<text x="26" y="36" font-size="11"><tspan fill="${color}">${esc(t.detail ?? 'subagent')}</tspan>` +
    `<tspan class="s">  ${esc(fit([t.model, t.effort].filter(Boolean).join(' · '), 11, W - 150))}</tspan></text>` +
    `<text class="s" x="${W}" y="36" text-anchor="end" font-size="11">${esc(stats)}</text>` +
    `<rect class="k" x="26" y="46" width="${barW}" height="4" rx="2"/>` +
    `<rect x="26" y="46" width="${fill}" height="4" rx="2" fill="${t.status === 'failed' ? RED : t.status === 'done' ? GREEN : color}"/>` +
    `<line class="ln" x1="0" y1="61.5" x2="${W}" y2="61.5"/>`)
}

const STAGE: Record<Task['status'], number> = { running: 1, retrying: 1, checking: 2, inspecting: 3, accepted: 4, escalated: 4 }
const STAGE_WORD: Record<Task['status'], string> = { running: 'running', retrying: 'retrying', checking: 'checking', inspecting: 'inspecting', accepted: 'accepted', escalated: 'handed back' }

// A task handed to a secondary account: run, check, inspect, done.
export const delegatedRow = (W: number, t: Task) => {
  const st: MainTask['status'] = t.status === 'accepted' ? 'done' : t.status === 'escalated' ? 'failed' : 'running'
  const color = t.status === 'retrying' ? AMBER : CLAY
  const seg = (W - 26 - 6) / 4
  const bars = [0, 1, 2, 3].map(i => {
    const fill = i >= STAGE[t.status] ? '' : t.status === 'escalated' ? RED : t.status === 'accepted' ? GREEN : color
    return `<rect ${fill ? `fill="${fill}"` : 'class="k"'} x="${(26 + i * (seg + 2)).toFixed(1)}" y="46" width="${seg.toFixed(1)}" height="4" rx="2"/>`
  }).join('')
  return svg(W, 62,
    mark(8, 15, st, color) +
    `<text class="t" x="26" y="19" font-size="13" font-weight="600">${esc(fit(t.title, 13, W - 30))}</text>` +
    `<text x="26" y="36" font-size="11"><tspan fill="${color}">${esc(t.account || 'picking an account')}</tspan>` +
    `<tspan class="s">  ${esc(fit(t.model, 11, W - 190))}</tspan></text>` +
    `<text class="s" x="${W}" y="36" text-anchor="end" font-size="11">${STAGE_WORD[t.status]}${t.tries > 1 ? ` · try ${t.tries}` : ''}</text>` +
    bars + `<line class="ln" x1="0" y1="61.5" x2="${W}" y2="61.5"/>`)
}

const STATUS: Record<NonNullable<Account['status']>, { word: string; color: string }> = {
  connected: { word: 'Connected', color: GREEN },
  pending: { word: 'Not connected', color: AMBER },
  missing: { word: 'Not installed', color: RED },
  error: { word: 'Login failed', color: RED },
}

// An additional account: status, provider and plan, today's tasks against its cap.
export const accountRow = (W: number, a: Account, label: string, usedToday: number) => {
  const st = a.enabled ? STATUS[a.status ?? 'pending'] : { word: 'Turned off', color: '#8a8a86' }
  const cap = a.cap ?? 0
  const barW = W - 26
  const fill = cap ? Math.round(barW * Math.min(1, usedToday / cap)) : 0
  const meta = a.status === 'connected' ? a.plan ?? 'plan unknown' : a.note ?? ''
  return svg(W, cap ? 54 : 44,
    `<circle${a.enabled && a.status === 'pending' ? ' class="live"' : ''} cx="8" cy="14" r="4.5" fill="${st.color}"/>` +
    `<text class="${a.enabled ? 't' : 's'}" x="26" y="19" font-size="13" font-weight="600">${esc(fit(a.id, 13, W - 140))}</text>` +
    `<text x="${W}" y="19" text-anchor="end" font-size="11" fill="${st.color}">${st.word}</text>` +
    `<text x="26" y="36" font-size="11"><tspan fill="${CLAY}">${esc(label)}</tspan>` +
    `<tspan ${a.status === 'connected' ? 'class="s"' : `fill="${st.color}"`}>  ${esc(fit(meta, 11, W - 150))}</tspan></text>` +
    `<text class="s" x="${W}" y="36" text-anchor="end" font-size="11">${usedToday}${cap ? `/${cap}` : ''} today</text>` +
    (cap ? `<rect class="k" x="26" y="46" width="${barW}" height="4" rx="2"/><rect x="26" y="46" width="${fill}" height="4" rx="2" fill="${CLAY}"/>` : ''))
}

const TOKEN_COLOR = { none: '#8a8a86', low: GREEN, normal: AMBER, high: RED } as const

// A module: on or off, how many tokens it spends, where it runs.
export const moduleRow = (W: number, m: { name: string; tokens: keyof typeof TOKEN_COLOR; on: boolean; where: string }) => svg(W, 44,
  (m.on ? `<circle cx="8" cy="14" r="4.5" fill="${GREEN}"/>` : `<circle class="ln" cx="8" cy="14" r="4.5" fill="none" stroke-width="1.5"/>`) +
  `<text class="${m.on ? 't' : 's'}" x="26" y="19" font-size="13" font-weight="600">${esc(fit(m.name, 13, W - 130))}</text>` +
  `<text x="${W}" y="19" text-anchor="end" font-size="11" fill="${m.on ? TOKEN_COLOR[m.tokens] : '#8a8a86'}">${m.tokens} tokens</text>` +
  `<text class="s" x="26" y="36" font-size="11">${esc(fit(m.on ? m.where : 'Off', 11, W - 30))}</text>`)

// The main session's current (or last) turn: model and effort, tool calls, context, tokens, time.
export const turnCard = (W: number, t: Turn, at: number) => {
  const ctx = t.window ? Math.min(100, Math.round((t.context / t.window) * 100)) : 0
  const barW = W - 48
  return svg(W, 70,
    `<rect class="tile" x="0.5" y="0.5" width="${W - 1}" height="68" rx="10" stroke="${t.running ? CLAY : 'none'}" stroke-opacity=".55"/>` +
    mark(18, 22, t.running ? 'running' : 'done', CLAY) +
    `<text class="t" x="34" y="27" font-size="13" font-weight="600">Main session, ${t.running ? 'working' : 'idle'}</text>` +
    `<text class="s" x="${W - 14}" y="27" text-anchor="end" font-size="11">${fmtTime((t.endedAt ?? at) - t.startedAt)}</text>` +
    `<text x="34" y="44" font-size="11"><tspan fill="${CLAY}">${esc(t.model ?? 'model')}</tspan>` +
    `<tspan class="s">${esc(`${t.effort ? `  · ${t.effort} effort` : ''}  · ${t.tools} tool ${t.tools === 1 ? 'call' : 'calls'}`)}</tspan></text>` +
    `<text class="s" x="${W - 14}" y="44" text-anchor="end" font-size="11">ctx ${ctx}% · ${fmtTokens(t.tokens)} this turn</text>` +
    `<rect class="k" x="34" y="53" width="${barW}" height="4" rx="2"/>` +
    `<rect x="34" y="53" width="${Math.round(barW * ctx / 100)}" height="4" rx="2" fill="${CLAY}"/>`)
}

const KIND: Record<string, [string, string]> = {
  Edit: ['EDIT', CLAY], Write: ['WRITE', CLAY], NotebookEdit: ['EDIT', CLAY], Read: ['READ', '#8a8a86'],
  Bash: ['SHELL', GREEN], PowerShell: ['SHELL', GREEN], Grep: ['SEARCH', BLUE], Glob: ['FIND', BLUE],
  WebFetch: ['WEB', AMBER], WebSearch: ['WEB', AMBER], Agent: ['AGENT', BLUE], Skill: ['SKILL', AMBER],
}

// One tool call of the main session: what it touched, its outcome, its time.
export const activityRow = (W: number, a: Activity, at: number) => {
  const [word, color] = KIND[a.tool] ?? ['TOOL', '#8a8a86']
  const tail = fmtTime((a.endedAt ?? at) - a.startedAt)
  return svg(W, 28,
    `<text x="4" y="18" fill="${a.status === 'failed' ? RED : color}" font-size="10" font-weight="700" letter-spacing=".6">${word}</text>` +
    `<text class="t" x="56" y="18" font-size="12">${esc(fit(a.what || a.tool, 12, W - 170))}</text>` +
    `<text class="s" x="${W - 46}" y="18" text-anchor="end" font-size="11">${esc(a.status === 'running' ? 'running' : a.detail ?? '')}</text>` +
    `<text class="m" x="${W}" y="18" text-anchor="end" font-size="11">${tail}</text>` +
    `<line class="ln" x1="0" y1="27.5" x2="${W}" y2="27.5"/>`)
}

export const band = (W: number, done: number, total: number, running: number, accounts: number) => {
  const bar = total ? (done / total) * 90 : 0
  return svg(W, 28,
    `<circle${running ? ' class="live"' : ''} cx="6" cy="14" r="4" fill="${CLAY}"/>` +
    `<text x="16" y="18" fill="${CLAY}" font-size="11" font-weight="600" letter-spacing="1.2">FRUGAL</text>` +
    `<text class="t" x="76" y="18" font-size="12">${total ? `${done}/${total} tasks${running ? `, ${running} running` : ''}` : 'No tasks yet'}</text>` +
    `<rect class="k" x="${W - 190}" y="11" width="90" height="5" rx="2.5"/><rect x="${W - 190}" y="11" width="${bar.toFixed(1)}" height="5" rx="2.5" fill="${GREEN}"/>` +
    `<text class="s" x="${W}" y="18" text-anchor="end" font-size="12">${accounts} ${accounts === 1 ? 'account' : 'accounts'}</text>`)
}
