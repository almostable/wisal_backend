import type { SafeAccount } from '../../db/schema/accounts'
import type { SafeProfile } from '../../lib/profile'
import type { RegisterInput, LoginInput } from './schema'

export type { RegisterInput, LoginInput }

export interface AuthSessionResult {
  account: SafeAccount
  token: string
  profile: SafeProfile | null
  isOnboardingCompleted: boolean
}

export interface AuthMeResult {
  account: SafeAccount
  profile: SafeProfile | null
  isOnboardingCompleted: boolean
}
