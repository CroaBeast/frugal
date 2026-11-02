import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// Set once /frugal runs in this session; null means frugal is off.
const skillDir = atom({ plugin: 'frugal-mod', key: 'skillDir' } as const, null)
const codeSent = atom({ plugin: 'frugal-mod', key: 'codeSent' } as const, false)
const mark = atom({ plugin: 'frugal-mod', key: 'mark' } as const, 0)

const CODE = /\b(implement|fix|bug|refactor|endpoint|component|function|class|method|test|crash|exception|traceback|migrat|review|diff|commit|compile|build|add|api|script|code)|\.(py|ts|tsx|js|jsx|go|rs|java|kt|cs|rb|php|cpp|c|h|sql|css|html|sh)\b/i
// Prompts the user typed (terminal, phone, desktop app); notifications and peers don't count.
const USER = new Set(['composer', 'bridge', 'sdk'])
// Context % at which core.md and session.md are re-injected.
const MARKS = [25, 45, 65, 85]
// What the plugin's session-count.sh prints; the mod injects the same rules itself.
const SH = /(frugal code rules \(loaded by a hook|frugal: this is the user's message \d+)[\s\S]*/

const due = (pct: number) => MARKS.filter(m => m <= pct).pop() ?? 0
const codeRules = (text: string) => `frugal code rules (loaded by frugal-mod; do not Read code.md):\n${text}`

export const register: Register = on => {
  let lastText = ''

  on('skill.prompt', async ($, e, next) => {
    if (!e.path || (e.skill !== 'frugal' && !e.skill.endsWith(':frugal'))) return next(e)
    const dir = e.path.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
    await update($, skillDir, () => dir)
    const pct = (await $.session.usage()).context.percent ?? 0
    await update($, mark, m => Math.max(m, due(pct)))
    if (!CODE.test(lastText) || (await read($, codeSent))) return next(e)
    await update($, codeSent, () => true)
    return next({ ...e, text: `${e.text}\n\n${codeRules(await $.fs.read(`${dir}/code.md`))}` })
  })

  on('prompt.submit', async ($, e, next) => {
    if (!USER.has(e.origin.kind) || e.isMeta) return next(e)
    lastText = e.text
    const dir = await read($, skillDir)
    if (!dir) return next(e)
    const add: string[] = []
    const pct = (await $.session.usage()).context.percent ?? 0
    if (due(pct) > (await read($, mark))) {
      await update($, mark, () => due(pct))
      const core = await $.fs.read(`${dir}/core.md`)
      const session = await $.fs.read(`${dir}/modules/session.md`)
      add.push(`frugal: context is at ${pct}%. The session rules below are loaded; apply them.\n${core}\n${session}`)
    }
    if (!(await read($, codeSent)) && CODE.test(e.text)) {
      await update($, codeSent, () => true)
      add.push(codeRules(await $.fs.read(`${dir}/code.md`)))
    }
    return add.length ? next({ ...e, context: [...(e.context ?? []), ...add] }) : next(e)
  })

  on('session.append', { door: 'hook-context' }, ($, e, next) => {
    const content = e.message.content.map(b =>
      b.type === 'text' && typeof b.text === 'string' && SH.test(b.text) ?{ ...b, text: b.text.replace(SH, 'frugal: rules come from frugal-mod.') } : b)
    return next({ ...e, message: { ...e.message, content } })
  })
}
