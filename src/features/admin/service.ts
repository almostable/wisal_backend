import {
  eq,
  sql,
  desc,
  asc,
  count,
  and,
  or,
  isNull,
  isNotNull,
  gt,
  lte,
  ilike,
  aliasedTable,
  inArray,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { MAX_PG_BIGINT } from '../../db/schema/common'
import { admins, safeAdminSchema, type SafeAdmin, type AdminRole } from '../../db/schema/admins'

function parseSafeBigInt(val: string): bigint | null {
  if (!/^\d{1,19}$/.test(val)) return null
  try {
    const b = BigInt(val)
    return b > 0n && b <= MAX_PG_BIGINT ? b : null
  } catch {
    return null
  }
}
import { adminSessions } from '../../db/schema/admin-sessions'
import { invites } from '../../db/schema/invites'
import { accounts, safeAccountSchema } from '../../db/schema/accounts'
import { profiles, type Profile, type ProfileWithIdentity } from '../../db/schema/profiles'
import { identities, type Identity } from '../../db/schema/identities'
import { posts, type PostType, type GenderScope } from '../../db/schema/posts'
import { comments, type CommentType } from '../../db/schema/comments'
import { readers } from '../../db/schema/readers'
import { profileBlocks } from '../../db/schema/profile-blocks'
import { postSaves } from '../../db/schema/post-saves'
import { postLikes } from '../../db/schema/post-likes'
import { sessions } from '../../db/schema/sessions'
import { mediaUploads } from '../../db/schema/media-uploads'
import { userRestrictions } from '../../db/schema/user-restrictions'
import { reconcileEntityMedia, markEntityMediaDeleted } from '../uploads/service'
import { createNotification } from '../notifications/service'
import { NOTIFICATION_CODES } from '../../config/error-codes'
import type {
  AdminUpdateUserProfileInput,
  BanUserInput,
  UnbanUserInput,
  UpdatePostByAdminInput,
} from './schema'
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
  AdminUserDetail,
  AdminReportItem,
  AdminReportTarget,
  ListReportsOptions,
  ListReportsResult,
  UpdateReportResolutionInput,
  ResolveReportActionOptions,
  AdminPostItem,
  AdminPostAuthor,
  ListPostsAdminOptions,
  ListPostsAdminResult,
  AdminCommentItem,
  ListCommentsAdminOptions,
  ListCommentsAdminResult,
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
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(eq(admins.id, safeId), ilike(admins.email, searchPattern))
      : ilike(admins.email, searchPattern)
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  if (options.role && options.role !== 'all') {
    conditions.push(eq(admins.role, options.role))
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [adminRecords, totalResult] = await Promise.all([
    db
      .select()
      .from(admins)
      .where(whereCondition)
      .orderBy(desc(admins.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(admins)
      .where(whereCondition),
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
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(invites.id, safeId),
          eq(invites.createdById, safeId),
          eq(invites.usedById, safeId),
          eq(invites.inviterId, safeId),
          ilike(invites.code, searchPattern),
          ilike(admins.email, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(inviterAccounts.email, searchPattern)
        )
      : or(
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
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(accounts.id, safeId),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
      : or(
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  if (options.status && options.status !== 'all') {
    switch (options.status) {
      case 'onboarded':
        conditions.push(and(isNotNull(profiles.name), isNotNull(profiles.identityId)))
        break
      case 'pending':
        conditions.push(or(isNull(profiles.name), isNull(profiles.identityId)))
        break
      case 'verified':
        conditions.push(isNotNull(profiles.verifiedAt))
        break
      case 'unverified':
        conditions.push(isNull(profiles.verifiedAt))
        break
    }
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [accountRecords, totalResult] = await Promise.all([
    db
      .select({
        account: {
          id: accounts.id,
          email: accounts.email,
          bannedAt: accounts.bannedAt,
          deletedAt: accounts.deletedAt,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
        },
        profile: profiles,
        identity: identities,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(accounts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
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

export async function getUserById(accountId: bigint): Promise<AdminUserDetail> {
  const [record] = await db
    .select({
      account: {
        id: accounts.id,
        email: accounts.email,
        bannedAt: accounts.bannedAt,
        deletedAt: accounts.deletedAt,
        createdAt: accounts.createdAt,
        updatedAt: accounts.updatedAt,
      },
      profile: profiles,
      identity: identities,
    })
    .from(accounts)
    .leftJoin(profiles, eq(accounts.id, profiles.accountId))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .where(eq(accounts.id, accountId))
    .limit(1)

  if (!record || !record.account) {
    throw new HTTPException(404, { message: 'User not found' })
  }

  const profileId = record.profile?.id

  const [
    postsCountRes,
    commentsCountRes,
    readersCountRes,
    authorsCountRes,
    reportsReceivedRes,
    reportsFiledRes,
    blocksCountRes,
    sessionsCountRes,
    invitesStatsRes,
    usedInviteRow,
  ] = await Promise.all([
    profileId
      ? db
          .select({ count: count() })
          .from(posts)
          .where(and(eq(posts.authorId, profileId), isNull(posts.deletedAt)))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(comments)
          .where(and(eq(comments.authorId, profileId), isNull(comments.deletedAt)))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(readers)
          .where(eq(readers.authorProfileId, profileId))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(readers)
          .where(eq(readers.readerProfileId, profileId))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(reports)
          .where(eq(reports.reportedProfileId, profileId))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(reports)
          .where(eq(reports.reporterProfileId, profileId))
      : [{ count: 0 }],
    profileId
      ? db
          .select({ count: count() })
          .from(profileBlocks)
          .where(
            or(
              eq(profileBlocks.blockerProfileId, profileId),
              eq(profileBlocks.blockedProfileId, profileId)
            )
          )
      : [{ count: 0 }],
    db
      .select({ count: count() })
      .from(sessions)
      .where(and(eq(sessions.accountId, accountId), gt(sessions.expiresAt, sql`now()`))),
    db
      .select({
        total: count(),
        used: sql<number>`count(*) filter (where ${invites.usedAt} is not null)::int`,
        active: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} > now())::int`,
      })
      .from(invites)
      .where(eq(invites.inviterId, accountId)),
    db
      .select({
        code: invites.code,
        inviterAccount: {
          id: accounts.id,
          email: accounts.email,
        },
        inviterProfile: {
          name: profiles.name,
        },
        inviterIdentity: {
          identity: identities.identity,
        },
      })
      .from(invites)
      .leftJoin(accounts, eq(invites.inviterId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(invites.usedById, accountId))
      .limit(1),
  ])

  const fullProfile: ProfileWithIdentity | null =
    record.profile && record.profile.id
      ? {
          ...record.profile,
          identity: record.identity && record.identity.id ? record.identity : null,
        }
      : null

  const invitedBy =
    usedInviteRow[0]
      ? {
          code: usedInviteRow[0].code,
          inviter: usedInviteRow[0].inviterAccount?.id
            ? {
                id: usedInviteRow[0].inviterAccount.id,
                email: usedInviteRow[0].inviterAccount.email,
                name: usedInviteRow[0].inviterProfile?.name ?? null,
                identity: usedInviteRow[0].inviterIdentity?.identity ?? null,
              }
            : null,
        }
      : null

  const stats = {
    postsCount: postsCountRes[0]?.count ?? 0,
    commentsCount: commentsCountRes[0]?.count ?? 0,
    readersCount: readersCountRes[0]?.count ?? 0,
    authorsCount: authorsCountRes[0]?.count ?? 0,
    reportsReceivedCount: reportsReceivedRes[0]?.count ?? 0,
    reportsFiledCount: reportsFiledRes[0]?.count ?? 0,
    blocksCount: blocksCountRes[0]?.count ?? 0,
    activeSessionsCount: sessionsCountRes[0]?.count ?? 0,
    invitesStats: {
      total: Number(invitesStatsRes[0]?.total ?? 0),
      used: Number(invitesStatsRes[0]?.used ?? 0),
      active: Number(invitesStatsRes[0]?.active ?? 0),
    },
  }

  return {
    ...record.account,
    profile: formatProfileResponse(fullProfile),
    stats,
    invitedBy,
  }
}

export async function updateUserProfileByAdmin(
  accountId: bigint,
  input: AdminUpdateUserProfileInput
): Promise<UserListItem> {
  return await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        account: {
          id: accounts.id,
          email: accounts.email,
          bannedAt: accounts.bannedAt,
          deletedAt: accounts.deletedAt,
          createdAt: accounts.createdAt,
          updatedAt: accounts.updatedAt,
        },
        profile: profiles,
        identity: identities,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, accountId))
      .limit(1)

    if (!record || !record.account) {
      throw new HTTPException(404, { message: 'User not found' })
    }

    const existingProfile = record.profile && record.profile.id ? record.profile : null
    let updatedIdentity: Identity | null = record.identity && record.identity.id ? record.identity : null

    let newVerifiedAt: Date | null
    if (input.isVerified !== undefined) {
      newVerifiedAt = input.isVerified ? new Date() : null
    } else {
      newVerifiedAt = existingProfile?.verifiedAt ?? null
    }

    const resultingIsVerified = newVerifiedAt !== null

    let newIdentityId: bigint | null = existingProfile?.identityId ?? null
    if (input.identity !== undefined) {
      const normalizedIdentity = input.identity.trim().toLowerCase()
      const minLength = resultingIsVerified ? 3 : 5
      if (normalizedIdentity.length < minLength) {
        throw new HTTPException(400, {
          message: `Identity must be at least ${minLength} characters long`,
        })
      }

      if (!updatedIdentity || updatedIdentity.identity.toLowerCase() !== normalizedIdentity) {
        const existingIdentityRecord = await tx.query.identities.findFirst({
          where: eq(sql`lower(${identities.identity})`, normalizedIdentity),
        })

        if (existingIdentityRecord && existingIdentityRecord.id !== existingProfile?.identityId) {
          throw new HTTPException(409, { message: `Identity '${input.identity}' is already taken` })
        }

        if (existingProfile?.identityId) {
          const [updated] = await tx
            .update(identities)
            .set({ identity: normalizedIdentity })
            .where(eq(identities.id, existingProfile.identityId))
            .returning()
          updatedIdentity = updated
        } else {
          const [created] = await tx
            .insert(identities)
            .values({ identity: normalizedIdentity })
            .returning()
          updatedIdentity = created
          newIdentityId = created.id
        }
      }
    }

    let finalProfile: Profile

    if (existingProfile) {
      const updateData: Partial<typeof profiles.$inferInsert> = {}

      if (input.name !== undefined) {
        updateData.name = input.name.trim()
      }
      if (input.isMale !== undefined) {
        updateData.isMale = input.isMale
      }
      if (input.avatarKey !== undefined) {
        updateData.avatarKey = input.avatarKey
        const oldAvatarKeys = existingProfile.avatarKey ? [existingProfile.avatarKey] : []
        const newAvatarKeys = input.avatarKey ? [input.avatarKey] : []
        if (oldAvatarKeys.length > 0 || newAvatarKeys.length > 0) {
          await reconcileEntityMedia(tx, {
            entityType: 'avatar',
            entityId: existingProfile.id,
            profileId: existingProfile.id,
            newFileKeys: newAvatarKeys,
            oldFileKeys: oldAvatarKeys,
          })
        }
      }
      if (input.description !== undefined) {
        updateData.description = input.description?.trim() ?? null
      }
      if (input.contacts !== undefined) {
        updateData.contacts = input.contacts ?? null
      }
      if (input.isVerified !== undefined) {
        updateData.verifiedAt = newVerifiedAt
      }
      if (newIdentityId !== null && newIdentityId !== existingProfile.identityId) {
        updateData.identityId = newIdentityId
        updateData.identity = updatedIdentity?.identity ?? null
      }

      if (Object.keys(updateData).length > 0) {
        const [updated] = await tx
          .update(profiles)
          .set(updateData)
          .where(eq(profiles.id, existingProfile.id))
          .returning()
        finalProfile = updated
      } else {
        finalProfile = existingProfile
      }
    } else {
      const [created] = await tx
        .insert(profiles)
        .values({
          accountId,
          name: input.name?.trim() ?? null,
          isMale: input.isMale ?? null,
          avatarKey: input.avatarKey ?? null,
          description: input.description?.trim() ?? null,
          contacts: input.contacts ?? null,
          identityId: newIdentityId,
          verifiedAt: newVerifiedAt,
        })
        .returning()

      if (input.avatarKey) {
        await reconcileEntityMedia(tx, {
          entityType: 'avatar',
          entityId: created.id,
          profileId: created.id,
          newFileKeys: [input.avatarKey],
          oldFileKeys: [],
        })
      }

      finalProfile = created
    }

    const fullProfile: ProfileWithIdentity = {
      ...finalProfile,
      identity: updatedIdentity,
    }

    return {
      ...record.account,
      profile: formatProfileResponse(fullProfile),
    }
  })
}

// ---------------------------------------------------------
// User Ban / Unban / Session Revoke
// ---------------------------------------------------------

export async function banUserAccount(
  admin: { id: bigint },
  accountId: bigint,
  input: BanUserInput
): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        account: accounts,
        profile: profiles,
        identity: identities,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, accountId))
      .limit(1)

    if (!record || !record.account || record.account.deletedAt !== null) {
      throw new HTTPException(404, { message: 'User not found' })
    }

    if (record.account.bannedAt !== null) {
      throw new HTTPException(400, { message: 'User is already banned' })
    }

    const now = new Date()

    // 1. Set bannedAt on account
    await tx
      .update(accounts)
      .set({ bannedAt: now })
      .where(eq(accounts.id, accountId))

    // 2. Insert into userRestrictions
    await tx.insert(userRestrictions).values({
      accountId,
      adminId: admin.id,
      type: 'ban',
      reason: input.reason.trim(),
      expiresAt: null,
      isActive: true,
    })

    // 3. Invalidate all active sessions immediately
    await tx.delete(sessions).where(eq(sessions.accountId, accountId))

    if (record.profile) {
      const profileId = record.profile.id

      // 4. Soft-delete all posts of this user & mark media deleted
      await tx
        .update(posts)
        .set({
          deletedAt: now,
          isPinned: false,
        })
        .where(and(eq(posts.authorId, profileId), isNull(posts.deletedAt)))

      await tx
        .update(mediaUploads)
        .set({ status: 'deleted' })
        .where(
          and(
            eq(mediaUploads.profileId, profileId),
            eq(mediaUploads.status, 'attached')
          )
        )

      // 5. Soft-delete all comments of this user
      await tx
        .update(comments)
        .set({ deletedAt: now })
        .where(and(eq(comments.authorId, profileId), isNull(comments.deletedAt)))

      // 6. Delete all reader connections & decrement counters
      // 6a. Decrement counts for authors whom this user was reading
      const userReading = await tx
        .select({ authorProfileId: readers.authorProfileId })
        .from(readers)
        .where(eq(readers.readerProfileId, profileId))

      const readAuthorIds = userReading.map((r) => r.authorProfileId)
      if (readAuthorIds.length > 0) {
        await tx
          .update(profiles)
          .set({
            readersCount: sql`GREATEST(0, ${profiles.readersCount} - 1)`,
          })
          .where(inArray(profiles.id, readAuthorIds))
      }

      await tx
        .delete(readers)
        .where(
          or(
            eq(readers.authorProfileId, profileId),
            eq(readers.readerProfileId, profileId)
          )
        )

      // 7. Clear identity & release handle
      if (record.profile.identityId) {
        const oldIdentityId = record.profile.identityId
        await tx
          .update(profiles)
          .set({
            identityId: null,
            identity: null,
            readersCount: 0,
          })
          .where(eq(profiles.id, profileId))

        await tx.delete(identities).where(eq(identities.id, oldIdentityId))
      }

      // 8. Find inviter -> annul unused active invites -> send system_restriction notification
      const usedInvite = await tx.query.invites.findFirst({
        where: eq(invites.usedById, accountId),
      })

      if (usedInvite?.inviterId) {
        await tx
          .update(invites)
          .set({ expiresAt: now })
          .where(
            and(
              eq(invites.inviterId, usedInvite.inviterId),
              isNull(invites.usedAt),
              gt(invites.expiresAt, sql`now()`)
            )
          )

        const inviterProfile = await tx.query.profiles.findFirst({
          where: eq(profiles.accountId, usedInvite.inviterId),
        })

        if (inviterProfile) {
          const bannedHandle = record.identity?.identity ? `@${record.identity.identity}` : 'пользователь'
          await createNotification(
            {
              recipientProfileId: inviterProfile.id,
              actorProfileId: null,
              type: 'system_restriction',
              targetType: 'system',
              payload: {
                code: NOTIFICATION_CODES.INVITED_USER_BANNED,
                meta: { handle: bannedHandle },
                reason: `Приглашенный вами пользователь (${bannedHandle}) был заблокирован за нарушение правил. Ваши неиспользованные инвайт-коды аннулированы.`,
              },
            },
            tx
          )
        }
      }
    }

    return {
      success: true,
      message: 'User banned successfully',
    }
  })
}

export async function unbanUserAccount(
  admin: { id: bigint },
  accountId: bigint,
  input: UnbanUserInput
): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const account = await tx.query.accounts.findFirst({
      where: and(eq(accounts.id, accountId), isNull(accounts.deletedAt)),
    })

    if (!account) {
      throw new HTTPException(404, { message: 'User not found' })
    }

    if (account.bannedAt === null) {
      throw new HTTPException(400, { message: 'User is not banned' })
    }

    const now = new Date()

    await tx
      .update(accounts)
      .set({ bannedAt: null })
      .where(eq(accounts.id, accountId))

    await tx
      .update(userRestrictions)
      .set({
        isActive: false,
        revokedAt: now,
        revokedById: admin.id,
        revokeReason: input.reason.trim(),
      })
      .where(
        and(
          eq(userRestrictions.accountId, accountId),
          eq(userRestrictions.isActive, true)
        )
      )

    return {
      success: true,
      message: 'User unbanned successfully',
    }
  })
}

export async function revokeUserSessions(accountId: bigint): Promise<{ success: boolean; count: number }> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.accountId, accountId))
    .returning({ id: sessions.id })

  return {
    success: true,
    count: deleted.length,
  }
}

// ---------------------------------------------------------
// Posts Moderation
// ---------------------------------------------------------

export async function listPostsByAdmin(
  options: ListPostsAdminOptions = {}
): Promise<ListPostsAdminResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (options.status === 'active') {
    conditions.push(isNull(posts.deletedAt))
  } else if (options.status === 'deleted') {
    conditions.push(isNotNull(posts.deletedAt))
  }

  if (options.authorId) {
    conditions.push(eq(posts.authorId, options.authorId))
  }

  if (options.type && options.type !== 'all') {
    conditions.push(eq(posts.type, options.type))
  }

  if (options.genderScope && options.genderScope !== 'all') {
    conditions.push(eq(posts.genderScope, options.genderScope))
  }

  if (options.isFeed === 'true') {
    conditions.push(eq(posts.isFeed, true))
  } else if (options.isFeed === 'false') {
    conditions.push(eq(posts.isFeed, false))
  }

  if (options.isPinned === 'true') {
    conditions.push(eq(posts.isPinned, true))
  } else if (options.isPinned === 'false') {
    conditions.push(eq(posts.isPinned, false))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(posts.id, safeId),
          eq(posts.authorId, safeId),
          ilike(posts.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
      : or(
          ilike(posts.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [rawPosts, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
        author: {
          id: profiles.id,
          accountId: profiles.accountId,
          email: accounts.email,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
          isMale: profiles.isMale,
          verifiedAt: profiles.verifiedAt,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
  ])

  const mappedPosts: AdminPostItem[] = rawPosts.map((item) => {
    const author: AdminPostAuthor | null =
      item.author && item.author.id && item.author.accountId && item.author.email
        ? {
            id: item.author.id,
            accountId: item.author.accountId,
            email: item.author.email,
            name: item.author.name,
            identity: item.identity?.identity ?? null,
            avatarKey: item.author.avatarKey,
            isMale: item.author.isMale,
            isVerified: Boolean(item.author.verifiedAt),
          }
        : null

    return {
      id: item.post.id,
      authorId: item.post.authorId,
      type: item.post.type as PostType,
      payload: item.post.payload as Record<string, unknown>,
      content: item.post.content,
      genderScope: item.post.genderScope as GenderScope,
      isFeed: item.post.isFeed,
      isPinned: item.post.isPinned,
      savesCount: item.post.savesCount,
      likesCount: item.post.likesCount,
      commentsCount: item.post.commentsCount,
      viewsCount: item.post.viewsCount,
      deletedAt: item.post.deletedAt,
      createdAt: item.post.createdAt,
      updatedAt: item.post.updatedAt,
      editedAt: item.post.editedAt,
      author,
    }
  })

  return {
    posts: mappedPosts,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getPostByIdByAdmin(postId: bigint): Promise<AdminPostItem> {
  const [item] = await db
    .select({
      post: posts,
      author: {
        id: profiles.id,
        accountId: profiles.accountId,
        email: accounts.email,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        isMale: profiles.isMale,
        verifiedAt: profiles.verifiedAt,
      },
      identity: {
        identity: identities.identity,
      },
    })
    .from(posts)
    .leftJoin(profiles, eq(posts.authorId, profiles.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .where(eq(posts.id, postId))
    .limit(1)

  if (!item) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  const author: AdminPostAuthor | null =
    item.author && item.author.id && item.author.accountId && item.author.email
      ? {
          id: item.author.id,
          accountId: item.author.accountId,
          email: item.author.email,
          name: item.author.name,
          identity: item.identity?.identity ?? null,
          avatarKey: item.author.avatarKey,
          isMale: item.author.isMale,
          isVerified: Boolean(item.author.verifiedAt),
        }
      : null

  return {
    id: item.post.id,
    authorId: item.post.authorId,
    type: item.post.type as PostType,
    payload: item.post.payload as Record<string, unknown>,
    content: item.post.content,
    genderScope: item.post.genderScope as GenderScope,
    isFeed: item.post.isFeed,
    isPinned: item.post.isPinned,
    savesCount: item.post.savesCount,
    likesCount: item.post.likesCount,
    commentsCount: item.post.commentsCount,
    viewsCount: item.post.viewsCount,
    deletedAt: item.post.deletedAt,
    createdAt: item.post.createdAt,
    updatedAt: item.post.updatedAt,
    editedAt: item.post.editedAt,
    author,
  }
}

export async function deletePostByAdmin(postId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.deletedAt !== null) {
      throw new HTTPException(400, { message: 'Post is already deleted' })
    }

    await tx
      .update(posts)
      .set({
        deletedAt: new Date(),
        isPinned: false,
      })
      .where(eq(posts.id, postId))

    await markEntityMediaDeleted(tx, {
      entityType: 'post',
      entityId: postId,
    })

    await tx.execute(sql`
      UPDATE media_uploads
      SET status = 'deleted'
      WHERE entity_type = 'comment'
        AND status = 'attached'
        AND entity_id IN (
          SELECT id FROM comments WHERE post_id = ${postId}
        )
    `)

    return {
      success: true,
      message: 'Post deleted successfully by admin',
    }
  })
}

export async function restorePostByAdmin(postId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.deletedAt === null) {
      throw new HTTPException(400, { message: 'Post is not deleted' })
    }

    await tx
      .update(posts)
      .set({ deletedAt: null })
      .where(eq(posts.id, postId))

    await tx
      .update(mediaUploads)
      .set({ status: 'attached' })
      .where(
        and(
          eq(mediaUploads.entityType, 'post'),
          eq(mediaUploads.entityId, postId),
          eq(mediaUploads.status, 'deleted')
        )
      )

    return {
      success: true,
      message: 'Post restored successfully',
    }
  })
}

export async function updatePostByAdmin(
  postId: bigint,
  input: UpdatePostByAdminInput
): Promise<AdminPostItem> {
  const existing = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  const updateData: Partial<typeof posts.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (input.isFeed !== undefined) {
    updateData.isFeed = input.isFeed
  }
  if (input.isPinned !== undefined) {
    updateData.isPinned = input.isPinned
  }
  if (input.content !== undefined) {
    updateData.content = input.content
  }
  if (input.payload !== undefined) {
    updateData.payload = input.payload
  }

  await db.update(posts).set(updateData).where(eq(posts.id, postId))

  return getPostByIdByAdmin(postId)
}

// ---------------------------------------------------------
// Comments Moderation
// ---------------------------------------------------------

export async function listCommentsByAdmin(
  options: ListCommentsAdminOptions = {}
): Promise<ListCommentsAdminResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (options.status === 'active') {
    conditions.push(isNull(comments.deletedAt))
  } else if (options.status === 'deleted') {
    conditions.push(isNotNull(comments.deletedAt))
  }

  if (options.postId) {
    conditions.push(eq(comments.postId, options.postId))
  }

  if (options.authorId) {
    conditions.push(eq(comments.authorId, options.authorId))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(comments.id, safeId),
          eq(comments.postId, safeId),
          eq(comments.authorId, safeId),
          ilike(comments.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
      : or(
          ilike(comments.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [rawComments, totalResult] = await Promise.all([
    db
      .select({
        comment: comments,
        author: {
          id: profiles.id,
          accountId: profiles.accountId,
          email: accounts.email,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
          isMale: profiles.isMale,
          verifiedAt: profiles.verifiedAt,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
  ])

  const mappedComments: AdminCommentItem[] = rawComments.map((item) => {
    const author: AdminPostAuthor | null =
      item.author && item.author.id && item.author.accountId && item.author.email
        ? {
            id: item.author.id,
            accountId: item.author.accountId,
            email: item.author.email,
            name: item.author.name,
            identity: item.identity?.identity ?? null,
            avatarKey: item.author.avatarKey,
            isMale: item.author.isMale,
            isVerified: Boolean(item.author.verifiedAt),
          }
        : null

    return {
      id: item.comment.id,
      postId: item.comment.postId,
      authorId: item.comment.authorId,
      parentId: item.comment.parentId,
      replyToCommentId: item.comment.replyToCommentId,
      replyToProfileId: item.comment.replyToProfileId,
      type: item.comment.type as CommentType,
      payload: item.comment.payload as Record<string, unknown>,
      content: item.comment.content,
      repliesCount: item.comment.repliesCount,
      deletedAt: item.comment.deletedAt,
      createdAt: item.comment.createdAt,
      updatedAt: item.comment.updatedAt,
      editedAt: item.comment.editedAt,
      author,
    }
  })

  return {
    comments: mappedComments,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getPostCommentsByAdmin(postId: bigint): Promise<AdminCommentItem[]> {
  const rawComments = await db
    .select({
      comment: comments,
      author: {
        id: profiles.id,
        accountId: profiles.accountId,
        email: accounts.email,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        isMale: profiles.isMale,
        verifiedAt: profiles.verifiedAt,
      },
      identity: {
        identity: identities.identity,
      },
    })
    .from(comments)
    .leftJoin(profiles, eq(comments.authorId, profiles.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))

  return rawComments.map((item) => {
    const author: AdminPostAuthor | null =
      item.author && item.author.id && item.author.accountId && item.author.email
        ? {
            id: item.author.id,
            accountId: item.author.accountId,
            email: item.author.email,
            name: item.author.name,
            identity: item.identity?.identity ?? null,
            avatarKey: item.author.avatarKey,
            isMale: item.author.isMale,
            isVerified: Boolean(item.author.verifiedAt),
          }
        : null

    return {
      id: item.comment.id,
      postId: item.comment.postId,
      authorId: item.comment.authorId,
      parentId: item.comment.parentId,
      replyToCommentId: item.comment.replyToCommentId,
      replyToProfileId: item.comment.replyToProfileId,
      type: item.comment.type as CommentType,
      payload: item.comment.payload as Record<string, unknown>,
      content: item.comment.content,
      repliesCount: item.comment.repliesCount,
      deletedAt: item.comment.deletedAt,
      createdAt: item.comment.createdAt,
      updatedAt: item.comment.updatedAt,
      editedAt: item.comment.editedAt,
      author,
    }
  })
}

export async function deleteCommentByAdmin(commentId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.deletedAt !== null) {
      throw new HTTPException(400, { message: 'Comment is already deleted' })
    }

    await tx
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, commentId))

    await markEntityMediaDeleted(tx, {
      entityType: 'comment',
      entityId: commentId,
    })

    return {
      success: true,
      message: 'Comment deleted successfully by admin',
    }
  })
}

export async function restoreCommentByAdmin(commentId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.deletedAt === null) {
      throw new HTTPException(400, { message: 'Comment is not deleted' })
    }

    await tx
      .update(comments)
      .set({ deletedAt: null })
      .where(eq(comments.id, commentId))

    await tx
      .update(mediaUploads)
      .set({ status: 'attached' })
      .where(
        and(
          eq(mediaUploads.entityType, 'comment'),
          eq(mediaUploads.entityId, commentId),
          eq(mediaUploads.status, 'deleted')
        )
      )

    return {
      success: true,
      message: 'Comment restored successfully',
    }
  })
}

// ---------------------------------------------------------
// Reports & Target Enrichment
// ---------------------------------------------------------

async function fetchReportTarget(
  targetType: ReportTargetType,
  targetId: bigint
): Promise<AdminReportTarget | null> {
  if (targetType === 'post') {
    const [item] = await db
      .select({
        post: posts,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(posts.id, targetId))
      .limit(1)

    if (!item) return { type: 'post', post: null }

    return {
      type: 'post',
      post: {
        id: item.post.id,
        authorId: item.post.authorId,
        content: item.post.content,
        type: item.post.type as PostType,
        payload: item.post.payload as Record<string, unknown>,
        deletedAt: item.post.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    }
  }

  if (targetType === 'comment') {
    const [item] = await db
      .select({
        comment: comments,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(comments.id, targetId))
      .limit(1)

    if (!item) return { type: 'comment', comment: null }

    return {
      type: 'comment',
      comment: {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        content: item.comment.content,
        type: item.comment.type as CommentType,
        payload: item.comment.payload as Record<string, unknown>,
        deletedAt: item.comment.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    }
  }

  if (targetType === 'profile') {
    const [item] = await db
      .select({
        profile: profiles,
        identity: identities,
      })
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(profiles.id, targetId))
      .limit(1)

    if (!item) return { type: 'profile', profile: null }

    return {
      type: 'profile',
      profile: {
        id: item.profile.id,
        name: item.profile.name,
        identity: item.identity?.identity ?? null,
        avatarKey: item.profile.avatarKey,
        description: item.profile.description,
        isMale: item.profile.isMale,
      },
    }
  }

  return null
}

async function fetchReportTargetsBatch(
  reportsList: Array<{ targetType: ReportTargetType | string; targetId: bigint }>
): Promise<Map<string, AdminReportTarget>> {
  const targetMap = new Map<string, AdminReportTarget>()
  if (reportsList.length === 0) return targetMap

  const postIds: bigint[] = []
  const commentIds: bigint[] = []
  const profileIds: bigint[] = []

  for (const r of reportsList) {
    if (r.targetType === 'post') postIds.push(r.targetId)
    else if (r.targetType === 'comment') commentIds.push(r.targetId)
    else if (r.targetType === 'profile') profileIds.push(r.targetId)
  }

  const uniquePostIds = Array.from(new Set(postIds))
  const uniqueCommentIds = Array.from(new Set(commentIds))
  const uniqueProfileIds = Array.from(new Set(profileIds))

  const [postRows, commentRows, profileRows] = await Promise.all([
    uniquePostIds.length > 0
      ? db
          .select({
            post: posts,
            author: {
              id: profiles.id,
              name: profiles.name,
              avatarKey: profiles.avatarKey,
            },
            identity: {
              identity: identities.identity,
            },
          })
          .from(posts)
          .leftJoin(profiles, eq(posts.authorId, profiles.id))
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(posts.id, uniquePostIds))
      : Promise.resolve([]),
    uniqueCommentIds.length > 0
      ? db
          .select({
            comment: comments,
            author: {
              id: profiles.id,
              name: profiles.name,
              avatarKey: profiles.avatarKey,
            },
            identity: {
              identity: identities.identity,
            },
          })
          .from(comments)
          .leftJoin(profiles, eq(comments.authorId, profiles.id))
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(comments.id, uniqueCommentIds))
      : Promise.resolve([]),
    uniqueProfileIds.length > 0
      ? db
          .select({
            profile: profiles,
            identity: identities,
          })
          .from(profiles)
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(profiles.id, uniqueProfileIds))
      : Promise.resolve([]),
  ])

  for (const item of postRows) {
    targetMap.set(`post:${item.post.id}`, {
      type: 'post',
      post: {
        id: item.post.id,
        authorId: item.post.authorId,
        content: item.post.content,
        type: item.post.type as PostType,
        payload: item.post.payload as Record<string, unknown>,
        deletedAt: item.post.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    })
  }

  for (const item of commentRows) {
    targetMap.set(`comment:${item.comment.id}`, {
      type: 'comment',
      comment: {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        content: item.comment.content,
        type: item.comment.type as CommentType,
        payload: item.comment.payload as Record<string, unknown>,
        deletedAt: item.comment.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    })
  }

  for (const item of profileRows) {
    targetMap.set(`profile:${item.profile.id}`, {
      type: 'profile',
      profile: {
        id: item.profile.id,
        name: item.profile.name,
        identity: item.identity?.identity ?? null,
        avatarKey: item.profile.avatarKey,
        description: item.profile.description,
        isMale: item.profile.isMale,
      },
    })
  }

  return targetMap
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
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(reports.id, safeId),
          eq(reports.targetId, safeId),
          eq(reports.reporterProfileId, safeId),
          ilike(reports.details, searchPattern),
          ilike(reports.modNote, searchPattern),
          ilike(reporterAccounts.email, searchPattern),
          ilike(reportedAccounts.email, searchPattern),
          ilike(reporterProfiles.name, searchPattern),
          ilike(reportedProfiles.name, searchPattern),
          ilike(reporterIdentities.identity, searchPattern),
          ilike(reportedIdentities.identity, searchPattern)
        )
      : or(
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
        .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
        .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
        .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
        .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
        .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
        .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
        .leftJoin(resolverAdmins, eq(reports.resolvedById, resolverAdmins.id))
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
          id: reporterProfiles.id,
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
          id: reportedProfiles.id,
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
      .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
      .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
      .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
      .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
      .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
      .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
      .leftJoin(resolverAdmins, eq(reports.resolvedById, resolverAdmins.id))
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

  // Batch fetch targets using up to 3 queries instead of N+1 individual queries
  const targetMap = await fetchReportTargetsBatch(
    items.map((item) => ({
      targetType: item.report.targetType,
      targetId: item.report.targetId,
    }))
  )

  const mappedReports: AdminReportItem[] = items.map((item) => {
    const reporterInfo =
      item.reporter && item.reporter.id
        ? {
            id: item.reporter.id,
            email: item.reporter.email ?? '',
            name: item.reporterProfile?.name ?? null,
            identity: item.reporterIdentity?.identity ?? null,
            avatarKey: item.reporterProfile?.avatarKey ?? null,
          }
        : null

    const reportedUserInfo =
      item.reportedUser && item.reportedUser.id
        ? {
            id: item.reportedUser.id,
            email: item.reportedUser.email ?? '',
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

    let target: AdminReportTarget | null = null
    if (item.report.targetType === 'post') {
      target = targetMap.get(`post:${item.report.targetId}`) ?? { type: 'post', post: null }
    } else if (item.report.targetType === 'comment') {
      target = targetMap.get(`comment:${item.report.targetId}`) ?? { type: 'comment', comment: null }
    } else if (item.report.targetType === 'profile') {
      target = targetMap.get(`profile:${item.report.targetId}`) ?? { type: 'profile', profile: null }
    }

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
      target,
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
        id: reporterProfiles.id,
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
        id: reportedProfiles.id,
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
    .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
    .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
    .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
    .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
    .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
    .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
    .leftJoin(resolverAdmins, eq(reports.resolvedById, resolverAdmins.id))
    .where(eq(reports.id, reportId))

  if (!item) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  const target = await fetchReportTarget(
    item.report.targetType as ReportTargetType,
    item.report.targetId
  )

  const reporterInfo =
    item.reporter && item.reporter.id
      ? {
          id: item.reporter.id,
          email: item.reporter.email ?? '',
          name: item.reporterProfile?.name ?? null,
          identity: item.reporterIdentity?.identity ?? null,
          avatarKey: item.reporterProfile?.avatarKey ?? null,
        }
      : null

  const reportedUserInfo =
    item.reportedUser && item.reportedUser.id
      ? {
          id: item.reportedUser.id,
          email: item.reportedUser.email ?? '',
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
    target,
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
  const resolvedById = isResolving ? admin.id : null

  const [updated] = await db
    .update(reports)
    .set({
      status,
      modNote: modNote !== undefined ? (modNote && modNote.trim().length > 0 ? modNote.trim() : null) : existing.modNote,
      resolvedById,
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

export async function resolveReportWithAction(
  admin: { id: bigint; role: AdminRole },
  reportId: bigint,
  options: ResolveReportActionOptions
): Promise<AdminReportItem> {
  return await db.transaction(async (tx) => {
    const report = await tx.query.reports.findFirst({
      where: eq(reports.id, reportId),
    })

    if (!report) {
      throw new HTTPException(404, { message: 'Report not found' })
    }

    const { status, modNote, action, banReason } = options

    // Apply action
    if (action === 'delete_target') {
      if (report.targetType === 'post') {
        await tx
          .update(posts)
          .set({ deletedAt: new Date(), isPinned: false })
          .where(eq(posts.id, report.targetId))
        await markEntityMediaDeleted(tx, { entityType: 'post', entityId: report.targetId })
      } else if (report.targetType === 'comment') {
        await tx
          .update(comments)
          .set({ deletedAt: new Date() })
          .where(eq(comments.id, report.targetId))
        await markEntityMediaDeleted(tx, { entityType: 'comment', entityId: report.targetId })
      }
    } else if (action === 'ban_user') {
      const reportedProfile = await tx.query.profiles.findFirst({
        where: eq(profiles.id, report.reportedProfileId),
      })
      if (reportedProfile) {
        await banUserAccount(
          { id: admin.id },
          reportedProfile.accountId,
          {
            reason: banReason ?? report.reason,
          }
        )
      }
    } else if (action === 'remove_avatar') {
      const reportedProfile = await tx.query.profiles.findFirst({
        where: eq(profiles.id, report.reportedProfileId),
      })
      if (reportedProfile && reportedProfile.avatarKey) {
        const oldKey = reportedProfile.avatarKey
        await tx
          .update(profiles)
          .set({ avatarKey: null })
          .where(eq(profiles.id, reportedProfile.id))
        await reconcileEntityMedia(tx, {
          entityType: 'avatar',
          entityId: reportedProfile.id,
          profileId: reportedProfile.id,
          newFileKeys: [],
          oldFileKeys: [oldKey],
        })
      }
    }

    const isResolving = status !== 'pending'
    const resolvedAt = isResolving ? new Date() : null
    const resolvedById = isResolving ? admin.id : null

    await tx
      .update(reports)
      .set({
        status,
        modNote: modNote !== undefined ? (modNote && modNote.trim().length > 0 ? modNote.trim() : null) : report.modNote,
        resolvedById,
        resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))

    return getReportById(reportId)
  })
}
