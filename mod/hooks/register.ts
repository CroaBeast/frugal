import type { Register } from 'claude-code'

import { registerRules } from './rules'
import { registerShared } from './shared'

export const register: Register = on => {
  registerShared(on)
  registerRules(on)
}
