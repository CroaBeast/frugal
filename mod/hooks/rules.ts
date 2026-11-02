import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, SessionUsage } from 'claude-code'

// Set once /frugal runs in this session; null means frugal is off.
const skillDir = atom({ plugin: 'frugal-mod', key: 'skillDir' } as const, null)
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const mainTasks = atom({ plugin: 'frugal-mod', key: 'mainTasks' } as const, [])
const turn = atom({ plugin: 'frugal-mod', key: 'turn' } as const, null)
const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])

const codeSent = atom({ plugin: 'frugal-mod', key: 'codeSent' } as const, false)
const mark = atom({ plugin: 'frugal-mod', key: 'mark' } as const, 0)
const handoffMark = atom({ plugin: 'frugal-mod', key: 'handoffMark' } as const, 0)

const CODE = /\b(implement|fix|bug|refactor|endpoint|component|function|class|method|test|crash|exception|traceback|migrat|review|diff|commit|compile|build|add|api|script|code)|\.(py|ts|tsx|js|jsx|go|rs|java|kt|cs|rb|php|cpp|c|h|sql|css|html|sh)\b/i
// A correction or an explicit "remember:", queued for /frugal:reflect.
const CORRECTION = /^(no\b[,.!]?|nope\b|wrong\b|don'?t\b|do not\b|stop\b|never\b|always\b|instead\b|actually\b|no uses\b|siempre\b|nunca\b|deja de\b|en vez de\b)|\b(remember|recuerda)\s*:/i
// Prompts the user typed (terminal, phone, desktop app); notifications and peers don't count.
export const USER = new Set(['composer', 'bridge', 'sdk'])
// Context % at which core.md and session.md are re-injected.
const MARKS = [25, 45, 65, 85]
// Context % at which the model is told to offer a handoff.
const HANDOFF_MARKS = [40, 60]
const COMPACT_AT = 80
// Below this, a cold cache costs too little to ask about.
const COLD_MIN_TOKENS = 20_000
const MINUTE = 60_000
// What the plugin's session-count.sh prints; the mod injects the same rules itself.
const SH = /(frugal code rules \(loaded by a hook|frugal: this is the user's message \d+)[\s\S]*/
const COMPACT_INSTRUCTIONS = 'Summarize as a frugal handoff: Goal; Done (file paths, settings changed, decisions and why); Pending (in order); Key context (versions, constraints, user preferences); Next step. Facts only, under 250 words.'
const LIMITS: Record<string, string> = { five_hour: '5-hour', seven_day: 'weekly' }
const MAX_LINES = 1000
const SLASH = /\.(jsx?|tsx?|mjs|cjs|java|kts?|go|rs|c|h|cc|cpp|hpp|cs|swift|php|scala|dart)$/i
const HASH = /\.(py|sh|bash|rb|pl|r|ya?ml|toml|ps1|exs?)$/i
const DASH = /\.(sql|lua|hs)$/i
// Comments that narrate the edit, restate the next line, or label structure.
const NARRATE = /^(added|changed|updated|fixed|removed|modified)[ :]/i
const RESTATE = /^(increment|decrement|initiali[sz]e|declare|define|import|return|call|instantiate|loop (through|over)|iterate (through|over))\b/i
const LABEL = /^(end (of )?(if|for|while|function|class|loop)|constructor|getters?( and setters?)?|setters?|main( function)?|imports?|variables?|helpers?( functions)?)\.?$/i

const isFiller = (t: string) => NARRATE.test(t) || LABEL.test(t) || (RESTATE.test(t) && t.split(/\s+/).length <= 6)

const fillers = (path: string, lines: string[]) => {
  const m = SLASH.test(path) ? '//' : HASH.test(path) ? '#' : DASH.test(path) ? '--' : null
  if (!m) return []
  return lines.map(l => l.trim()).filter(l => l.startsWith(m) && !l.startsWith('#!') && isFiller(l.slice(m.length).trim()))
}

const gate = (path: string, before: string | null, after: string, added: string[]) => {
  const n = after.split('\n').length
  if (n > MAX_LINES && n > (before?.split('\n').length ?? 0)) {
    return `frugal: ${path} would be ${n} lines (limit ${MAX_LINES}). Split it into smaller files.`
  }
  const bad = fillers(path, added)
  if (bad.length) {
    return `frugal: remove comments that narrate the edit or restate the code: ${bad.slice(0, 3).join(' | ')}. Keep only comments that say why.`
  }
}

const isOn = async ($: EngineInterface, id: string) => (await read($, modules))[id] ?? true

const step = (marks: number[], pct: number) => marks.filter(m => m <= pct).pop() ?? 0
const codeRules = (text: string) => `frugal code rules (loaded by frugal-mod; do not Read code.md):\n${text}`

export const usageLine = (u: SessionUsage) => [
  `context ${Math.round((u.context.tokens ?? 0) / 1000)}k tokens (${u.context.percent ?? 0}%)`,
  ...u.rateLimits.map(r => `${LIMITS[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%` +
    (r.resetsAt ? ` (resets ${new Date(r.resetsAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : '')),
].join(', ')

// A compaction drops the injected rules: re-inject them on the next prompt.
const resetAfterCompact = async ($: EngineInterface) => {
  await update($, mark, () => -1)
  await update($, codeSent, () => false)
  await update($, handoffMark, () => 0)
}

export const registerRules = (on: On) => {
  // The connected accounts the model was last told about: told again only when they change.
  let announced = ''
  let lastText = ''
  let lastTurn = 0

  on('skill.prompt', async ($, e, next) => {
    if (!e.path || (e.skill !== 'frugal' && !e.skill.endsWith(':frugal'))) return next(e)
    const dir = e.path.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
    await update($, skillDir, () => dir)
    const pct = (await $.session.usage()).context.percent ?? 0
    await update($, mark, m => Math.max(m, step(MARKS, pct)))
    await update($, handoffMark, m => Math.max(m, step(HANDOFF_MARKS, pct)))
    if (!(await isOn($, 'rules')) || !CODE.test(lastText) || (await read($, codeSent))) return next(e)
    await update($, codeSent, () => true)
    return next({ ...e, text: `${e.text}\n\n${codeRules(await $.fs.read(`${dir}/code.md`))}` })
  })

  on('prompt.submit', async ($, e, next) => {
    if (!USER.has(e.origin.kind) || e.isMeta) return next(e)
    lastText = e.text
    const ids = (await read($, accounts)).filter(a => a.enabled && a.status === 'connected').map(a => a.id)
    let hint = ''
    if (ids.join() !== announced && (await isOn($, 'delegate'))) {
      announced = ids.join()
      if (ids.length) {
        hint = `frugal-mod: ${ids.length} secondary ${ids.length === 1 ? 'account is' : 'accounts are'} connected (${ids.join(', ')}). ` +
          'Hand them every bounded task with mcp__frugal-mod__delegate: repo searches, reading or summarizing files, running tests or builds, mechanical edits with a clear brief. ' +
          'Put independent pieces in "tasks" so all accounts work in parallel. Keep design, judgment and the final check here.'
      }
    }
    const dir = await read($, skillDir)
    if (!dir) return hint ? next({ ...e, context: [...(e.context ?? []), hint] }) : next(e)
    if (CORRECTION.test(e.text.trim()) && !e.command && (await isOn($, 'reflect'))) {
      const key = `reflect:${await $.session.cwd()}`
      const queue = ((await $.store.get(key)) as string[] | undefined) ?? []
      const item = e.text.trim().slice(0, 300)
      if (!queue.includes(item)) await $.store.set(key, [...queue, item].slice(-20))
    }
    const u = await $.session.usage()

    // Subscriptions cache for an hour, API keys for 5 minutes.
    const idle = (await $.clock.now()) - lastTurn
    const ttl = u.rateLimits.length ? 60 * MINUTE : 5 * MINUTE
    if (lastTurn && idle > ttl && (u.context.tokens ?? 0) >= COLD_MIN_TOKENS && (await isOn($, 'cold-cache'))) {
      lastTurn = 0
      const k = Math.round((u.context.tokens ?? 0) / 1000)
      const pick = await $.ui.ask(
        `The prompt cache expired after ${Math.round(idle / MINUTE)} min idle. Sending re-writes about ${k}k tokens. Send anyway?`,
        ['Send', 'Cancel'],
      ).catch(() => 'Send')
      if (pick === 'Cancel') return { drop: 'frugal: not sent, the prompt cache is cold. Run /compact or ask for a handoff, or send again.' }
    }

    const pct = u.context.percent ?? 0
    const add: string[] = hint ? [hint] : []
    const rules = await isOn($, 'rules')
    if (rules && step(MARKS, pct) > (await read($, mark))) {
      await update($, mark, () => step(MARKS, pct))
      const core = await $.fs.read(`${dir}/core.md`)
      const session = await $.fs.read(`${dir}/modules/session.md`)
      add.push(`frugal: context is at ${pct}%. The session rules below are loaded; apply them. Handoff timing comes from frugal-mod by context %, not message count.\n${core}\n${session}`)
    }
    if (step(HANDOFF_MARKS, pct) > (await read($, handoffMark)) && (await isOn($, 'handoff'))) {
      await update($, handoffMark, () => step(HANDOFF_MARKS, pct))
      add.push(`frugal-mod: context is at ${pct}%. If work remains, end this reply at the first natural breakpoint with a handoff block (session.md format). Usage line, no need to call get_usage: ${usageLine(u)}`)
    }
    if (rules && !(await read($, codeSent)) && CODE.test(e.text)) {
      await update($, codeSent, () => true)
      add.push(codeRules(await $.fs.read(`${dir}/code.md`)))
    }
    return add.length ? next({ ...e, context: [...(e.context ?? []), ...add] }) : next(e)
  })

  // Compacting is only allowed once the turn is over, not from prompt.submit.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      // A subagent finished: the panel's task list stops its clock.
      const r = await next(e)
      const at = await $.clock.now()
      const status = e.reason === 'answer' ? 'done' as const : 'failed' as const
      await update($, mainTasks, list => list.map(t => t.id === e.agentId ? { ...t, status, endedAt: at } : t))
      return r
    }
    const r = await next(e)
    lastTurn = await $.clock.now()
    const ended = lastTurn
    await update($, turn, t => t ? { ...t, running: false, endedAt: ended } : t)
    if (!(await read($, skillDir)) || !(await isOn($, 'handoff'))) return r
    if (((await $.session.usage()).context.percent ?? 0) < COMPACT_AT) return r
    const c = await $.session.compact({ instructions: COMPACT_INSTRUCTIONS }).catch(() => ({ skip: 'refused' }))
    if (!c.skip) await resetAfterCompact($)
    return r
  })

  // /compact and the engine's auto-compaction also get the handoff format.
  on('session.compact', async ($, e, next) => {
    if (e.agentId || !(await read($, skillDir))) return next(e)
    const handoff = await isOn($, 'handoff')
    const r = await next(handoff ? { ...e, instructions: e.instructions ?? COMPACT_INSTRUCTIONS } : e)
    if (!r.skip) await resetAfterCompact($)
    return r
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (!(await read($, skillDir)) || !(await isOn($, 'gates'))) return next(e)
    if (!(await $.fs.exists(e.file_path))) return next(e)
    const before = await $.fs.read(e.file_path)
    const after = e.replace_all ? before.split(e.old_string).join(e.new_string) : before.replace(e.old_string, () => e.new_string)
    const removed = new Set(e.old_string.split('\n'))
    const deny = gate(e.file_path, before, after, e.new_string.split('\n').filter(l => !removed.has(l)))
    return deny ? { deny } : next(e)
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (!(await read($, skillDir)) || !(await isOn($, 'gates'))) return next(e)
    const before = (await $.fs.exists(e.file_path)) ? await $.fs.read(e.file_path) : null
    const kept = new Set(before?.split('\n'))
    const deny = gate(e.file_path, before, e.content, e.content.split('\n').filter(l => !kept.has(l)))
    return deny ? { deny } : next(e)
  })

  on('session.append', { door: 'hook-context' }, ($, e, next) => {
    const content = e.message.content.map(b =>
      b.type === 'text' && typeof b.text === 'string' && SH.test(b.text) ? { ...b, text: b.text.replace(SH, 'frugal: rules come from frugal-mod.') } : b)
    return next({ ...e, message: { ...e.message, content } })
  })
}
