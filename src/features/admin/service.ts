import {
  eq,
  sql,
  desc,
  count,
  and,
  or,
  isNull,
  isNotNull,
  gt,
  lte,
  ilike,
  aliasedTable,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { admins, safeAdminSchema, type SafeAdmin, type AdminRole } from '../../db/schema/admins'
import { adminSessions } from '../../db/schema/admin-sessions'
import { invites } from '../../db/schema/invites'
import { accounts, safeAccountSchema } from '../../db/schema/accounts'
import { profiles, type ProfileWithIdentity } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import {
  reports,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
} from '../../db/schema/reports'
import { hashPassword, verifyPassword } from '../../lib/password'
import {
  createAdminSession,
  invalidateAdminSession,
  invalidateAdminSessionByToken,
} from '../../lib/admin-session'
import { generateRandomInviteCode } from '../../lib/invite'
import { formatProfileResponse } from '../../lib/profile'
import type {
  AdminLoginInput,
  AdminLoginResult,
  CreateAdminInput,
  ListAdminsOptions,
  ListAdminsResult,
  CreateInviteInput,
  InviteCreator,
  InviteInviter,
  InviteItem,
  ListInvitesOptions,
  ListInvitesResult,
  ListUsersOptions,
  ListUsersResult,
  UserListItem,
  AdminReportItem,
  ListReportsOptions,
  ListReportsResult,
  UpdateReportResolutionInput,
} from './types'

export async function loginAdmin(input: AdminLoginInput): Promise<AdminLoginResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const admin = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.email})`, normalizedEmail),
  })

  if (!admin) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const isPasswordValid = await verifyPassword(admin.password, input.password)

  if (!isPasswordValid) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const safeAdmin = safeAdminSchema.parse(admin)
  const { session, token } = await createAdminSession(admin.id)

  return {
    admin: safeAdmin,
    session,
    token,
  }
}

export async function logoutAdmin(sessionId: bigint): Promise<void> {
  await invalidateAdminSession(sessionId)
}

export async function logoutAdminByToken(token: string): Promise<void> {
  await invalidateAdminSessionByToken(token)
}

export async function listAdmins(options: ListAdminsOptions = {}): Promise<ListAdminsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [adminRecords, totalResult] = await Promise.all([
    db.query.admins.findMany({
      limit,
      offset,
      orderBy: [desc(admins.createdAt)],
    }),
    db.select({ count: count() }).from(admins),
  ])

  const safeAdmins: SafeAdmin[] = adminRecords.map((admin) => safeAdminSchema.parse(admin))

  return {
    admins: safeAdmins,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function createAdmin(input: CreateAdminInput): Promise<SafeAdmin> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const role: AdminRole = input.role ?? 'moderator'

  const existing = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.email})`, normalizedEmail),
  })

  if (existing) {
    throw new HTTPException(409, { message: `Admin with email '${normalizedEmail}' already exists` })
  }

  const passwordHash = await hashPassword(input.password)

  const [newAdmin] = await db
    .insert(admins)
    .values({
      email: normalizedEmail,
      password: passwordHash,
      role,
    })
    .returning()

  if (!newAdmin) {
    throw new HTTPException(500, { message: 'Failed to create admin record' })
  }

  return safeAdminSchema.parse(newAdmin)
}

export async function deleteAdmin(targetAdminId: bigint, currentAdminId?: bigint): Promise<void> {
  if (currentAdminId !== undefined && targetAdminId === currentAdminId) {
    throw new HTTPException(400, { message: 'Cannot delete your own admin account' })
  }

  const existingInvite = await db.query.invites.findFirst({
    where: eq(invites.createdById, targetAdminId),
  })

  if (existingInvite) {
    throw new HTTPException(400, { message: 'Cannot delete admin who has created invites' })
  }

  const [deletedAdmin] = await db
    .delete(admins)
    .where(eq(admins.id, targetAdminId))
    .returning()

  if (!deletedAdmin) {
    throw new HTTPException(404, { message: 'Admin not found' })
  }
}

export async function createInvite(
  creator: { id: bigint; email: string; role: AdminRole },
  input: CreateInviteInput
): Promise<InviteItem> {
  let inviteCode = input.code?.trim().toUpperCase()

  if (!inviteCode) {
    inviteCode = generateRandomInviteCode()
  } else if (inviteCode.length < 8) {
    throw new HTTPException(400, { message: 'Invite code must be at least 8 characters long' })
  }

  if (!input.expiresAt || !(input.expiresAt instanceof Date) || isNaN(input.expiresAt.getTime())) {
    throw new HTTPException(400, { message: 'A valid expiration date (expiresAt) is required' })
  }

  const existing = await db.query.invites.findFirst({
    where: eq(invites.code, inviteCode),
  })

  if (existing) {
    throw new HTTPException(409, { message: `Invite code '${inviteCode}' already exists` })
  }

  const [newInvite] = await db
    .insert(invites)
    .values({
      code: inviteCode,
      createdById: creator.id,
      expiresAt: input.expiresAt,
    })
    .returning()

  if (!newInvite) {
    throw new HTTPException(500, { message: 'Failed to create invite record' })
  }

  const creatorInfo: InviteCreator = {
    id: creator.id,
    email: creator.email,
    role: creator.role,
  }

  return {
    id: newInvite.id,
    code: newInvite.code,
    expiresAt: newInvite.expiresAt,
    createdBy: creatorInfo,
    inviter: null,
    usedBy: null,
    usedAt: newInvite.usedAt,
    createdAt: newInvite.createdAt,
    updatedAt: newInvite.updatedAt,
  }
}

export async function deleteInvite(inviteId: bigint): Promise<void> {
  const [deleted] = await db
    .delete(invites)
    .where(eq(invites.id, inviteId))
    .returning()

  if (!deleted) {
    throw new HTTPException(404, { message: 'Invite not found' })
  }
}

export async function listInvites(options: ListInvitesOptions = {}): Promise<ListInvitesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'
  const searchQuery = (options.q ?? options.search)?.trim()
  const inviterAccounts = aliasedTable(accounts, 'inviter_accounts')

  const conditions: SQL[] = []

  if (status === 'active') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(gt(invites.expiresAt, sql`now()`))
  } else if (status === 'used') {
    conditions.push(isNotNull(invites.usedAt))
  } else if (status === 'expired') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(lte(invites.expiresAt, sql`now()`))
  }

  if (searchQuery) {
    const searchPattern = `%${searchQuery}%`
    const searchCondition = or(
      ilike(invites.code, searchPattern),
      ilike(admins.email, searchPattern),
      ilike(accounts.email, searchPattern),
      ilike(inviterAccounts.email, searchPattern)
    )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const totalCountQuery = searchQuery
    ? db
        .select({ count: count() })
        .from(invites)
        .leftJoin(admins, eq(invites.createdById, admins.id))
        .leftJoin(inviterAccounts, eq(invites.inviterId, inviterAccounts.id))
        .leftJoin(accounts, eq(invites.usedById, accounts.id))
        .where(whereClause)
    : db
        .select({ count: count() })
        .from(invites)
        .where(whereClause)

  const [items, totalResult, statsResult] = await Promise.all([
    db
      .select({
        invite: invites,
        creator: {
          id: admins.id,
          email: admins.email,
          role: admins.role,
        },
        inviter: {
          id: inviterAccounts.id,
          email: inviterAccounts.email,
        },
        usedBy: {
          id: accounts.id,
          email: accounts.email,
        },
      })
      .from(invites)
      .leftJoin(admins, eq(invites.createdById, admins.id))
      .leftJoin(inviterAccounts, eq(invites.inviterId, inviterAccounts.id))
      .leftJoin(accounts, eq(invites.usedById, accounts.id))
      .where(whereClause)
      .orderBy(desc(invites.createdAt))
      .limit(limit)
      .offset(offset),
    totalCountQuery,
    db
      .select({
        active: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} > now())::int`,
        used: sql<number>`count(*) filter (where ${invites.usedAt} is not null)::int`,
        expired: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} <= now())::int`,
      })
      .from(invites),
  ])

  const mappedInvites: InviteItem[] = items.map((item) => {
    const creatorInfo =
      item.creator && item.creator.id
        ? { id: item.creator.id, email: item.creator.email, role: item.creator.role as AdminRole }
        : null

    const inviterInfo =
      item.inviter && item.inviter.id
        ? { id: item.inviter.id, email: item.inviter.email }
        : null

    return {
      id: item.invite.id,
      code: item.invite.code,
      expiresAt: item.invite.expiresAt,
      createdBy: creatorInfo,
      inviter: inviterInfo,
      usedBy: item.usedBy && item.usedBy.id ? { id: item.usedBy.id, email: item.usedBy.email } : null,
      usedAt: item.invite.usedAt,
      createdAt: item.invite.createdAt,
      updatedAt: item.invite.updatedAt,
    }
  })

  const stats = {
    active: Number(statsResult[0]?.active ?? 0),
    used: Number(statsResult[0]?.used ?? 0),
    expired: Number(statsResult[0]?.expired ?? 0),
  }

  return {
    invites: mappedInvites,
    total: totalResult[0]?.count ?? 0,
    stats,
    limit,
    offset,
  }
}

export async function listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [accountRecords, totalResult] = await Promise.all([
    db
      .select({
        account: {
          id: accounts.id,
          email: accounts.email,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
        },
        profile: profiles,
        identity: identities,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .orderBy(desc(accounts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(accounts),
  ])

  const users: UserListItem[] = accountRecords.map(({ account, profile, identity }) => {
    const fullProfile: ProfileWithIdentity | null =
      profile && profile.id
        ? {
            ...profile,
            identity: identity && identity.id ? identity : null,
          }
        : null

    return {
      ...account,
      profile: formatProfileResponse(fullProfile),
    }
  })

  return {
    users,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function listReports(options: ListReportsOptions = {}): Promise<ListReportsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'
  const targetType = options.targetType ?? 'all'
  const reason = options.reason ?? 'all'
  const searchQuery = (options.q ?? options.search)?.trim()

  const reporterAccounts = aliasedTable(accounts, 'reporter_accounts')
  const reporterProfiles = aliasedTable(profiles, 'reporter_profiles')
  const reporterIdentities = aliasedTable(identities, 'reporter_identities')

  const reportedAccounts = aliasedTable(accounts, 'reported_accounts')
  const reportedProfiles = aliasedTable(profiles, 'reported_profiles')
  const reportedIdentities = aliasedTable(identities, 'reported_identities')

  const resolverAdmins = aliasedTable(admins, 'resolver_admins')

  const conditions: SQL[] = []

  if (status !== 'all') {
    conditions.push(eq(reports.status, status))
  }

  if (targetType !== 'all') {
    conditions.push(eq(reports.targetType, targetType))
  }

  if (reason !== 'all') {
    conditions.push(eq(reports.reason, reason))
  }

  if (searchQuery) {
    const searchPattern = `%${searchQuery}%`
    const searchCondition = or(
      ilike(reports.details, searchPattern),
      ilike(reports.modNote, searchPattern),
      ilike(reporterAccounts.email, searchPattern),
      ilike(reportedAccounts.email, searchPattern),
      ilike(reporterProfiles.name, searchPattern),
      ilike(reportedProfiles.name, searchPattern),
      ilike(reporterIdentities.identity, searchPattern),
      ilike(reportedIdentities.identity, searchPattern)
    )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const totalCountQuery = searchQuery
    ? db
        .select({ count: count() })
        .from(reports)
        .leftJoin(reporterAccounts, eq(reports.reporterId, reporterAccounts.id))
        .leftJoin(reporterProfiles, eq(reports.reporterId, reporterProfiles.accountId))
        .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
        .leftJoin(reportedAccounts, eq(reports.reportedUserId, reportedAccounts.id))
        .leftJoin(reportedProfiles, eq(reports.reportedUserId, reportedProfiles.accountId))
        .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
        .leftJoin(resolverAdmins, eq(reports.resolveById, resolverAdmins.id))
        .where(whereClause)
    : db
        .select({ count: count() })
        .from(reports)
        .where(whereClause)

  const [items, totalResult, statsResult] = await Promise.all([
    db
      .select({
        report: reports,
        reporter: {
          id: reporterAccounts.id,
          email: reporterAccounts.email,
        },
        reporterProfile: {
          name: reporterProfiles.name,
          avatarKey: reporterProfiles.avatarKey,
        },
        reporterIdentity: {
          identity: reporterIdentities.identity,
        },
        reportedUser: {
          id: reportedAccounts.id,
          email: reportedAccounts.email,
        },
        reportedUserProfile: {
          name: reportedProfiles.name,
          avatarKey: reportedProfiles.avatarKey,
        },
        reportedUserIdentity: {
          identity: reportedIdentities.identity,
        },
        resolver: {
          id: resolverAdmins.id,
          email: resolverAdmins.email,
          role: resolverAdmins.role,
        },
      })
      .from(reports)
      .leftJoin(reporterAccounts, eq(reports.reporterId, reporterAccounts.id))
      .leftJoin(reporterProfiles, eq(reports.reporterId, reporterProfiles.accountId))
      .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
      .leftJoin(reportedAccounts, eq(reports.reportedUserId, reportedAccounts.id))
      .leftJoin(reportedProfiles, eq(reports.reportedUserId, reportedProfiles.accountId))
      .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
      .leftJoin(resolverAdmins, eq(reports.resolveById, resolverAdmins.id))
      .where(whereClause)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset),
    totalCountQuery,
    db
      .select({
        pending: sql<number>`count(*) filter (where ${reports.status} = 'pending')::int`,
        resolved: sql<number>`count(*) filter (where ${reports.status} = 'resolved')::int`,
        rejected: sql<number>`count(*) filter (where ${reports.status} = 'rejected')::int`,
      })
      .from(reports),
  ])

  const mappedReports: AdminReportItem[] = items.map((item) => {
    const reporterInfo =
      item.reporter && item.reporter.id
        ? {
            id: item.reporter.id,
            email: item.reporter.email,
            name: item.reporterProfile?.name ?? null,
            identity: item.reporterIdentity?.identity ?? null,
            avatarKey: item.reporterProfile?.avatarKey ?? null,
          }
        : null

    const reportedUserInfo =
      item.reportedUser && item.reportedUser.id
        ? {
            id: item.reportedUser.id,
            email: item.reportedUser.email,
            name: item.reportedUserProfile?.name ?? null,
            identity: item.reportedUserIdentity?.identity ?? null,
            avatarKey: item.reportedUserProfile?.avatarKey ?? null,
          }
        : null

    const resolverInfo =
      item.resolver && item.resolver.id
        ? {
            id: item.resolver.id,
            email: item.resolver.email,
            role: item.resolver.role as AdminRole,
          }
        : null

    return {
      id: item.report.id,
      targetType: item.report.targetType as ReportTargetType,
      targetId: item.report.targetId,
      reason: item.report.reason as ReportReason,
      details: item.report.details,
      status: item.report.status as ReportStatus,
      modNote: item.report.modNote,
      reporter: reporterInfo,
      reportedUser: reportedUserInfo,
      resolvedBy: resolverInfo,
      resolvedAt: item.report.resolvedAt,
      createdAt: item.report.createdAt,
      updatedAt: item.report.updatedAt,
    }
  })

  const stats = {
    pending: Number(statsResult[0]?.pending ?? 0),
    resolved: Number(statsResult[0]?.resolved ?? 0),
    rejected: Number(statsResult[0]?.rejected ?? 0),
  }

  return {
    reports: mappedReports,
    total: totalResult[0]?.count ?? 0,
    stats,
    limit,
    offset,
  }
}

export async function getReportById(reportId: bigint): Promise<AdminReportItem> {
  const reporterAccounts = aliasedTable(accounts, 'reporter_accounts')
  const reporterProfiles = aliasedTable(profiles, 'reporter_profiles')
  const reporterIdentities = aliasedTable(identities, 'reporter_identities')

  const reportedAccounts = aliasedTable(accounts, 'reported_accounts')
  const reportedProfiles = aliasedTable(profiles, 'reported_profiles')
  const reportedIdentities = aliasedTable(identities, 'reported_identities')

  const resolverAdmins = aliasedTable(admins, 'resolver_admins')

  const [item] = await db
    .select({
      report: reports,
      reporter: {
        id: reporterAccounts.id,
        email: reporterAccounts.email,
      },
      reporterProfile: {
        name: reporterProfiles.name,
        avatarKey: reporterProfiles.avatarKey,
      },
      reporterIdentity: {
        identity: reporterIdentities.identity,
      },
      reportedUser: {
        id: reportedAccounts.id,
        email: reportedAccounts.email,
      },
      reportedUserProfile: {
        name: reportedProfiles.name,
        avatarKey: reportedProfiles.avatarKey,
      },
      reportedUserIdentity: {
        identity: reportedIdentities.identity,
      },
      resolver: {
        id: resolverAdmins.id,
        email: resolverAdmins.email,
        role: resolverAdmins.role,
      },
    })
    .from(reports)
    .leftJoin(reporterAccounts, eq(reports.reporterId, reporterAccounts.id))
    .leftJoin(reporterProfiles, eq(reports.reporterId, reporterProfiles.accountId))
    .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
    .leftJoin(reportedAccounts, eq(reports.reportedUserId, reportedAccounts.id))
    .leftJoin(reportedProfiles, eq(reports.reportedUserId, reportedProfiles.accountId))
    .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
    .leftJoin(resolverAdmins, eq(reports.resolveById, resolverAdmins.id))
    .where(eq(reports.id, reportId))

  if (!item) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  const reporterInfo =
    item.reporter && item.reporter.id
      ? {
          id: item.reporter.id,
          email: item.reporter.email,
          name: item.reporterProfile?.name ?? null,
          identity: item.reporterIdentity?.identity ?? null,
          avatarKey: item.reporterProfile?.avatarKey ?? null,
        }
      : null

  const reportedUserInfo =
    item.reportedUser && item.reportedUser.id
      ? {
          id: item.reportedUser.id,
          email: item.reportedUser.email,
          name: item.reportedUserProfile?.name ?? null,
          identity: item.reportedUserIdentity?.identity ?? null,
          avatarKey: item.reportedUserProfile?.avatarKey ?? null,
        }
      : null

  const resolverInfo =
    item.resolver && item.resolver.id
      ? {
          id: item.resolver.id,
          email: item.resolver.email,
          role: item.resolver.role as AdminRole,
        }
      : null

  return {
    id: item.report.id,
    targetType: item.report.targetType as ReportTargetType,
    targetId: item.report.targetId,
    reason: item.report.reason as ReportReason,
    details: item.report.details,
    status: item.report.status as ReportStatus,
    modNote: item.report.modNote,
    reporter: reporterInfo,
    reportedUser: reportedUserInfo,
    resolvedBy: resolverInfo,
    resolvedAt: item.report.resolvedAt,
    createdAt: item.report.createdAt,
    updatedAt: item.report.updatedAt,
  }
}

export async function updateReportResolution(
  admin: { id: bigint; role: AdminRole },
  reportId: bigint,
  input: UpdateReportResolutionInput
): Promise<AdminReportItem> {
  const existing = await db.query.reports.findFirst({
    where: eq(reports.id, reportId),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  const { status, modNote } = input
  const isResolving = status !== 'pending'
  const resolvedAt = isResolving ? new Date() : null
  const resolveById = isResolving ? admin.id : null

  const [updated] = await db
    .update(reports)
    .set({
      status,
      modNote: modNote !== undefined ? (modNote && modNote.trim().length > 0 ? modNote.trim() : null) : existing.modNote,
      resolveById,
      resolvedAt,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId))
    .returning()

  if (!updated) {
    throw new HTTPException(500, { message: 'Failed to update report' })
  }

  return getReportById(reportId)
}
