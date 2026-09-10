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

export interface ReaderProfileItem {
  id: bigint
  name: string | null
  avatarKey: string | null
  description: string | null
  identity: string | null
  readAt: Date
  lastReadAt?: Date | null
}

export interface ListReadersResult {
  profiles: ReaderProfileItem[]
  total: number
  limit: number
  offset: number
}

export interface AuthorSubscriptionItem {
  id: bigint
  name: string | null
  avatarKey: string | null
  identity: string | null
  isVerified: boolean
  unreadCount: number
}

export interface ListAuthorsResult {
  authors: AuthorSubscriptionItem[]
  total: number
  limit: number
  offset: number
}

export type AuthorsListResult = ListAuthorsResult

export interface MarkAuthorReadResult {
  lastReadPostId: bigint
  lastReadAt: Date
  message: string
}

export interface ReadActionResult {
  reading: boolean
  message: string
}

export interface BlockedProfileItem {
  id: bigint
  name: string | null
  identity: string | null
  isMale: boolean | null
  blockedAt: Date
}

export interface ListBlocksResult {
  profiles: BlockedProfileItem[]
  total: number
  limit: number
  offset: number
}

export interface BlockActionResult {
  blocked: boolean
  message: string
}

export type ProfileFeedType = 'random' | 'recommended'

export interface ProfileFeedItem {
  name: string
  isMale: boolean
  avatarKey: string | null
  identity: string
  shortDescription: string
  regularReadersCount: number
  isVerified: boolean
}

export interface ProfileFeedResult {
  profiles: ProfileFeedItem[]
  type: ProfileFeedType
  seed?: string
  limit: number
  offset: number
}

export interface ProfileSearchItem {
  name: string
  isMale: boolean
  avatarKey: string | null
  identity: string
  shortDescription: string | null
  regularReadersCount: number
  isVerified: boolean
}

export interface ProfileSearchResult {
  profiles: ProfileSearchItem[]
  total: number
  limit: number
  offset: number
}

