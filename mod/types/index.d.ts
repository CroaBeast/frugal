export type SkillDir = string | null

declare module 'claude-code' {
  interface PluginState {
    'frugal-mod': { skillDir: SkillDir; codeSent: boolean; mark: number }
  }
}
