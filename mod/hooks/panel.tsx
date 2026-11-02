import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Account } from '../types'
import { DELEGATE_SPEC, PRESETS, modelFor } from './delegate'
import { usageLine } from './rules'
import { MODULES } from './session'

const skillDir = atom({ plugin: 'frugal-mod', key: 'skillDir' } as const, null)
const accounts = atom({ plugin: 'frugal-mod', key: 'accounts' } as const, [])
const modules = atom({ plugin: 'frugal-mod', key: 'modules' } as const, {})
const providers = atom({ plugin: 'frugal-mod', key: 'providers' } as const, {})
const tasks = atom({ plugin: 'frugal-mod', key: 'tasks' } as const, [])
const tab = atom({ plugin: 'frugal-mod', key: 'tab' } as const, 'accounts')
const draftPreset = atom({ plugin: 'frugal-mod', key: 'draftPreset' } as const, 'claude')

const PANE = 'frugal'
const LOCKS = { main: 'main only', none: 'no provider', fixed: 'fixed' } as const

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

const addAccount = async ($: EngineInterface, name: string) => {
  const id = name.trim()
  if (!id || (await read($, accounts)).some(a => a.id === id) || id === 'main') {
    $.ui.toast(id ? `An account named ${id} already exists.` : 'Enter a name for the account.')
    return
  }
  const key = await read($, draftPreset)
  const p = PRESETS[key]!
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '~'
  const account: Account = {
    id, preset: key, kind: p.kind, paid: p.paid, enabled: true, model: p.model, used: 0, day: '',
    ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
    ...(p.kind === 'claude-cli' ? { configDir: `${home}/.claude-${id}` } : {}),
  }
  await saveAccounts($, list => [...list, account])
  await $.tool.register(DELEGATE_SPEC)
  $.ui.toast(`Added ${id}. Log in: ${p.login.replace('<name>', id)}`)
}

export const registerPanel = (on: On) => {
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
    const now = await $.clock.now()

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {['accounts', 'modules', 'tasks'].map(t => (
          <Button key={`tab-${t}`} label={t === view ? `[${t}]` : t} plain onPress={() => update($, tab, () => t)} />
        ))}
      </Box>
    )

    if (view === 'accounts') {
      const u = await $.session.usage()
      const preset = await read($, draftPreset)
      return (
        <Box flexDirection="column" gap={0}>
          {tabs}
          <Text><Text bold>main</Text> <Text dimColor>orchestrator, {usageLine(u)}</Text></Text>
          {list.map(a => (
            <Box key={`acc-${a.id}`} flexDirection="row" gap={1}>
              <Button key={`acc-on-${a.id}`} label={a.enabled ? '[on]' : '[off]'} plain
                onPress={() => saveAccounts($, l => l.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x))} />
              <Text bold={a.enabled} dimColor={!a.enabled}>{a.id}</Text>
              <Text color={a.paid ? 'blue' : 'green'}>{a.paid ? 'paid' : 'free'}</Text>
              <Text dimColor>
                {a.preset} {modelFor(a, 'edit')} · {a.used}{a.cap ? `/${a.cap}` : ''} today
                {(a.exhaustedUntil ?? 0) > now ? ' · at its limit' : ''}
              </Text>
              <Button key={`acc-rm-${a.id}`} label="remove" plain onPress={async () => {
                await saveAccounts($, l => l.filter(x => x.id !== a.id))
                await saveProviders($, p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.filter(x => x !== a.id)])))
              }} />
            </Box>
          ))}
          {list.length === 0 && <Text dimColor>No secondary accounts. Delegation stays off until you add one.</Text>}
          {e.surface !== 'mobile' && (() => {
            const { Input, Select } = $.ui.resolve(e)
            return (
              <Box flexDirection="column" gap={0}>
                <Select key="add-preset" label="Provider" value={preset}
                  options={Object.keys(PRESETS).map(k => ({ value: k, label: `${k} (${PRESETS[k]!.paid ? 'paid' : 'free'})` }))}
                  onSelect={v => update($, draftPreset, () => v)} />
                <Input key="add-name" label="Name" placeholder={`${preset}-b`} submitLabel="Add account" onSubmit={v => addAccount($, v)} />
                <Text dimColor>Then log in: {PRESETS[preset]!.login}</Text>
              </Box>
            )
          })()}
        </Box>
      )
    }

    if (view === 'modules') {
      return (
        <Box flexDirection="column" gap={0}>
          {tabs}
          {MODULES.map(m => {
            const isOn = m.lock === 'fixed' || (switches[m.id] ?? true)
            const chosen = order[m.id] ?? []
            return (
              <Box key={`mod-${m.id}`} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Button key={`mod-on-${m.id}`} label={m.lock === 'fixed' ? '[fixed]' : isOn ? '[on]' : '[off]'} plain
                    onPress={() => m.lock === 'fixed' ? undefined : saveModules($, x => ({ ...x, [m.id]: !isOn }))} />
                  <Text bold={isOn} dimColor={!isOn}>{m.name}</Text>
                  <Text dimColor>tokens: {m.tokens}</Text>
                </Box>
                {m.lock ? <Text dimColor>  {LOCKS[m.lock]} · {m.why}</Text> : (
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {chosen.length === 0 && <Text dimColor>  any account, least used first</Text>}
                    {chosen.map((p, i) => (
                      <Button key={`prov-${m.id}-${p}`} label={`${i + 1} ${p} x`} plain
                        onPress={() => saveProviders($, x => ({ ...x, [m.id]: chosen.filter(y => y !== p) }))} />
                    ))}
                    {e.surface !== 'mobile' && list.some(a => !chosen.includes(a.id)) && (() => {
                      const { Select } = $.ui.resolve(e)
                      return (
                        <Select key={`prov-add-${m.id}`} label="+ provider"
                          options={list.filter(a => !chosen.includes(a.id)).map(a => ({ value: a.id }))}
                          onSelect={v => saveProviders($, x => ({ ...x, [m.id]: [...chosen, v] }))} />
                      )
                    })()}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )
    }

    const done = await read($, tasks)
    return (
      <Box flexDirection="column" gap={0}>
        {tabs}
        {done.length === 0 && <Text dimColor>No delegated tasks yet.</Text>}
        {[...done].reverse().map(t => (
          <Box key={`task-${t.id}`} flexDirection="row" gap={1}>
            <Text color={t.status === 'accepted' ? 'green' : t.status === 'escalated' ? 'red' : 'yellow'}>{t.status}</Text>
            <Text>{t.title}</Text>
            <Text dimColor>{t.account} {t.model}{t.tries > 1 ? ` · try ${t.tries}` : ''}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, skillDir))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, tasks)
    const running = all.filter(t => !['accepted', 'escalated'].includes(t.status)).length
    const active = (await read($, accounts)).filter(a => a.enabled).length
    return (
      <Box flexDirection="row" gap={1}>
        <Text color="#d97757">frugal</Text>
        <Text dimColor>
          {all.length ? `tasks ${all.length - running}/${all.length}${running ? `, ${running} running` : ''} · ` : ''}
          {active} secondary {active === 1 ? 'account' : 'accounts'}
        </Text>
        <Button key="band-panel" label="panel" plain onPress={() => $.ui.open({ id: PANE, title: 'frugal-mod' })} />
      </Box>
    )
  })
}
