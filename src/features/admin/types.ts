import type { SafeAdmin, AdminRole } from '../../db/schema/admins'
import type { AdminSession } from '../../db/schema/admin-sessions'
import type { SafeAccount } from '../../db/schema/accounts'
import type {
  ReportTargetType,
  ReportReason,
  ReportStatus,
} from '../../db/schema/reports'
import type { SafeProfile } from '../../lib/profile'
import type { PostType, GenderScope } from '../../db/schema/posts'
import type { CommentType } from '../../db/schema/comments'
import type {
  InviteStatus,
  AdminReportStatusFilter,
  AdminReportTargetTypeFilter,
  AdminReportReasonFilter,
  AdminRoleFilter,
  AdminUserStatusFilter,
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
  q?: string
  search?: string
  role?: AdminRoleFilter
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
  q?: string
  search?: string
  status?: AdminUserStatusFilter
}

export interface UserStatsSummary {
  postsCount: number
  commentsCount: number
  readersCount: number
  authorsCount: number
  reportsReceivedCount: number
  reportsFiledCount: number
  blocksCount: number
  activeSessionsCount: number
  invitesStats: {
    total: number
    used: number
    active: number
  }
}

export interface UserListItem extends SafeAccount {
  profile: SafeProfile | null
}

export interface AdminUserDetail extends UserListItem {
  stats: UserStatsSummary
  invitedBy: {
    code: string
    inviter: {
      id: bigint
      email: string
      name: string | null
      identity: string | null
    } | null
  } | null
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

export interface AdminReportTargetPost {
  id: bigint
  authorId: bigint
  content: string
  type: PostType
  payload: Record<string, unknown>
  deletedAt: Date | null
  author: {
    id: bigint
    name: string | null
    identity: string | null
    avatarKey: string | null
  } | null
}

export interface AdminReportTargetComment {
  id: bigint
  postId: bigint
  authorId: bigint
  content: string
  type: CommentType
  payload: Record<string, unknown>
  deletedAt: Date | null
  author: {
    id: bigint
    name: string | null
    identity: string | null
    avatarKey: string | null
  } | null
}

export interface AdminReportTargetProfile {
  id: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  description: string | null
  isMale: boolean | null
}

export type AdminReportTarget =
  | { type: 'post'; post: AdminReportTargetPost | null }
  | { type: 'comment'; comment: AdminReportTargetComment | null }
  | { type: 'profile'; profile: AdminReportTargetProfile | null }

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
  target?: AdminReportTarget | null
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

export interface ResolveReportActionOptions {
  status: ReportStatus
  modNote?: string | null
  action: 'none' | 'delete_target' | 'ban_user' | 'remove_avatar'
  banReason?: string
}

export interface AdminPostAuthor {
  id: bigint
  accountId: bigint
  email: string
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale: boolean | null
  isVerified: boolean
}

export interface AdminPostItem {
  id: bigint
  authorId: bigint
  type: PostType
  payload: Record<string, unknown>
  content: string
  genderScope: GenderScope
  isFeed: boolean
  isPinned: boolean
  savesCount: number
  likesCount: number
  commentsCount: number
  viewsCount: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  editedAt: Date | null
  author: AdminPostAuthor | null
}

export interface ListPostsAdminOptions {
  limit?: number
  offset?: number
  q?: string
  search?: string
  status?: 'all' | 'active' | 'deleted'
  authorId?: bigint
  type?: 'all' | 'text' | 'media'
  genderScope?: 'all' | 'same_gender'
  isFeed?: 'all' | 'true' | 'false'
  isPinned?: 'all' | 'true' | 'false'
}

export interface ListPostsAdminResult {
  posts: AdminPostItem[]
  total: number
  limit: number
  offset: number
}

export interface AdminCommentItem {
  id: bigint
  postId: bigint
  authorId: bigint
  parentId: bigint | null
  replyToCommentId: bigint | null
  replyToProfileId: bigint | null
  type: CommentType
  payload: Record<string, unknown>
  content: string
  repliesCount: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  editedAt: Date | null
  author: AdminPostAuthor | null
}

export interface ListCommentsAdminOptions {
  limit?: number
  offset?: number
  q?: string
  search?: string
  status?: 'all' | 'active' | 'deleted'
  postId?: bigint
  authorId?: bigint
}

export interface ListCommentsAdminResult {
  comments: AdminCommentItem[]
  total: number
  limit: number
  offset: number
}
