import type { Contacts } from '../../db/schema/profiles'
import type { SafeProfile } from '../../lib/profile'

export type { SafeProfile }
export type PublicProfile = SafeProfile

export interface MyProfileResult {
  profile: SafeProfile
  isOnboardingCompleted: boolean
}

export interface CheckIdentityResult {
  available: boolean
  identity: string
  reason?: string
}

export interface MyInviteUsedBy {
  id: bigint
  email: string
  name: string | null
  avatarKey: string | null
  identity: string | null
}

export interface MyInviteItem {
  id: bigint
  code: string
  expiresAt: Date
  usedBy: MyInviteUsedBy | null
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ListMyInvitesResult {
  invites: MyInviteItem[]
  total: number
  stats: {
    active: number
    used: number
    expired: number
  }
  limit: number
  offset: number
}

