import {
  eq,
  ne,
  and,
  or,
  count,
  desc,
  asc,
  isNull,
  isNotNull,
  gt,
  gte,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db, type DbExecutor } from '../../db'
import { MAX_PG_BIGINT } from '../../db/schema/common'
import { invites } from '../../db/schema/invites'
import { accounts } from '../../db/schema/accounts'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { readers } from '../../db/schema/readers'
import { posts } from '../../db/schema/posts'
import { profileBlocks } from '../../db/schema/profile-blocks'
import { deleteNotificationsBetweenProfiles } from '../notifications/service'
import {
  getProfileByAccountId,
  getProfileByIdentity,
  completeOnboarding,
  updateProfile,
  checkIdentityAvailable,
  isOnboardingCompleted,
  formatProfileResponse,
  formatRestrictedProfileResponse,
  type SafeProfile,
} from '../../lib/profile'
import type {
  OnboardingInput,
  UpdateProfileInput,
} from '../../db/schema/profiles'
import type {
  ListMyInvitesQuery,
  ListReadersQuery,
  ListAuthorsQuery,
  ListBlocksQuery,
  ProfileFeedQuery,
  ProfileSearchQuery,
} from './schema'
import type {
  PublicProfile,
  MyProfileResult,
  CheckIdentityResult,
  MyInviteItem,
  MyInviteUsedBy,
  ListMyInvitesResult,
  ReaderProfileItem,
  ListReadersResult,
  AuthorSubscriptionItem,
  ListAuthorsResult,
  SubscribedAuthorItem,
  ListTargetAuthorsResult,
  MarkAuthorReadResult,
  ReadActionResult,
  BlockedProfileItem,
  ListBlocksResult,
  BlockActionResult,
  ProfileFeedResult,
  ProfileFeedItem,
  ProfileFeedType,
  ProfileSearchItem,
  ProfileSearchResult,
} from './types'

export async function getMyProfile(accountId: bigint): Promise<MyProfileResult> {
  const profile = await getProfileByAccountId(accountId)

  if (!profile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  return {
    profile: formatProfileResponse(profile, { includeReadersCount: true, isSelf: true })!,
    isOnboardingCompleted: isOnboardingCompleted(profile),
  }
}

export async function completeUserOnboarding(
  accountId: bigint,
  input: OnboardingInput
): Promise<SafeProfile> {
  const profile = await completeOnboarding(accountId, input)
  return formatProfileResponse(profile, { isSelf: true })!
}

export async function updateUserProfile(
  accountId: bigint,
  input: UpdateProfileInput
): Promise<SafeProfile> {
  const profile = await updateProfile(accountId, input)
  return formatProfileResponse(profile, { isSelf: true })!
}

export async function getPublicProfile(
  identityHandle: string,
  viewerAccountId?: bigint | null
): Promise<PublicProfile> {
  const targetProfile = await getProfileByIdentity(identityHandle)

  if (!targetProfile || !targetProfile.identity) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const viewerProfile = viewerAccountId ? await getProfileByAccountId(viewerAccountId) : null

  if (!viewerProfile) {
    return {
      name: targetProfile.name,
      identity: targetProfile.identity.identity,
      avatarKey: targetProfile.isMale === true ? targetProfile.avatarKey : null,
      description: targetProfile.description,
      isVerified: Boolean(targetProfile.verifiedAt),
    }
  }

  let isReading = false

  if (viewerProfile.id !== targetProfile.id) {
    const [[blockRecord], [readerRecord]] = await Promise.all([
      db
        .select({
          isBlocked: sql<boolean>`CASE WHEN ${profileBlocks.blockerProfileId} = ${viewerProfile.id} AND ${profileBlocks.blockedProfileId} = ${targetProfile.id} THEN true ELSE false END`,
          isHidden: sql<boolean>`CASE WHEN ${profileBlocks.blockerProfileId} = ${targetProfile.id} AND ${profileBlocks.blockedProfileId} = ${viewerProfile.id} THEN true ELSE false END`,
        })
        .from(profileBlocks)
        .where(
          or(
            and(
              eq(profileBlocks.blockerProfileId, viewerProfile.id),
              eq(profileBlocks.blockedProfileId, targetProfile.id)
            ),
            and(
              eq(profileBlocks.blockerProfileId, targetProfile.id),
              eq(profileBlocks.blockedProfileId, viewerProfile.id)
            )
          )
        )
        .limit(1),
      db
        .select({ authorProfileId: readers.authorProfileId })
        .from(readers)
        .where(
          and(
            eq(readers.readerProfileId, viewerProfile.id),
            eq(readers.authorProfileId, targetProfile.id)
          )
        )
        .limit(1),
    ])

    if (blockRecord) {
      return formatRestrictedProfileResponse(targetProfile, {
        isBlocked: Boolean(blockRecord.isBlocked),
        isHidden: Boolean(blockRecord.isHidden),
        isReading: false,
      })!
    }

    isReading = Boolean(readerRecord)
  }

  return formatProfileResponse(targetProfile, {
    isReading,
    includeReadersCount: viewerProfile.id === targetProfile.id,
    isSelf: viewerProfile.id === targetProfile.id,
    viewerGender: viewerProfile.isMale,
  })!
}

export async function checkHandleAvailability(
  identity: string,
  accountId?: bigint
): Promise<CheckIdentityResult> {
  let isVerified = false
  if (accountId !== undefined) {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
    })
    isVerified = Boolean(profile?.verifiedAt)
  }

  const result = await checkIdentityAvailable(identity, isVerified)

  return {
    available: result.available,
    identity: identity.trim().toLowerCase(),
    reason: result.reason,
  }
}

export async function getMyInvites(
  accountId: bigint,
  options: ListMyInvitesQuery = { status: 'all', limit: 50, offset: 0 },
  executor: DbExecutor = db
): Promise<ListMyInvitesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'

  const conditions: SQL[] = [eq(invites.inviterId, accountId)]

  if (status === 'active') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(gt(invites.expiresAt, sql`now()`))
  } else if (status === 'used') {
    conditions.push(isNotNull(invites.usedAt))
  } else if (status === 'expired') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(lte(invites.expiresAt, sql`now()`))
  }

  const whereClause = and(...conditions)

  const [items, totalResult, statsResult] = await Promise.all([
    executor
      .select({
        invite: invites,
        usedByAccount: {
          id: accounts.id,
        },
        usedByProfile: {
          name: profiles.name,
          avatarKey: profiles.avatarKey,
        },
        usedByIdentity: {
          identity: identities.identity,
        },
      })
      .from(invites)
      .leftJoin(accounts, eq(invites.usedById, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(desc(invites.createdAt))
      .limit(limit)
      .offset(offset),
    executor
      .select({ count: count() })
      .from(invites)
      .where(whereClause),
    executor
      .select({
        active: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} > now())::int`,
        used: sql<number>`count(*) filter (where ${invites.usedAt} is not null)::int`,
        expired: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} <= now())::int`,
      })
      .from(invites)
      .where(eq(invites.inviterId, accountId)),
  ])

  const mappedInvites: MyInviteItem[] = items.map((item) => {
    const usedByInfo: MyInviteUsedBy | null =
      item.usedByAccount && item.usedByAccount.id
        ? {
            id: item.usedByAccount.id,
            name: item.usedByProfile?.name ?? null,
            avatarKey: item.usedByProfile?.avatarKey ?? null,
            identity: item.usedByIdentity?.identity ?? null,
          }
        : null

    return {
      id: item.invite.id,
      code: item.invite.code,
      expiresAt: item.invite.expiresAt,
      usedBy: usedByInfo,
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

export async function getProfileIdByIdentity(identityHandle: string): Promise<bigint | null> {
  const normalized = identityHandle.trim().toLowerCase()
  const [result] = await db
    .select({ profileId: profiles.id })
    .from(identities)
    .innerJoin(profiles, eq(identities.id, profiles.identityId))
    .innerJoin(accounts, eq(profiles.accountId, accounts.id))
    .where(
      and(
        eq(sql`lower(${identities.identity})`, normalized),
        isNull(accounts.bannedAt),
        isNull(accounts.deletedAt)
      )
    )
    .limit(1)

  return result?.profileId ?? null
}

export async function getReaders(
  targetProfileId: bigint,
  options: ListReadersQuery = { limit: 50, offset: 0 }
): Promise<ListReadersResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const whereClause = eq(readers.authorProfileId, targetProfileId)

  const [items, totalResult] = await Promise.all([
    db
      .select({
        profileId: profiles.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        description: profiles.description,
        identity: identities.identity,
        readAt: readers.createdAt,
        lastReadAt: readers.lastReadAt,
      })
      .from(readers)
      .innerJoin(profiles, eq(readers.readerProfileId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(desc(readers.lastReadAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(readers)
      .where(whereClause),
  ])

  return {
    profiles: items.map((item) => ({
      id: item.profileId,
      name: item.name,
      avatarKey: item.avatarKey,
      description: item.description,
      identity: item.identity,
      readAt: item.readAt,
      lastReadAt: item.lastReadAt,
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function checkBlockExists(
  profileIdA: bigint,
  profileIdB: bigint
): Promise<boolean> {
  const [record] = await db
    .select({ blockerProfileId: profileBlocks.blockerProfileId })
    .from(profileBlocks)
    .where(
      or(
        and(
          eq(profileBlocks.blockerProfileId, profileIdA),
          eq(profileBlocks.blockedProfileId, profileIdB)
        ),
        and(
          eq(profileBlocks.blockerProfileId, profileIdB),
          eq(profileBlocks.blockedProfileId, profileIdA)
        )
      )
    )
    .limit(1)

  return Boolean(record)
}

export async function getUserReadersByIdentity(
  identityHandle: string,
  options: ListReadersQuery = { limit: 50, offset: 0 },
  viewerProfileId?: bigint
): Promise<ListReadersResult> {
  const targetProfileId = await getProfileIdByIdentity(identityHandle)
  if (!targetProfileId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (viewerProfileId && viewerProfileId !== targetProfileId) {
    const isBlocked = await checkBlockExists(viewerProfileId, targetProfileId)
    if (isBlocked) {
      return {
        profiles: [],
        total: 0,
        limit: Math.min(Math.max(options.limit ?? 50, 1), 100),
        offset: Math.max(options.offset ?? 0, 0),
      }
    }
  }

  return getReaders(targetProfileId, options)
}

export async function getUserSubscribedAuthorsByIdentity(
  identityHandle: string,
  options: ListAuthorsQuery = { limit: 50, offset: 0 },
  viewerProfileId?: bigint
): Promise<ListTargetAuthorsResult> {
  const targetProfileId = await getProfileIdByIdentity(identityHandle)
  if (!targetProfileId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  if (viewerProfileId && viewerProfileId !== targetProfileId) {
    const isBlocked = await checkBlockExists(viewerProfileId, targetProfileId)
    if (isBlocked) {
      return {
        authors: [],
        total: 0,
        limit,
        offset,
      }
    }
  }

  const whereClause = and(
    eq(readers.readerProfileId, targetProfileId),
    isNull(accounts.deletedAt)
  )

  const [items, totalResult] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        description: profiles.description,
        identity: identities.identity,
        isVerified: sql<boolean>`${profiles.verifiedAt} is not null`,
        readAt: readers.createdAt,
      })
      .from(readers)
      .innerJoin(profiles, eq(readers.authorProfileId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereClause)
      .orderBy(desc(readers.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(readers)
      .innerJoin(profiles, eq(readers.authorProfileId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereClause),
  ])

  return {
    authors: items.map((item) => ({
      id: item.id,
      name: item.name,
      avatarKey: item.avatarKey,
      description: item.description,
      identity: item.identity,
      isVerified: Boolean(item.isVerified),
      readAt: item.readAt,
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getSubscribedAuthors(
  viewer: { profileId: bigint; isMale?: boolean | null },
  options: ListAuthorsQuery = { limit: 50, offset: 0 }
): Promise<ListAuthorsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const genderCondition =
    typeof viewer.isMale === 'boolean'
      ? sql`(${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))`
      : sql`${posts.genderScope} = 'all'`

  const unreadSubquery = sql<boolean>`EXISTS (
    SELECT 1
    FROM ${posts}
    WHERE ${posts.authorId} = ${readers.authorProfileId}
      AND ${posts.deletedAt} IS NULL
      AND ${posts.id} > COALESCE(${readers.lastReadPostId}, 0)
      AND ${genderCondition}
    LIMIT 1
  )`

  const whereClause = and(
    eq(readers.readerProfileId, viewer.profileId),
    isNull(accounts.deletedAt),
    isNull(accounts.bannedAt)
  )

  const [items, totalResult] = await Promise.all([
    db
      .select({
        id: profiles.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        isVerified: sql<boolean>`${profiles.verifiedAt} is not null`,
        hasUnread: unreadSubquery.as('has_unread'),
      })
      .from(readers)
      .innerJoin(profiles, eq(readers.authorProfileId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereClause)
      .orderBy(
        sql`CASE WHEN ${unreadSubquery} THEN 1 ELSE 0 END DESC`,
        desc(readers.createdAt)
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(readers)
      .innerJoin(profiles, eq(readers.authorProfileId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereClause),
  ])

  return {
    authors: items.map((item) => ({
      id: item.id,
      name: item.name,
      avatarKey: item.avatarKey,
      identity: item.identity,
      isVerified: Boolean(item.isVerified),
      hasUnread: Boolean(item.hasUnread),
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function resolveProfileId(identifier: string): Promise<bigint | null> {
  const trimmed = identifier.trim()
  if (/^\d{1,19}$/.test(trimmed)) {
    try {
      const b = BigInt(trimmed)
      if (b > 0n && b <= MAX_PG_BIGINT) {
        const [byProfileId] = await db
          .select({ id: profiles.id })
          .from(profiles)
          .innerJoin(accounts, eq(profiles.accountId, accounts.id))
          .where(
            and(
              eq(profiles.id, b),
              isNull(accounts.bannedAt),
              isNull(accounts.deletedAt)
            )
          )
          .limit(1)
        if (byProfileId) {
          return byProfileId.id
        }
      }
    } catch {
      // Fall through to identity lookup on parse error
    }
  }
  return await getProfileIdByIdentity(trimmed)
}

async function resolveTargetProfile(
  actorProfileId: bigint,
  targetIdentifier: string,
  selfErrorMessage: string
): Promise<bigint> {
  const targetProfileId = await resolveProfileId(targetIdentifier)
  if (!targetProfileId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (actorProfileId === targetProfileId) {
    throw new HTTPException(400, { message: selfErrorMessage })
  }

  return targetProfileId
}

export async function markAuthorPostsRead(
  viewerProfileId: bigint,
  authorIdentifier: string,
  lastPostId: bigint
): Promise<MarkAuthorReadResult> {
  const authorProfileId = await resolveTargetProfile(
    viewerProfileId,
    authorIdentifier,
    'Profiles cannot mark own posts as read'
  )

  const [updated] = await db
    .update(readers)
    .set({
      lastReadPostId: sql`GREATEST(COALESCE(${readers.lastReadPostId}, 0), ${lastPostId})`,
      lastReadAt: sql`NOW()`,
    })
    .where(
      and(
        eq(readers.readerProfileId, viewerProfileId),
        eq(readers.authorProfileId, authorProfileId)
      )
    )
    .returning({
      lastReadPostId: readers.lastReadPostId,
      lastReadAt: readers.lastReadAt,
    })

  if (!updated) {
    throw new HTTPException(404, { message: 'Subscription not found' })
  }

  return {
    lastReadPostId: updated.lastReadPostId!,
    lastReadAt: updated.lastReadAt!,
    message: 'Author posts marked as read',
  }
}

export async function readProfile(
  readerProfileId: bigint,
  targetIdentity: string
): Promise<ReadActionResult> {
  const targetProfileId = await resolveTargetProfile(
    readerProfileId,
    targetIdentity,
    'Profiles cannot read themselves'
  )

  const isBlocked = await checkBlockExists(readerProfileId, targetProfileId)
  if (isBlocked) {
    throw new HTTPException(400, { message: 'Cannot read a blocked profile' })
  }

  return await db.transaction(async (tx) => {
    const [latestPost] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.authorId, targetProfileId), isNull(posts.deletedAt)))
      .orderBy(desc(posts.id))
      .limit(1)

    const inserted = await tx
      .insert(readers)
      .values({
        readerProfileId,
        authorProfileId: targetProfileId,
        lastReadAt: new Date(),
        lastReadPostId: latestPost?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ readerProfileId: readers.readerProfileId })

    if (inserted.length > 0) {
      await tx
        .update(profiles)
        .set({
          readersCount: sql`${profiles.readersCount} + 1`,
        })
        .where(eq(profiles.id, targetProfileId))
    }

    return {
      reading: true,
      message: 'Successfully reading profile',
    }
  })
}

export async function unreadProfile(
  readerProfileId: bigint,
  targetIdentity: string
): Promise<ReadActionResult> {
  const targetProfileId = await resolveTargetProfile(
    readerProfileId,
    targetIdentity,
    'Profiles cannot unread themselves'
  )

  return await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(readers)
      .where(
        and(
          eq(readers.readerProfileId, readerProfileId),
          eq(readers.authorProfileId, targetProfileId)
        )
      )
      .returning({
        readerProfileId: readers.readerProfileId,
        lastReadAt: readers.lastReadAt,
      })

    if (deleted.length > 0) {
      await tx
        .update(profiles)
        .set({
          readersCount: sql`GREATEST(0, ${profiles.readersCount} - 1)`,
        })
        .where(eq(profiles.id, targetProfileId))
    }

    return {
      reading: false,
      message: 'Successfully stopped reading profile',
    }
  })
}

export async function blockProfile(
  blockerProfileId: bigint,
  targetIdentity: string
): Promise<BlockActionResult> {
  const targetProfileId = await resolveTargetProfile(
    blockerProfileId,
    targetIdentity,
    'Profiles cannot block themselves'
  )

  return await db.transaction(async (tx) => {
    await tx
      .insert(profileBlocks)
      .values({
        blockerProfileId,
        blockedProfileId: targetProfileId,
      })
      .onConflictDoNothing()

    const deletedReaders = await tx
      .delete(readers)
      .where(
        or(
          and(
            eq(readers.readerProfileId, blockerProfileId),
            eq(readers.authorProfileId, targetProfileId)
          ),
          and(
            eq(readers.readerProfileId, targetProfileId),
            eq(readers.authorProfileId, blockerProfileId)
          )
        )
      )
      .returning({
        readerProfileId: readers.readerProfileId,
        authorProfileId: readers.authorProfileId,
        lastReadAt: readers.lastReadAt,
      })

    for (const rel of deletedReaders) {
      await tx
        .update(profiles)
        .set({
          readersCount: sql`GREATEST(0, ${profiles.readersCount} - 1)`,
        })
        .where(eq(profiles.id, rel.authorProfileId))
    }

    await deleteNotificationsBetweenProfiles(blockerProfileId, targetProfileId, tx)

    return {
      blocked: true,
      message: 'Successfully blocked profile',
    }
  })
}

export async function unblockProfile(
  blockerProfileId: bigint,
  targetIdentity: string
): Promise<BlockActionResult> {
  const targetProfileId = await resolveTargetProfile(
    blockerProfileId,
    targetIdentity,
    'Profiles cannot unblock themselves'
  )

  await db
    .delete(profileBlocks)
    .where(
      and(
        eq(profileBlocks.blockerProfileId, blockerProfileId),
        eq(profileBlocks.blockedProfileId, targetProfileId)
      )
    )

  return {
    blocked: false,
    message: 'Successfully unblocked profile',
  }
}

export async function getBlockedProfiles(
  blockerProfileId: bigint,
  options: ListBlocksQuery = { limit: 50, offset: 0 }
): Promise<ListBlocksResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const whereClause = eq(profileBlocks.blockerProfileId, blockerProfileId)

  const [items, totalResult] = await Promise.all([
    db
      .select({
        profileId: profiles.id,
        name: profiles.name,
        identity: identities.identity,
        isMale: profiles.isMale,
        blockedAt: profileBlocks.createdAt,
      })
      .from(profileBlocks)
      .innerJoin(profiles, eq(profileBlocks.blockedProfileId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(desc(profileBlocks.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(profileBlocks)
      .where(whereClause),
  ])

  return {
    profiles: items.map((item) => ({
      id: item.profileId,
      name: item.name,
      identity: item.identity,
      isMale: item.isMale,
      blockedAt: item.blockedAt,
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export function generateFeedSeed(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export async function getProfileFeed(
  viewerProfileId: bigint,
  query: ProfileFeedQuery
): Promise<ProfileFeedResult> {
  const type: ProfileFeedType = query.type ?? 'recommended'
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)
  const activeSeed = type === 'random' ? (query.seed || generateFeedSeed()) : undefined

  const notBlockedCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${profileBlocks}
    WHERE (${profileBlocks.blockerProfileId} = ${viewerProfileId} AND ${profileBlocks.blockedProfileId} = ${profiles.id})
       OR (${profileBlocks.blockerProfileId} = ${profiles.id} AND ${profileBlocks.blockedProfileId} = ${viewerProfileId})
  )`

  const baseConditions = [
    ne(profiles.id, viewerProfileId),
    isNotNull(profiles.name),
    sql`trim(${profiles.name}) != ''`,
    isNotNull(profiles.isMale),
    isNotNull(profiles.identityId),
    isNotNull(profiles.description),
    sql`trim(${profiles.description}) != ''`,
    isNull(accounts.bannedAt),
    isNull(accounts.deletedAt),
    notBlockedCondition,
  ]

  if (type === 'recommended') {
    baseConditions.push(isNotNull(profiles.verifiedAt))
  }

  const whereCondition = and(...baseConditions)!

  let items: Array<{
    name: string | null
    isMale: boolean | null
    avatarKey: string | null
    identity: string | null
    description: string | null
    readersCount: number
    verifiedAt: Date | null
  }> = []

  if (type === 'recommended') {
    const orderByClause = [desc(profiles.readersCount), desc(profiles.id)]
    items = await db
      .select({
        name: profiles.name,
        isMale: profiles.isMale,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        description: profiles.description,
        readersCount: profiles.readersCount,
        verifiedAt: profiles.verifiedAt,
      })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereCondition)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset)
  } else {
    // Variant A: Deterministic cursor shift on Snowflake ID index with wrap-around
    const [totalRow] = await db
      .select({ count: count() })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereCondition)

    const totalCount = Number(totalRow?.count ?? 0)

    if (totalCount > 0 && offset < totalCount) {
      let seedNum = 0
      for (let i = 0; i < (activeSeed ?? '').length; i++) {
        seedNum = ((seedNum << 5) - seedNum + (activeSeed ?? '').charCodeAt(i)) | 0
      }
      const remaining = totalCount - offset
      const actualLimit = Math.min(limit, remaining)
      const baseShift = Math.abs(seedNum) % totalCount
      const effectiveOffset = (baseShift + offset) % totalCount

      if (effectiveOffset + actualLimit <= totalCount) {
        items = await db
          .select({
            name: profiles.name,
            isMale: profiles.isMale,
            avatarKey: profiles.avatarKey,
            identity: identities.identity,
            description: profiles.description,
            readersCount: profiles.readersCount,
            verifiedAt: profiles.verifiedAt,
          })
          .from(profiles)
          .innerJoin(identities, eq(profiles.identityId, identities.id))
          .innerJoin(accounts, eq(profiles.accountId, accounts.id))
          .where(whereCondition)
          .orderBy(asc(profiles.id))
          .limit(actualLimit)
          .offset(effectiveOffset)
      } else {
        const firstLimit = totalCount - effectiveOffset
        const secondLimit = actualLimit - firstLimit

        const [firstBatch, secondBatch] = await Promise.all([
          db
            .select({
              name: profiles.name,
              isMale: profiles.isMale,
              avatarKey: profiles.avatarKey,
              identity: identities.identity,
              description: profiles.description,
              readersCount: profiles.readersCount,
              verifiedAt: profiles.verifiedAt,
            })
            .from(profiles)
            .innerJoin(identities, eq(profiles.identityId, identities.id))
            .innerJoin(accounts, eq(profiles.accountId, accounts.id))
            .where(whereCondition)
            .orderBy(asc(profiles.id))
            .limit(firstLimit)
            .offset(effectiveOffset),
          db
            .select({
              name: profiles.name,
              isMale: profiles.isMale,
              avatarKey: profiles.avatarKey,
              identity: identities.identity,
              description: profiles.description,
              readersCount: profiles.readersCount,
              verifiedAt: profiles.verifiedAt,
            })
            .from(profiles)
            .innerJoin(identities, eq(profiles.identityId, identities.id))
            .innerJoin(accounts, eq(profiles.accountId, accounts.id))
            .where(whereCondition)
            .orderBy(asc(profiles.id))
            .limit(secondLimit)
            .offset(0),
        ])

        items = [...firstBatch, ...secondBatch]
      }
    }
  }

  const formattedProfiles: ProfileFeedItem[] = items.map((item) => ({
    name: item.name!,
    isMale: item.isMale!,
    avatarKey: item.avatarKey,
    identity: item.identity!,
    description: item.description!,
    readersCount: item.readersCount,
    isVerified: Boolean(item.verifiedAt),
  }))

  return {
    profiles: formattedProfiles,
    type,
    ...(type === 'random' ? { seed: activeSeed } : {}),
    limit,
    offset,
  }
}

export async function searchProfiles(
  viewerProfileId: bigint,
  query: ProfileSearchQuery
): Promise<ProfileSearchResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)
  const cleanQuery = (query.q ?? '').replace(/^@+/, '').trim().toLowerCase()

  if (!cleanQuery) {
    return {
      profiles: [],
      total: 0,
      limit,
      offset,
    }
  }

  const escapedQuery = cleanQuery.replace(/[%_\\]/g, '\\$&')
  const prefixPattern = `${escapedQuery}%`
  const wordPrefixPattern = `% ${escapedQuery}%`
  const subPattern = `%${escapedQuery}%`

  const notBlockedCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${profileBlocks}
    WHERE ${profileBlocks.blockerProfileId} = ${viewerProfileId}
      AND ${profileBlocks.blockedProfileId} = ${profiles.id}
  )`

  // Primary filtering: GIN-indexed searchText (contains identity, name, and description)
  const primarySearchFilter = sql`${profiles.searchText} LIKE ${subPattern} ESCAPE '\\'`

  const whereCondition = and(
    ne(profiles.id, viewerProfileId),
    isNotNull(profiles.name),
    sql`trim(${profiles.name}) != ''`,
    isNotNull(profiles.isMale),
    isNotNull(profiles.identityId),
    isNull(accounts.bannedAt),
    isNull(accounts.deletedAt),
    primarySearchFilter,
    notBlockedCondition
  )!

  // 5-level compressed relevance ranking
  const relevanceRank = sql<number>`
    CASE
      WHEN lower(${identities.identity}) = ${cleanQuery} THEN 1
      WHEN lower(${identities.identity}) LIKE ${prefixPattern} ESCAPE '\\' THEN 2
      WHEN lower(${profiles.name}) LIKE ${prefixPattern} ESCAPE '\\' OR lower(${profiles.name}) LIKE ${wordPrefixPattern} ESCAPE '\\' THEN 3
      WHEN lower(${identities.identity}) LIKE ${subPattern} ESCAPE '\\' OR lower(${profiles.name}) LIKE ${subPattern} ESCAPE '\\' THEN 4
      ELSE 5
    END
  `

  const orderByClause = [
    asc(relevanceRank),
    sql`CASE WHEN ${profiles.verifiedAt} IS NOT NULL THEN 1 ELSE 0 END DESC`,
    desc(profiles.readersCount),
    desc(profiles.id),
  ]

  const [items, totalResult] = await Promise.all([
    db
      .select({
        name: profiles.name,
        isMale: profiles.isMale,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        description: profiles.description,
        readersCount: profiles.readersCount,
        verifiedAt: profiles.verifiedAt,
      })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereCondition)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(whereCondition),
  ])

  const formattedProfiles: ProfileSearchItem[] = items.map((item) => ({
    name: item.name!,
    isMale: item.isMale!,
    avatarKey: item.avatarKey,
    identity: item.identity!,
    description: item.description,
    readersCount: item.readersCount,
    isVerified: Boolean(item.verifiedAt),
  }))

  return {
    profiles: formattedProfiles,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}
