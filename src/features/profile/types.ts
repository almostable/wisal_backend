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

export interface FollowUserItem {
  id: bigint
  name: string | null
  avatarKey: string | null
  description: string | null
  identity: string | null
  followedAt: Date
}

export interface ListFollowsResult {
  users: FollowUserItem[]
  total: number
  limit: number
  offset: number
}

export interface FollowActionResult {
  following: boolean
  message: string
}

export interface BlockedUserItem {
  id: bigint
  name: string | null
  avatarKey: string | null
  identity: string | null
  isMale: boolean | null
  blockedAt: Date
}

export interface ListBlocksResult {
  users: BlockedUserItem[]
  total: number
  limit: number
  offset: number
}

export interface BlockActionResult {
  blocked: boolean
  message: string
}

