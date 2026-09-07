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
import { db } from '../../db'
import { invites } from '../../db/schema/invites'
import { accounts } from '../../db/schema/accounts'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { readers } from '../../db/schema/readers'
import { profileBlocks } from '../../db/schema/profile-blocks'
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
    profile: formatProfileResponse(profile, { includeReadersCount: true })!,
    isOnboardingCompleted: isOnboardingCompleted(profile),
  }
}

export async function completeUserOnboarding(
  accountId: bigint,
  input: OnboardingInput
): Promise<SafeProfile> {
  const profile = await completeOnboarding(accountId, input)
  return formatProfileResponse(profile)!
}

export async function updateUserProfile(
  accountId: bigint,
  input: UpdateProfileInput
): Promise<SafeProfile> {
  const profile = await updateProfile(accountId, input)
  return formatProfileResponse(profile)!
}

export async function getPublicProfile(
  identityHandle: string,
  viewerAccountId: bigint
): Promise<PublicProfile> {
  const targetProfile = await getProfileByIdentity(identityHandle)

  if (!targetProfile || !targetProfile.identity) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const viewerProfile = await getProfileByAccountId(viewerAccountId)
  let isReading = false

  if (viewerProfile && viewerProfile.id !== targetProfile.id) {
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
    includeReadersCount: viewerProfile?.id === targetProfile.id,
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
  options: ListMyInvitesQuery = { status: 'all', limit: 50, offset: 0 }
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
    db
      .select({
        invite: invites,
        usedByAccount: {
          id: accounts.id,
          email: accounts.email,
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
    db
      .select({ count: count() })
      .from(invites)
      .where(whereClause),
    db
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
            email: item.usedByAccount.email,
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
    .where(eq(sql`lower(${identities.identity})`, normalized))
    .limit(1)

  return result?.profileId ?? null
}

async function fetchReaderList(
  type: 'readers' | 'reading',
  targetProfileId: bigint,
  options: ListReadersQuery = { limit: 50, offset: 0 }
): Promise<ListReadersResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const joinCol = type === 'readers' ? readers.readerProfileId : readers.authorProfileId

  const whereClause =
    type === 'readers'
      ? and(
          eq(readers.authorProfileId, targetProfileId),
          gte(readers.lastReadAt, sql`NOW() - INTERVAL '30 days'`)
        )
      : eq(readers.readerProfileId, targetProfileId)

  const orderClause =
    type === 'readers'
      ? desc(readers.lastReadAt)
      : desc(readers.createdAt)

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
      .innerJoin(profiles, eq(joinCol, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(orderClause)
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

export async function getReaders(
  targetProfileId: bigint,
  options: ListReadersQuery = { limit: 50, offset: 0 }
): Promise<ListReadersResult> {
  return fetchReaderList('readers', targetProfileId, options)
}

export async function getReading(
  targetProfileId: bigint,
  options: ListReadersQuery = { limit: 50, offset: 0 }
): Promise<ListReadersResult> {
  return fetchReaderList('reading', targetProfileId, options)
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

async function getUserReaderListByIdentity(
  type: 'readers' | 'reading',
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

  return fetchReaderList(type, targetProfileId, options)
}

export async function getUserReadersByIdentity(
  identityHandle: string,
  options: ListReadersQuery = { limit: 50, offset: 0 },
  viewerProfileId?: bigint
): Promise<ListReadersResult> {
  return getUserReaderListByIdentity('readers', identityHandle, options, viewerProfileId)
}

export async function getUserReadingByIdentity(
  identityHandle: string,
  options: ListReadersQuery = { limit: 50, offset: 0 },
  viewerProfileId?: bigint
): Promise<ListReadersResult> {
  return getUserReaderListByIdentity('reading', identityHandle, options, viewerProfileId)
}

async function resolveTargetProfile(
  actorProfileId: bigint,
  targetIdentity: string,
  selfErrorMessage: string
): Promise<bigint> {
  const targetProfileId = await getProfileIdByIdentity(targetIdentity)
  if (!targetProfileId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (actorProfileId === targetProfileId) {
    throw new HTTPException(400, { message: selfErrorMessage })
  }

  return targetProfileId
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
    const inserted = await tx
      .insert(readers)
      .values({
        readerProfileId,
        authorProfileId: targetProfileId,
        lastReadAt: new Date(),
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
      .returning({ readerProfileId: readers.readerProfileId })

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
      })

    for (const rel of deletedReaders) {
      await tx
        .update(profiles)
        .set({
          readersCount: sql`GREATEST(0, ${profiles.readersCount} - 1)`,
        })
        .where(eq(profiles.id, rel.authorProfileId))
    }

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
    isNotNull(profiles.countryCode),
    sql`trim(${profiles.countryCode}) != ''`,
    isNotNull(profiles.shortDescription),
    sql`trim(${profiles.shortDescription}) != ''`,
    notBlockedCondition,
  ]

  if (type === 'recommended') {
    baseConditions.push(isNotNull(profiles.verifiedAt))
  }

  const whereCondition = and(...baseConditions)!

  const orderByClause =
    type === 'recommended'
      ? [desc(profiles.regularReadersCount), desc(profiles.id)]
      : [sql`hashtext(concat(${profiles.id}::text, ${activeSeed}::text))`, asc(profiles.id)]

  const items = await db
    .select({
      name: profiles.name,
      isMale: profiles.isMale,
      avatarKey: profiles.avatarKey,
      identity: identities.identity,
      shortDescription: profiles.shortDescription,
      regularReadersCount: profiles.regularReadersCount,
      countryCode: profiles.countryCode,
      cityId: profiles.cityId,
      verifiedAt: profiles.verifiedAt,
    })
    .from(profiles)
    .innerJoin(identities, eq(profiles.identityId, identities.id))
    .where(whereCondition)
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset)

  const formattedProfiles: ProfileFeedItem[] = items.map((item) => ({
    name: item.name!,
    isMale: item.isMale!,
    avatarKey: item.avatarKey,
    identity: item.identity,
    shortDescription: item.shortDescription!,
    regularReadersCount: item.regularReadersCount,
    countryCode: item.countryCode!,
    cityId: item.cityId,
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
    WHERE (${profileBlocks.blockerProfileId} = ${viewerProfileId} AND ${profileBlocks.blockedProfileId} = ${profiles.id})
       OR (${profileBlocks.blockerProfileId} = ${profiles.id} AND ${profileBlocks.blockedProfileId} = ${viewerProfileId})
  )`

  // Primary filtering: GIN-indexed searchText or identities.identity substring
  const primarySearchFilter = sql`(${profiles.searchText} LIKE ${subPattern} OR lower(${identities.identity}) LIKE ${subPattern})`

  const whereCondition = and(
    ne(profiles.id, viewerProfileId),
    isNotNull(profiles.name),
    sql`trim(${profiles.name}) != ''`,
    isNotNull(profiles.isMale),
    isNotNull(profiles.identityId),
    primarySearchFilter,
    notBlockedCondition
  )!

  // 5-level compressed relevance ranking
  const relevanceRank = sql<number>`
    CASE
      WHEN lower(${identities.identity}) = ${cleanQuery} THEN 1
      WHEN lower(${identities.identity}) LIKE ${prefixPattern} THEN 2
      WHEN lower(${profiles.name}) LIKE ${prefixPattern} OR lower(${profiles.name}) LIKE ${wordPrefixPattern} THEN 3
      WHEN lower(${identities.identity}) LIKE ${subPattern} OR lower(${profiles.name}) LIKE ${subPattern} THEN 4
      ELSE 5
    END
  `

  const orderByClause = [
    asc(relevanceRank),
    sql`CASE WHEN ${profiles.verifiedAt} IS NOT NULL THEN 1 ELSE 0 END DESC`,
    desc(profiles.regularReadersCount),
    desc(profiles.id),
  ]

  const [items, totalResult] = await Promise.all([
    db
      .select({
        name: profiles.name,
        isMale: profiles.isMale,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        shortDescription: profiles.shortDescription,
        regularReadersCount: profiles.regularReadersCount,
        countryCode: profiles.countryCode,
        cityId: profiles.cityId,
        verifiedAt: profiles.verifiedAt,
      })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(profiles)
      .innerJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
  ])

  const formattedProfiles: ProfileSearchItem[] = items.map((item) => ({
    name: item.name!,
    isMale: item.isMale!,
    avatarKey: item.avatarKey,
    identity: item.identity,
    shortDescription: item.shortDescription,
    regularReadersCount: item.regularReadersCount,
    countryCode: item.countryCode,
    cityId: item.cityId,
    isVerified: Boolean(item.verifiedAt),
  }))

  return {
    profiles: formattedProfiles,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}
