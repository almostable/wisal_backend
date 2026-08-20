import {
  eq,
  and,
  or,
  count,
  desc,
  isNull,
  isNotNull,
  gt,
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
import { follows } from '../../db/schema/follows'
import { userBlocks } from '../../db/schema/user-blocks'
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
  ProfileWithIdentity,
  OnboardingInput,
  UpdateProfileInput,
} from '../../db/schema/profiles'
import type { ListMyInvitesQuery, ListFollowsQuery, ListBlocksQuery } from './schema'
import type {
  PublicProfile,
  MyProfileResult,
  CheckIdentityResult,
  MyInviteItem,
  MyInviteUsedBy,
  ListMyInvitesResult,
  FollowUserItem,
  ListFollowsResult,
  FollowActionResult,
  BlockedUserItem,
  ListBlocksResult,
  BlockActionResult,
} from './types'

export async function getMyProfile(accountId: bigint): Promise<MyProfileResult> {
  const profile = await getProfileByAccountId(accountId)

  if (!profile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  return {
    profile: formatProfileResponse(profile)!,
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
  const profile = await getProfileByIdentity(identityHandle)

  if (!profile || !profile.identity) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (viewerAccountId !== profile.accountId) {
    const [blockRecord] = await db
      .select({
        isBlocked: sql<boolean>`CASE WHEN ${userBlocks.blockerId} = ${viewerAccountId} AND ${userBlocks.blockedId} = ${profile.accountId} THEN true ELSE false END`,
        isHidden: sql<boolean>`CASE WHEN ${userBlocks.blockerId} = ${profile.accountId} AND ${userBlocks.blockedId} = ${viewerAccountId} THEN true ELSE false END`,
      })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewerAccountId),
            eq(userBlocks.blockedId, profile.accountId)
          ),
          and(
            eq(userBlocks.blockerId, profile.accountId),
            eq(userBlocks.blockedId, viewerAccountId)
          )
        )
      )
      .limit(1)

    if (blockRecord) {
      return formatRestrictedProfileResponse(profile, {
        isBlocked: Boolean(blockRecord.isBlocked),
        isHidden: Boolean(blockRecord.isHidden),
      })!
    }
  }

  return formatProfileResponse(profile)!
}

export async function checkHandleAvailability(identity: string): Promise<CheckIdentityResult> {
  const result = await checkIdentityAvailable(identity)

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

export async function getAccountIdByIdentity(identityHandle: string): Promise<bigint | null> {
  const normalized = identityHandle.trim().toLowerCase()
  const [result] = await db
    .select({ accountId: profiles.accountId })
    .from(identities)
    .innerJoin(profiles, eq(identities.id, profiles.identityId))
    .where(eq(sql`lower(${identities.identity})`, normalized))
    .limit(1)

  return result?.accountId ?? null
}

async function fetchFollowList(
  type: 'followers' | 'following',
  targetAccountId: bigint,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const targetCol = type === 'followers' ? follows.followingId : follows.followerId
  const joinCol = type === 'followers' ? follows.followerId : follows.followingId

  const [items, totalResult] = await Promise.all([
    db
      .select({
        accountId: accounts.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        description: profiles.description,
        identity: identities.identity,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(accounts, eq(joinCol, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(targetCol, targetAccountId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(follows)
      .where(eq(targetCol, targetAccountId)),
  ])

  return {
    users: items.map((item) => ({
      id: item.accountId,
      name: item.name,
      avatarKey: item.avatarKey,
      description: item.description,
      identity: item.identity,
      followedAt: item.followedAt,
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getFollowers(
  targetAccountId: bigint,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  return fetchFollowList('followers', targetAccountId, options)
}

export async function getFollowing(
  targetAccountId: bigint,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  return fetchFollowList('following', targetAccountId, options)
}

export async function checkBlockExists(
  accountIdA: bigint,
  accountIdB: bigint
): Promise<boolean> {
  const [record] = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(
          eq(userBlocks.blockerId, accountIdA),
          eq(userBlocks.blockedId, accountIdB)
        ),
        and(
          eq(userBlocks.blockerId, accountIdB),
          eq(userBlocks.blockedId, accountIdA)
        )
      )
    )
    .limit(1)

  return Boolean(record)
}

async function getUserFollowListByIdentity(
  type: 'followers' | 'following',
  identityHandle: string,
  options: ListFollowsQuery = { limit: 50, offset: 0 },
  viewerAccountId: bigint
): Promise<ListFollowsResult> {
  const targetAccountId = await getAccountIdByIdentity(identityHandle)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (viewerAccountId !== targetAccountId) {
    const isBlocked = await checkBlockExists(viewerAccountId, targetAccountId)
    if (isBlocked) {
      return {
        users: [],
        total: 0,
        limit: Math.min(Math.max(options.limit ?? 50, 1), 100),
        offset: Math.max(options.offset ?? 0, 0),
      }
    }
  }

  return fetchFollowList(type, targetAccountId, options)
}

export async function getUserFollowersByIdentity(
  identityHandle: string,
  options: ListFollowsQuery = { limit: 50, offset: 0 },
  viewerAccountId: bigint
): Promise<ListFollowsResult> {
  return getUserFollowListByIdentity('followers', identityHandle, options, viewerAccountId)
}

export async function getUserFollowingByIdentity(
  identityHandle: string,
  options: ListFollowsQuery = { limit: 50, offset: 0 },
  viewerAccountId: bigint
): Promise<ListFollowsResult> {
  return getUserFollowListByIdentity('following', identityHandle, options, viewerAccountId)
}

async function resolveTargetAccount(
  actorAccountId: bigint,
  targetIdentity: string,
  selfErrorMessage: string
): Promise<bigint> {
  const targetAccountId = await getAccountIdByIdentity(targetIdentity)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (actorAccountId === targetAccountId) {
    throw new HTTPException(400, { message: selfErrorMessage })
  }

  return targetAccountId
}

export async function followUser(
  followerAccountId: bigint,
  targetIdentity: string
): Promise<FollowActionResult> {
  const targetAccountId = await resolveTargetAccount(
    followerAccountId,
    targetIdentity,
    'Users cannot follow themselves'
  )

  const isBlocked = await checkBlockExists(followerAccountId, targetAccountId)
  if (isBlocked) {
    throw new HTTPException(400, { message: 'Cannot follow a blocked user' })
  }

  await db
    .insert(follows)
    .values({
      followerId: followerAccountId,
      followingId: targetAccountId,
    })
    .onConflictDoNothing()

  return {
    following: true,
    message: 'Successfully followed user',
  }
}

export async function unfollowUser(
  followerAccountId: bigint,
  targetIdentity: string
): Promise<FollowActionResult> {
  const targetAccountId = await resolveTargetAccount(
    followerAccountId,
    targetIdentity,
    'Users cannot unfollow themselves'
  )

  await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerAccountId),
        eq(follows.followingId, targetAccountId)
      )
    )

  return {
    following: false,
    message: 'Successfully unfollowed user',
  }
}

export async function blockUser(
  blockerAccountId: bigint,
  targetIdentity: string
): Promise<BlockActionResult> {
  const targetAccountId = await resolveTargetAccount(
    blockerAccountId,
    targetIdentity,
    'Users cannot block themselves'
  )

  return await db.transaction(async (tx) => {
    await tx
      .insert(userBlocks)
      .values({
        blockerId: blockerAccountId,
        blockedId: targetAccountId,
      })
      .onConflictDoNothing()

    await tx
      .delete(follows)
      .where(
        or(
          and(
            eq(follows.followerId, blockerAccountId),
            eq(follows.followingId, targetAccountId)
          ),
          and(
            eq(follows.followerId, targetAccountId),
            eq(follows.followingId, blockerAccountId)
          )
        )
      )

    return {
      blocked: true,
      message: 'Successfully blocked user',
    }
  })
}

export async function unblockUser(
  blockerAccountId: bigint,
  targetIdentity: string
): Promise<BlockActionResult> {
  const targetAccountId = await resolveTargetAccount(
    blockerAccountId,
    targetIdentity,
    'Users cannot unblock themselves'
  )

  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerId, blockerAccountId),
        eq(userBlocks.blockedId, targetAccountId)
      )
    )

  return {
    blocked: false,
    message: 'Successfully unblocked user',
  }
}

export async function getBlockedUsers(
  accountId: bigint,
  options: ListBlocksQuery = { limit: 50, offset: 0 }
): Promise<ListBlocksResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const whereClause = eq(userBlocks.blockerId, accountId)

  const [items, totalResult] = await Promise.all([
    db
      .select({
        accountId: accounts.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        isMale: profiles.isMale,
        blockedAt: userBlocks.createdAt,
      })
      .from(userBlocks)
      .innerJoin(accounts, eq(userBlocks.blockedId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(desc(userBlocks.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(userBlocks)
      .where(whereClause),
  ])

  return {
    users: items.map((item) => ({
      id: item.accountId,
      name: item.name,
      avatarKey: item.avatarKey,
      identity: item.identity,
      isMale: item.isMale,
      blockedAt: item.blockedAt,
    })),
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

