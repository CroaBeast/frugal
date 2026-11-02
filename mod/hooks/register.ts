import type { Register } from 'claude-code'

import { registerDelegate } from './delegate'
import { registerRules } from './rules'
import { registerSession } from './session'

export const register: Register = on => {
  registerSession(on)
  registerRules(on)
  registerDelegate(on)
}
