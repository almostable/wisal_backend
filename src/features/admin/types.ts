import type { SafeAdmin, AdminRole } from '../../db/schema/admins'
import type { AdminSession } from '../../db/schema/admin-sessions'
import type { SafeAccount } from '../../db/schema/accounts'
import type {
  ReportTargetType,
  ReportReason,
  ReportStatus,
} from '../../db/schema/reports'
import type { SafeProfile } from '../../lib/profile'
import type {
  InviteStatus,
  AdminReportStatusFilter,
  AdminReportTargetTypeFilter,
  AdminReportReasonFilter,
} from './schema'

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

export interface ReportUserSummary {
  id: bigint
  email: string
  name: string | null
  identity: string | null
  avatarKey: string | null
}

export interface ReportResolverSummary {
  id: bigint
  email: string
  role: AdminRole
}

export interface AdminReportItem {
  id: bigint
  targetType: ReportTargetType
  targetId: bigint
  reason: ReportReason
  details: string | null
  status: ReportStatus
  modNote: string | null
  reporter: ReportUserSummary | null
  reportedUser: ReportUserSummary | null
  resolvedBy: ReportResolverSummary | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ReportStatsSummary {
  pending: number
  resolved: number
  rejected: number
}

export interface ListReportsOptions {
  limit?: number
  offset?: number
  status?: AdminReportStatusFilter
  targetType?: AdminReportTargetTypeFilter
  reason?: AdminReportReasonFilter
  q?: string
  search?: string
}

export interface ListReportsResult {
  reports: AdminReportItem[]
  total: number
  stats: ReportStatsSummary
  limit: number
  offset: number
}

export interface UpdateReportResolutionInput {
  status: ReportStatus
  modNote?: string | null
}
