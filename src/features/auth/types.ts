import type { SafeAccount } from '../../db/schema/accounts'
import type { SafeProfile } from '../../lib/profile'
import type { RegisterInput, LoginInput, DeleteAccountInput } from './schema'

export type { RegisterInput, LoginInput, DeleteAccountInput }

export interface AuthSessionResult {
  account: SafeAccount
  token: string
  profile: SafeProfile | null
  isOnboardingCompleted: boolean
}

export interface AuthMeResult {
  account: SafeAccount
  isOnboardingCompleted: boolean
}

export interface DeleteAccountResult {
  success: boolean
  message: string
}

