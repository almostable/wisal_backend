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
  ilike,
  inArray,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db, type DbExecutor } from '../../../db'
import { accounts } from '../../../db/schema/accounts'
import { profiles, type Profile, type ProfileWithIdentity } from '../../../db/schema/profiles'
import { identities, type Identity } from '../../../db/schema/identities'
import { posts } from '../../../db/schema/posts'
import { comments } from '../../../db/schema/comments'
import { readers } from '../../../db/schema/readers'
import { profileBlocks } from '../../../db/schema/profile-blocks'
import { sessions } from '../../../db/schema/sessions'
import { invites } from '../../../db/schema/invites'
import { reports } from '../../../db/schema/reports'
import { mediaUploads } from '../../../db/schema/media-uploads'
import { userRestrictions } from '../../../db/schema/user-restrictions'
import { reconcileEntityMedia } from '../../uploads/service'
import { createNotification } from '../../notifications/service'
import { NOTIFICATION_CODES } from '../../../config/error-codes'
import { formatProfileResponse } from '../../../lib/profile'
import { generateRandomUserIdentity } from '../../../lib/identity'
import { parseSafeBigInt } from './utils'
import type {
  AdminUpdateUserProfileInput,
  BanUserInput,
  UnbanUserInput,
} from '../schema'
import type {
  ListUsersOptions,
  ListUsersResult,
  UserListItem,
  AdminUserDetail,
} from '../types'

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
      if (input.links !== undefined) {
        updateData.links = input.links ?? null
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
          links: input.links ?? null,
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

export async function banUserAccount(
  admin: { id: bigint },
  accountId: bigint,
  input: BanUserInput,
  executor: DbExecutor = db
): Promise<{ success: boolean; message: string }> {
  const executeInTx = async (tx: DbExecutor) => {
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
  }

  if ('transaction' in executor && typeof (executor as any).transaction === 'function') {
    return await (executor as typeof db).transaction(executeInTx)
  }
  return await executeInTx(executor)
}

export async function unbanUserAccount(
  admin: { id: bigint },
  accountId: bigint,
  input: UnbanUserInput,
  executor: DbExecutor = db
): Promise<{ success: boolean; message: string }> {
  const executeInTx = async (tx: DbExecutor) => {
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

    // Restore identity if profile exists and identity was cleared during ban
    const profile = await tx.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
    })

    if (profile && !profile.identityId) {
      let createdIdentity: Identity | undefined
      let newIdentityHandle: string | undefined
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateRandomUserIdentity()
        const existingIdentity = await tx.query.identities.findFirst({
          where: eq(sql`lower(${identities.identity})`, candidate),
        })
        if (!existingIdentity) {
          newIdentityHandle = candidate
          const [created] = await tx
            .insert(identities)
            .values({ identity: candidate })
            .returning()
          createdIdentity = created
          break
        }
      }

      if (createdIdentity && newIdentityHandle) {
        await tx
          .update(profiles)
          .set({
            identityId: createdIdentity.id,
            identity: newIdentityHandle,
          })
          .where(eq(profiles.id, profile.id))
      }
    }

    return {
      success: true,
      message: 'User unbanned successfully',
    }
  }

  if ('transaction' in executor && typeof (executor as any).transaction === 'function') {
    return await (executor as typeof db).transaction(executeInTx)
  }
  return await executeInTx(executor)
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
