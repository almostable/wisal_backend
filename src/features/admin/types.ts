import type { SafeAdmin } from '../../db/schema/admins'
import type { AdminSession } from '../../db/schema/admin-sessions'
import type { Invite } from '../../db/schema/invites'
import type { SafeAccount } from '../../db/schema/accounts'
import type { ProfileWithIdentity } from '../../db/schema/profiles'

export interface AdminLoginInput {
  email: string
  password: string
}

export interface AdminLoginResult {
  admin: SafeAdmin
  session: AdminSession
  token: string
}

export interface CreateInviteInput {
  code?: string
  expiresAt: Date
}

export interface ListInvitesOptions {
  limit?: number
  offset?: number
}

export interface ListInvitesResult {
  invites: Invite[]
  total: number
  limit: number
  offset: number
}

export interface ListUsersOptions {
  limit?: number
  offset?: number
}

export interface UserListItem extends SafeAccount {
  profile: ProfileWithIdentity | null
}

export interface ListUsersResult {
  users: UserListItem[]
  total: number
  limit: number
  offset: number
}
