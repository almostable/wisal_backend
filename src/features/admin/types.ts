import type { SafeAdmin, AdminRole } from '../../db/schema/admins'
import type { AdminSession } from '../../db/schema/admin-sessions'
import type { SafeAccount } from '../../db/schema/accounts'
import type { ProfileWithIdentity } from '../../db/schema/profiles'
import type { InviteStatus } from './schema'

export interface AdminLoginInput {
  email: string
  password: string
}

export interface AdminLoginResult {
  admin: SafeAdmin
  session: AdminSession
  token: string
}

export interface CreateAdminInput {
  email: string
  password: string
  role?: AdminRole
}

export interface ListAdminsOptions {
  limit?: number
  offset?: number
}

export interface ListAdminsResult {
  admins: SafeAdmin[]
  total: number
  limit: number
  offset: number
}

export interface CreateInviteInput {
  code?: string
  expiresAt: Date
}

export interface InviteCreator {
  id: bigint
  email: string
  role: AdminRole
}

export interface InviteInviter {
  id: bigint
  email: string
}

export interface InviteUsedBy {
  id: bigint
  email: string
}

export interface InviteItem {
  id: bigint
  code: string
  expiresAt: Date
  createdBy: InviteCreator | null
  inviter: InviteInviter | null
  usedBy: InviteUsedBy | null
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}


export interface InviteStats {
  active: number
  used: number
  expired: number
}

export interface ListInvitesOptions {
  limit?: number
  offset?: number
  status?: InviteStatus
  q?: string
  search?: string
}

export interface ListInvitesResult {
  invites: InviteItem[]
  total: number
  stats: InviteStats
  limit: number
  offset: number
}

import type { SafeProfile } from '../../lib/profile'

export interface ListUsersOptions {
  limit?: number
  offset?: number
}

export interface UserListItem extends SafeAccount {
  profile: SafeProfile | null
}

export interface ListUsersResult {
  users: UserListItem[]
  total: number
  limit: number
  offset: number
}
