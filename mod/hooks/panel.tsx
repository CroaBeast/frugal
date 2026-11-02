import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account, Activity, MainTask } from '../types'
import { accountRow, activityRow, agentRow, band, delegatedRow, fmtTime, fmtTokens, hero, moduleRow, planRow, tiles, turnCard } from './art'
import { DELEGATE_SPEC, PRESETS } from './delegate'
import { MODULES } from './session'

const skillDir = atom({ plugin: 'frugal-mod', key: 'skillDir' } as const, null)
const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const providers = atom({ plugin: 'frugal-mod', key: 'providers' } as const, {})
const tasks = atom({ plugin: 'frugal-mod', key: 'tasks' } as const, [])
const tab = atom({ plugin: 'frugal-mod', key: 'tab' } as const, 'accounts')
const draftPreset = atom({ plugin: 'frugal-mod', key: 'draftPreset' } as const, 'claude')
const look = atom({ plugin: 'frugal-mod', key: 'look' } as const, 'modern')
const adding_ = atom({ plugin: 'frugal-mod', key: 'adding' } as const, false)
const mainList = atom({ plugin: 'frugal-mod', key: 'mainTasks' } as const, [])
const now = atom({ plugin: 'frugal-mod', key: 'now' } as const, 0)
const turn = atom({ plugin: 'frugal-mod', key: 'turn' } as const, null)
const activity = atom({ plugin: 'frugal-mod', key: 'activity' } as const, [])
const pickAccount = atom({ plugin: 'frugal-mod', key: 'pickAccount' } as const, '')
const pickModule = atom({ plugin: 'frugal-mod', key: 'pickModule' } as const, 'delegate')

const PANE = 'frugal'
const LOCKS = { main: 'Runs on the main account', none: 'Uses no model', fixed: 'Always on' } as const
const TOKEN_TONE = { none: 'inactive', low: 'success', normal: 'warning', high: 'error' } as const
const STATUS = {
  connected: { text: 'Connected', tone: 'success' },
  pending: { text: 'Not connected', tone: 'warning' },
  missing: { text: 'Not installed', tone: 'error' },
  error: { text: 'Login failed', tone: 'error' },
} as const

type PlanInput = { items?: { content: string; status: string }[]; advance?: boolean; done?: number[]; start?: number }
const PLAN_STATUS: Record<string, MainTask['status']> = { pending: 'pending', in_progress: 'running', completed: 'done' }

// Mirrors the session's own task list (the app's plan or TodoWrite); subagents are kept after it.
export const applyPlan = (list: MainTask[], input: PlanInput) => {
  let plan = list.filter(t => t.kind === 'plan')
  const agents = list.filter(t => t.kind === 'agent').slice(-12)
  if (input.items) plan = input.items.map((it, i) => ({ id: `plan-${i}`, title: it.content, kind: 'plan' as const, status: PLAN_STATUS[it.status] ?? 'pending' }))
  if (input.advance) {
    const at = plan.findIndex(t => t.status === 'running')
    const nextUp = plan.findIndex((t, i) => i > at && t.status === 'pending')
    plan = plan.map((t, i) => i === at ? { ...t, status: 'done' } : i === nextUp ? { ...t, status: 'running' } : t)
  }
  for (const n of input.done ?? []) plan = plan.map((t, i) => i === n - 1 ? { ...t, status: 'done' } : t)
  if (input.start) plan = plan.map((t, i) => i === input.start! - 1 ? { ...t, status: 'running' } : t)
  return [...plan, ...agents]
}

// A window around the running item, so the list never grows past the pane.
export const around = <T extends { status: string }>(list: T[], size: number) => {
  const at = Math.max(0, list.findIndex(t => t.status === 'running'))
  const from = Math.max(0, Math.min(at - 2, list.length - size))
  return { shown: list.slice(from, from + size), from }
}

const loginLabel = (a: Account) => a.status === 'missing' ? 'Install and log in' : a.kind === 'claude-cli' || a.kind === 'codex-cli' ? 'Log in' : 'Get a key'

const short = (path: unknown) => String(path ?? '').replace(/\\/g, '/').split('/').slice(-2).join('/')
const lines = (v: unknown) => String(v ?? '').split('\n').length

export const describe = (tool: string, input: Record<string, unknown>) => {
  switch (tool) {
    case 'Edit': return { what: short(input.file_path), detail: `+${lines(input.new_string)} -${lines(input.old_string)}` }
    case 'Write': return { what: short(input.file_path), detail: `${lines(input.content)} lines` }
    case 'Read': return { what: short(input.file_path) }
    case 'Bash': case 'PowerShell': return { what: String(input.command ?? '').split('\n')[0]!.slice(0, 80) }
    case 'Grep': case 'Glob': return { what: String(input.pattern ?? '') }
    case 'WebFetch': return { what: String(input.url ?? '').replace(/^https?:\/\//, '') }
    case 'WebSearch': return { what: String(input.query ?? '') }
    case 'Agent': return { what: String(input.description ?? '') }
    case 'Skill': return { what: String(input.skill ?? '') }
    default: return { what: tool.replace(/^mcp__/, '').replace(/__/g, ' ') }
  }
}

const windowOf = (model: string) => /\[1m\]|-1m/.test(model) ? 1_000_000 : 200_000

const saveAccounts = async ($: EngineInterface, fn: (list: Account[]) => Account[]) => {
  await update($, accounts, fn)
  await $.store.set('accounts', await read($, accounts))
}

const saveModules = async ($: EngineInterface, fn: (m: Record<string, boolean>) => Record<string, boolean>) => {
  await update($, modules, fn)
  await $.store.set('modules', await read($, modules))
}

const saveProviders = async ($: EngineInterface, fn: (p: Record<string, string[]>) => Record<string, string[]>) => {
  await update($, providers, fn)
  await $.store.set('providers', await read($, providers))
}

// Opens a terminal with the provider's login command, or its API key page; the session clock then checks it.
const openLogin = async ($: EngineInterface, a: Account) => {
  const win = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !win && (await $.process.run(['uname']).catch(() => null))?.stdout.trim() === 'Darwin'
  const p = PRESETS[a.preset]
  if (a.kind !== 'claude-cli' && a.kind !== 'codex-cli') {
    if (!p?.keyUrl) return
    const argv = win ? ['rundll32', 'url.dll,FileProtocolHandler', p.keyUrl] : [mac ? 'open' : 'xdg-open', p.keyUrl]
    await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => null)
    return
  }
  // In the terminal it opens: install the CLI if missing, close at once if already logged in,
  // else log in and close; a failure keeps the terminal open to show it.
  const codex = a.kind === 'codex-cli'
  const [bin, pkg] = codex ? ['codex', '@openai/codex'] : ['claude', '@anthropic-ai/claude-code']
  const login = codex ? 'codex login' : 'claude auth login'
  const cmd = win
    ? `${codex ? '' : `set CLAUDE_CONFIG_DIR=${a.configDir}&& `}(where ${bin} >nul 2>nul || npm i -g ${pkg}) && ` +
      `((${codex ? 'codex login status 2>&1 | findstr /b /i /c:"Logged in"' : 'claude auth status --json | findstr /r "loggedIn.*true"'} >nul && exit) || ${login} && exit)`
    : `${codex ? '' : `export CLAUDE_CONFIG_DIR='${a.configDir}'; `}command -v ${bin} >/dev/null 2>&1 || npm i -g ${pkg}; ` +
      `if ${codex ? "codex login status 2>&1 | grep -qi '^logged in'" : `claude auth status --json | grep -q '"loggedIn": true'`}; then exit; fi; ${login} && exit`
  // Start-Process returns at once: a terminal started through cmd's start keeps the pipes open until it closes.
  const argv = win ? ['powershell', '-NoProfile', '-Command', `Start-Process cmd -ArgumentList '/k', '${cmd}'`]
    : mac ? ['osascript', '-e', `tell application "Terminal" to do script "${cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate']
      : ['x-terminal-emulator', '-e', 'sh', '-c', cmd]
  await $.process.run(argv, { timeoutMs: 8_000 }).catch(() => null)
  await saveAccounts($, l => l.map(x => x.id === a.id ? { ...x, status: 'pending', note: 'Waiting for login' } : x))
}

const addAccount = async ($: EngineInterface, name: string) => {
  const id = name.trim()
  if (!id || id === 'main' || (await read($, accounts)).some(a => a.id === id)) {
    $.ui.toast(id ? `An account named ${id} already exists.` : 'Enter a name for the account.')
    return
  }
  const key = await read($, draftPreset)
  const p = PRESETS[key]!
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '~'
  const account: Account = {
    id, preset: key, kind: p.kind, enabled: true, status: 'pending', note: 'Waiting for login', used: 0, day: '',
    addedAt: await $.clock.now(),
    ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
    ...(p.kind === 'claude-cli' ? { configDir: `${home}/.claude-${id}` } : {}),
  }
  await saveAccounts($, list => [...list, account])
  await update($, adding_, () => false)
  await $.tool.register(DELEGATE_SPEC)
  await openLogin($, account)
  $.ui.toast(p.env ? `Added ${id}. Set ${p.env} with the key from the page that opened, then restart Claude.` : `Added ${id}. Finish the login in the terminal that opened.`)
}

export const registerPanel = (on: On) => {
  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    const r = await next(e)
    await update($, mainList, list => applyPlan(list, e as unknown as PlanInput))
    return r
  })

  // Wrapping up a turn checks off the app's whole list without another update_plan.
  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    const r = await next(e)
    await update($, mainList, list => list.map(t => t.kind === 'plan' ? { ...t, status: 'done' as const } : t))
    return r
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const r = await next(e)
    const todos = (e as unknown as { todos?: { content: string; status: string }[] }).todos ?? []
    await update($, mainList, list => applyPlan(list, { items: todos }))
    return r
  })

  // Subagents: started here, metered by turn.step, finished in turn.complete (rules.ts).
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const at = await $.clock.now()
    const run: MainTask = {
      id: started.agentId ?? e.tool_use_id, title: e.description || e.subagentType, kind: 'agent', status: 'running',
      detail: e.subagentType, model: started.model, startedAt: at, window: windowOf(started.model), tokens: 0, context: 0,
    }
    await update($, mainList, list => [...list.filter(t => t.id !== run.id), run])
    await update($, now, () => at)
    return started
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (!usage) return result
    if (!e.agentId) {
      const used = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.output_tokens || 0)
      const model = usage.model || e.model
      const at = await $.clock.now()
      await update($, turn, t => {
        const base = t?.running ? t : { running: true, startedAt: at, tokens: 0, context: 0, window: 0, tools: 0 }
        return { ...base, model, effort: typeof e.effort === 'string' ? e.effort : base.effort, context: used, window: windowOf(model), tokens: base.tokens + used }
      })
      return result
    }
    const used = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.output_tokens || 0)
    const model = usage.model || e.model
    await update($, mainList, list => list.map(t => t.id !== e.agentId ? t : {
      ...t, model, effort: typeof e.effort === 'string' ? e.effort : t.effort, context: used, window: windowOf(model), tokens: (t.tokens ?? 0) + used,
    }))
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId || e.tool.startsWith('mcp__ccd_')) return next(e)
    const at = await $.clock.now()
    const item: Activity = { id: e.tool_use_id, tool: e.tool, ...describe(e.tool, e as unknown as Record<string, unknown>), status: 'running', startedAt: at }
    await update($, activity, list => [...list, item].slice(-12))
    await update($, turn, t => t ? { ...t, tools: t.tools + 1 } : t)
    const r = await next(e)
    const end = await $.clock.now()
    const failed = r.deny !== undefined || r.isError === true
    await update($, activity, list => list.map(x => x.id !== item.id ? x : { ...x, status: (failed ? 'failed' : 'done') as Activity['status'], endedAt: end, detail: failed ? 'failed' : x.detail }))
    return r
  })

  on('command.run', { command: 'frugal-panel' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'frugal-mod' })
    return { text: isPlaced ? 'frugal-mod panel opened.' : 'This surface cannot show the panel.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const view = await read($, tab)
    const list = await read($, accounts)
    const switches = await read($, modules)
    const order = await read($, providers)
    const style = await read($, look)
    const rich = (e.surface === 'desktop' || e.surface === 'vscode') && style === 'modern'

    const tabs = (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Box flexDirection="row" gap={1}>
          {['accounts', 'modules', 'tasks'].map(t => (
            <Button key={`tab-${t}`} label={t[0]!.toUpperCase() + t.slice(1)} variant={t === view ? 'primary' : 'secondary'}
              onPress={() => update($, tab, () => t)} />
          ))}
        </Box>
        {(e.surface === 'desktop' || e.surface === 'vscode') && (
          <Button key="look" label={style === 'modern' ? 'Classic view' : 'Modern view'} plain dimColor
            onPress={() => update($, look, l => l === 'modern' ? 'classic' : 'modern')} />
        )}
      </Box>
    )

    if (view === 'accounts') {
      const u = await $.session.usage()
      const adding = await read($, adding_)
      const preset = await read($, draftPreset)
      const resets = (at?: string) => at ? `resets ${new Date(at).toISOString().slice(5, 16).replace('T', ' ')} UTC` : undefined
      const gauges = [
        { label: 'Context', pct: u.context.percent ?? 0, note: `${fmtTokens(u.context.tokens)} tokens` },
        ...u.rateLimits.map(r => ({ label: r.kind === 'five_hour' ? '5-hour' : r.kind === 'seven_day' ? 'Weekly' : r.kind, pct: r.percentUsed, note: resets(r.resetsAt) })),
      ]
      const connected = list.filter(a => a.status === 'connected').length
      const pickedId = await read($, pickAccount)
      const today = new Date(await $.clock.now()).toISOString().slice(0, 10)
      return (
        <Box flexDirection="column" paddingBottom={1}>
          {tabs}
          {rich ? (() => {
            const { Svg } = $.ui.resolve(e)
            const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 60) * 8 - 8))
            return <Svg source={hero(W, gauges)} alt={gauges.map(g => `${g.label} ${Math.round(g.pct)}%`).join(', ')} width={W} />
          })() : (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="claude" bold>MAIN ACCOUNT</Text>
              {gauges.map(g => <Text key={`g-${g.label}`}><Text bold>{g.label}</Text> {Math.round(g.pct)}% <Text dimColor>{g.note ?? ''}</Text></Text>)}
            </Box>
          )}
          <Box flexDirection="row" justifyContent="space-between" marginTop={1} marginBottom={1}>
            {rich ? <Text color="claude" bold>ADDITIONAL ACCOUNTS</Text> : <Text bold>Additional accounts</Text>}
            <Text dimColor>{list.length ? `${connected} of ${list.length} connected` : 'None yet'}</Text>
          </Box>
          {rich && (() => {
            const { Svg, Select } = $.ui.resolve(e)
            const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 60) * 8 - 8))
            const picked = list.find(a => a.id === pickedId) ?? list[0]
            return (
              <Box flexDirection="column" gap={1}>
                {list.map(a => (
                  <Svg key={`acc-${a.id}`} source={accountRow(W, a, PRESETS[a.preset]?.label ?? a.preset, a.day === today ? a.used : 0)} alt={`${a.id}: ${a.status ?? 'pending'}`} width={W} />
                ))}
                <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center" borderStyle="round" borderColor="subtle" paddingX={1}>
                  {picked && (
                    <Select key="acc-pick" label="Account" value={picked.id} options={list.map(a => ({ value: a.id }))} onSelect={v => update($, pickAccount, () => v)} />
                  )}
                  {picked && picked.status !== 'connected' && <Button key="acc-login" label={loginLabel(picked)} variant="primary" onPress={() => openLogin($, picked)} />}
                  {picked && (
                    <Button key="acc-toggle" label={picked.enabled ? 'Turn off' : 'Turn on'} variant="secondary"
                      onPress={() => saveAccounts($, l => l.map(x => x.id === picked.id ? { ...x, enabled: !x.enabled } : x))} />
                  )}
                  {picked && (
                    <Button key="acc-remove" label="Remove" plain dimColor onPress={async () => {
                      await saveAccounts($, l => l.filter(x => x.id !== picked.id))
                      await saveProviders($, p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.filter(x => x !== picked.id)])))
                    }} />
                  )}
                  {!adding && <Button key="add-open" label="Add account" variant="secondary" onPress={() => update($, adding_, () => true)} />}
                </Box>
              </Box>
            )
          })()}
          {!rich && list.map(a => {
            const st = STATUS[a.status ?? 'pending']
            const label = PRESETS[a.preset]?.label ?? a.preset
            const plan = a.status === 'connected' ? a.plan ?? 'plan unknown' : undefined
            return (
              <Box key={`acc-${a.id}`} flexDirection="column" borderStyle="round" borderColor={a.enabled && a.status === 'connected' ? 'subtle' : 'inactive'} paddingX={1} marginBottom={1}>
                <Box flexDirection="row" justifyContent="space-between">
                  <Text bold dimColor={!a.enabled}>{a.id}</Text>
                  <Text color={a.enabled ? st.tone : 'inactive'}>{a.enabled ? st.text : 'Turned off'}</Text>
                </Box>
                <Text dimColor>{[label, plan, `${a.day === today ? a.used : 0} tasks today`].filter(Boolean).join(' · ')}</Text>
                {a.note && a.status !== 'connected' && <Text color={st.tone}>{a.note}</Text>}
                <Box flexDirection="row" gap={1} marginTop={1}>
                  {a.status !== 'connected' && (
                    <Button key={`acc-login-${a.id}`} label={loginLabel(a)} variant="primary" onPress={() => openLogin($, a)} />
                  )}
                  <Button key={`acc-on-${a.id}`} label={a.enabled ? 'Turn off' : 'Turn on'} variant="secondary"
                    onPress={() => saveAccounts($, l => l.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x))} />
                  <Button key={`acc-rm-${a.id}`} label="Remove" plain dimColor onPress={async () => {
                    await saveAccounts($, l => l.filter(x => x.id !== a.id))
                    await saveProviders($, p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.filter(x => x !== a.id)])))
                  }} />
                </Box>
              </Box>
            )
          })}
          {adding && e.surface !== 'mobile' ? (() => {
            const { Input, Select } = $.ui.resolve(e)
            const p = PRESETS[preset]!
            return (
              <Box flexDirection="column" gap={1} borderStyle="round" borderColor="claude" paddingX={1}>
                <Box flexDirection="row" justifyContent="space-between">
                  <Text bold>Add an account</Text>
                  <Button key="add-cancel" label="Cancel" plain dimColor onPress={() => update($, adding_, () => false)} />
                </Box>
                <Select key="add-preset" label="Provider" value={preset}
                  options={Object.keys(PRESETS).map(k => ({ value: k, label: PRESETS[k]!.label }))}
                  onSelect={v => update($, draftPreset, () => v)} />
                <Input key="add-name" label="Name" placeholder={`${preset}-2`} submitLabel="Add and log in" onSubmit={v => addAccount($, v)} />
                <Text dimColor>
                  {p.env ? `Opens the ${p.label} key page; set ${p.env} and restart Claude.` : p.kind === 'openai-compatible' ? 'Needs Ollama running on this machine.' : 'Opens a terminal to log in.'} Plan and models come from the provider; frugal picks the model per task.
                </Text>
              </Box>
            )
          })() : !rich && (
            <Button key="add-open" label="Add account" variant="secondary" onPress={() => update($, adding_, () => true)} />
          )}
        </Box>
      )
    }

    if (view === 'modules') {
      const pickedModule = await read($, pickModule)
      return (
        <Box flexDirection="column" paddingBottom={1}>
          {tabs}
          {rich && (() => {
            const { Svg, Select } = $.ui.resolve(e)
            const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 60) * 8 - 8))
            const m = MODULES.find(x => x.id === pickedModule) ?? MODULES[0]!
            const isOn = m.lock === 'fixed' || (switches[m.id] ?? true)
            const chosen = order[m.id] ?? []
            return (
              <Box flexDirection="column" gap={1}>
                <Text color="claude" bold>MODULES</Text>
                {MODULES.map(x => {
                  const active = x.lock === 'fixed' || (switches[x.id] ?? true)
                  const mine = order[x.id] ?? []
                  const where = x.lock ? LOCKS[x.lock] : mine.length ? `Runs on ${mine.map((p, i) => `${i + 1}. ${p}`).join(', ')}` : 'Runs on any connected account, least used first'
                  return <Svg key={`mod-${x.id}`} source={moduleRow(W, { name: x.name, tokens: x.tokens, on: active, where })} alt={`${x.name}: ${active ? 'on' : 'off'}`} width={W} />
                })}
                <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center" borderStyle="round" borderColor="subtle" paddingX={1}>
                  <Select key="mod-pick" label="Module" value={m.id} options={MODULES.map(x => ({ value: x.id, label: x.name }))} onSelect={v => update($, pickModule, () => v)} />
                  {m.lock === 'fixed'
                    ? <Text dimColor>Always on</Text>
                    : <Button key="mod-toggle" label={isOn ? 'Turn off' : 'Turn on'} variant="secondary" onPress={() => saveModules($, x => ({ ...x, [m.id]: !isOn }))} />}
                  {!m.lock && isOn && chosen.map(p => (
                    <Button key={`prov-${m.id}-${p}`} label={`${p}  x`} plain onPress={() => saveProviders($, x => ({ ...x, [m.id]: chosen.filter(y => y !== p) }))} />
                  ))}
                  {!m.lock && isOn && list.some(a => !chosen.includes(a.id)) && (
                    <Select key={`prov-add-${m.id}`} label="Add provider" value=""
                      options={[{ value: '', label: 'Choose an account' }, ...list.filter(a => !chosen.includes(a.id)).map(a => ({ value: a.id }))]}
                      onSelect={v => v ? saveProviders($, x => ({ ...x, [m.id]: [...chosen, v] })) : undefined} />
                  )}
                </Box>
              </Box>
            )
          })()}
          {!rich && MODULES.map(m => {
            const isOn = m.lock === 'fixed' || (switches[m.id] ?? true)
            const chosen = order[m.id] ?? []
            const where = m.lock ? LOCKS[m.lock] : chosen.length ? `Runs on ${chosen.map((p, i) => `${i + 1}. ${p}`).join(', ')}` : 'Runs on any connected account, least used first'
            return (
              <Box key={`mod-${m.id}`} flexDirection="column" borderStyle="round" borderColor={isOn ? 'subtle' : 'inactive'} paddingX={1} marginBottom={1}>
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Box flexDirection="row" gap={1}>
                    <Text bold dimColor={!isOn}>{m.name}</Text>
                    <Text color={isOn ? TOKEN_TONE[m.tokens] : 'inactive'}>{m.tokens} tokens</Text>
                  </Box>
                  {m.lock === 'fixed'
                    ? <Text dimColor>Always on</Text>
                    : <Button key={`mod-on-${m.id}`} label={isOn ? 'Turn off' : 'Turn on'} variant={isOn ? 'secondary' : 'primary'}
                        onPress={() => saveModules($, x => ({ ...x, [m.id]: !isOn }))} />}
                </Box>
                <Text dimColor>{where}</Text>
                {!m.lock && isOn && list.length > 0 && e.surface !== 'mobile' && (() => {
                  const { Select } = $.ui.resolve(e)
                  return (
                    <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center" marginTop={1}>
                      {chosen.map(p => (
                        <Button key={`prov-${m.id}-${p}`} label={`${p}  x`} variant="secondary"
                          onPress={() => saveProviders($, x => ({ ...x, [m.id]: chosen.filter(y => y !== p) }))} />
                      ))}
                      {list.some(a => !chosen.includes(a.id)) && (
                        <Select key={`prov-add-${m.id}`} label="Add provider"
                          value="" options={[{ value: '', label: 'Choose an account' }, ...list.filter(a => !chosen.includes(a.id)).map(a => ({ value: a.id }))]}
                          onSelect={v => v ? saveProviders($, x => ({ ...x, [m.id]: [...chosen, v] })) : undefined} />
                      )}
                    </Box>
                  )
                })()}
              </Box>
            )
          })}
        </Box>
      )
    }

    const main = await read($, mainList)
    const done = await read($, tasks)
    const at = await read($, now) || await $.clock.now()
    const plan = main.filter(t => t.kind === 'plan')
    const agents = main.filter(t => t.kind === 'agent').sort((x, y) => Number(y.status === 'running') - Number(x.status === 'running')).slice(0, 5)
    const delegated = [...done].reverse().slice(0, 4)
    const running = main.filter(t => t.status === 'running').length + done.filter(t => !['accepted', 'escalated'].includes(t.status)).length
    const tokens = main.reduce((n, t) => n + (t.tokens ?? 0), 0)
    const { shown, from } = around(plan, 8)
    const label = (text: string, n: number) => (
      <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
        <Text bold>{text}</Text>
        <Text dimColor>{n}</Text>
      </Box>
    )
    const empty = !plan.length && !agents.length && !delegated.length

    if (rich) {
      const { Svg } = $.ui.resolve(e)
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 60) * 8 - 8))
      const t = await read($, turn)
      const feed = [...(await read($, activity))].reverse().slice(0, 6)
      const kicker = (text: string, n?: number) => (
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Text color="claude" bold>{text}</Text>
          {n !== undefined && <Text dimColor>{n}</Text>}
        </Box>
      )
      return (
        <Box flexDirection="column" paddingBottom={1}>
          {tabs}
          <Svg source={tiles(W, [
            { k: 'This turn', v: t ? fmtTime((t.endedAt ?? at) - t.startedAt) : '0:00' },
            { k: 'Tokens', v: fmtTokens(t?.tokens) },
            { k: 'Delegated', v: `${done.filter(x => x.status === 'accepted').length}/${done.length}` },
          ])} alt="This turn, tokens and delegated tasks" width={W} />
          {t && <Box marginTop={1}><Svg source={turnCard(W, t, at)} alt={`Main session ${t.running ? 'working' : 'idle'}`} width={W} /></Box>}
          {plan.length > 0 && kicker('SESSION PLAN', plan.length)}
          {shown.map((x, i) => <Svg key={`plan-${x.id}`} source={planRow(W, x, from + i + 1)} alt={`${x.title}: ${x.status}`} width={W} />)}
          {feed.length > 0 && kicker('ACTIVITY')}
          {feed.map(x => <Svg key={`act-${x.id}`} source={activityRow(W, x, at)} alt={`${x.tool} ${x.what}: ${x.status}`} width={W} />)}
          {(agents.length > 0 || delegated.length > 0) && kicker('SUBAGENTS AND DELEGATED')}
          {agents.map(x => <Svg key={`agent-${x.id}`} source={agentRow(W, x, at)} alt={`${x.title}: ${x.status}, ${x.model ?? ''}`} width={W} />)}
          {delegated.map(x => <Svg key={`del-${x.id}`} source={delegatedRow(W, x)} alt={`${x.title}: ${x.status} on ${x.account}`} width={W} />)}
          {!t && empty && <Text dimColor>Nothing yet. The current turn, the session plan, its tool calls, subagents and delegated tasks show up here.</Text>}
        </Box>
      )
    }

    const word = { pending: 'todo', running: 'now ', done: 'done', failed: 'fail' } as const
    return (
      <Box flexDirection="column" paddingBottom={1}>
        {tabs}
        <Text dimColor>{running} running · {fmtTokens(tokens)} subagent tokens</Text>
        {empty && <Text dimColor>Nothing yet.</Text>}
        {plan.length > 0 && label('Session plan', plan.length)}
        {shown.map(t => <Text key={`plan-${t.id}`} dimColor={t.status === 'done'}>{word[t.status]}  {t.title}</Text>)}
        {agents.length > 0 && label('Subagents', agents.length)}
        {agents.map(t => <Text key={`agent-${t.id}`}>{word[t.status]}  {t.title} <Text dimColor>{t.detail} · {t.model ?? ''} · {fmtTokens(t.tokens)}</Text></Text>)}
        {delegated.length > 0 && label('Delegated', done.length)}
        {delegated.map(t => <Text key={`del-${t.id}`}>{t.status}  {t.title} <Text dimColor>{t.account} · {t.model}</Text></Text>)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, skillDir))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, tasks)
    const main = await read($, mainList)
    const running = all.filter(t => !['accepted', 'escalated'].includes(t.status)).length + main.filter(t => t.kind === 'agent' && t.status === 'running').length
    const finished = all.filter(t => t.status === 'accepted').length
    const active = (await read($, accounts)).filter(a => a.enabled && a.status === 'connected').length
    const open = () => $.ui.open({ id: PANE, title: 'frugal-mod' })
    if ((e.surface === 'desktop' || e.surface === 'vscode') && (await read($, look)) === 'modern') {
      const { Svg } = $.ui.resolve(e)
      const W = Math.max(240, Math.min(560, (e.props.bodyColumns || 60) * 8 - 140))
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Svg source={band(W, finished, all.length, running, active)} alt={`frugal: ${finished} of ${all.length} tasks done, ${active} accounts`} width={W} />
          <Button key="band-panel" label="Open panel" plain onPress={open} />
        </Box>
      )
    }
    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box flexDirection="row" gap={1}>
          <Text color="claude" bold>FRUGAL</Text>
          <Text>{all.length ? `${finished}/${all.length} tasks${running ? `, ${running} running` : ''}` : 'No tasks delegated'}</Text>
          <Text dimColor>· {active} secondary {active === 1 ? 'account' : 'accounts'}</Text>
        </Box>
        <Button key="band-panel" label="Open panel" plain onPress={open} />
      </Box>
    )
  })
}
