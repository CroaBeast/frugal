export type SkillDir = string | null

export type AccountKind = 'claude-cli' | 'codex-cli' | 'openai-compatible' | 'anthropic-api'

export type Account = {
  id: string
  preset: string
  kind: AccountKind
  paid: boolean
  enabled: boolean
  model: string
  configDir?: string
  baseUrl?: string
  cap?: number
  used: number
  day: string
  exhaustedUntil?: number
}

export type TaskStatus = 'running' | 'checking' | 'inspecting' | 'retrying' | 'accepted' | 'escalated'

export type Task = { id: string; title: string; account: string; model: string; status: TaskStatus; tries: number }

declare module 'claude-code' {
  interface PluginState {
    'frugal-mod': {
      skillDir: SkillDir
      codeSent: boolean
      mark: number
      handoffMark: number
      accounts: Account[]
      modules: Record<string, boolean>
      providers: Record<string, string[]>
      tasks: Task[]
      tab: string
      draftPreset: string
    }
  }
}
