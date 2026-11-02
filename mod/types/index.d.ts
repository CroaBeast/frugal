export type SkillDir = string | null

export type AccountKind = 'claude-cli' | 'codex-cli' | 'openai-compatible' | 'anthropic-api'

// pending: added, waiting for its login or key. missing: its CLI is not installed. error: the login or key was rejected.
export type AccountStatus = 'pending' | 'connected' | 'missing' | 'error'

export type Account = {
  id: string
  preset: string
  kind: AccountKind
  enabled: boolean
  status?: AccountStatus
  note?: string
  plan?: string
  paid?: boolean
  configDir?: string
  baseUrl?: string
  models?: string[]
  addedAt?: number
  cap?: number
  used: number
  day: string
  exhaustedUntil?: number
}

export type TaskStatus = 'running' | 'checking' | 'inspecting' | 'retrying' | 'accepted' | 'escalated'

export type MainTask = {
  id: string
  title: string
  kind: 'plan' | 'agent'
  status: 'pending' | 'running' | 'done' | 'failed'
  detail?: string
  model?: string
  effort?: string
  tokens?: number
  context?: number
  window?: number
  startedAt?: number
  endedAt?: number
}

// The main session's turn in progress, metered by turn.step.
export type Turn = { running: boolean; startedAt: number; endedAt?: number; model?: string; effort?: string; tokens: number; context: number; window: number; tools: number }

// One tool call of the main session.
export type Activity = { id: string; tool: string; what: string; detail?: string; status: 'running' | 'done' | 'failed'; startedAt: number; endedAt?: number }

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
      mainTasks: MainTask[]
      tab: string
      draftPreset: string
      look: string
      adding: boolean
      now: number
      turn: Turn | null
      activity: Activity[]
      pickAccount: string
      pickModule: string
    }
  }
}
