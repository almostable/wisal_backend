import {
  eq,
  and,
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
import {
  getProfileByAccountId,
  getProfileByIdentity,
  completeOnboarding,
  updateProfile,
  checkIdentityAvailable,
  isOnboardingCompleted,
  formatProfileResponse,
  type SafeProfile,
} from '../../lib/profile'
import type {
  ProfileWithIdentity,
  OnboardingInput,
  UpdateProfileInput,
} from '../../db/schema/profiles'
import type { ListMyInvitesQuery, ListFollowsQuery } from './schema'
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

export async function getPublicProfile(identityHandle: string): Promise<PublicProfile> {
  const profile = await getProfileByIdentity(identityHandle)

  if (!profile || !profile.identity) {
    throw new HTTPException(404, { message: 'Profile not found' })
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

export async function getFollowers(
  targetAccountId: bigint,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

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
      .innerJoin(accounts, eq(follows.followerId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(follows.followingId, targetAccountId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, targetAccountId)),
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

export async function getFollowing(
  targetAccountId: bigint,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

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
      .innerJoin(accounts, eq(follows.followingId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(follows.followerId, targetAccountId))
      .orderBy(desc(follows.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, targetAccountId)),
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

export async function getUserFollowersByIdentity(
  identityHandle: string,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  const targetAccountId = await getAccountIdByIdentity(identityHandle)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }
  return getFollowers(targetAccountId, options)
}

export async function getUserFollowingByIdentity(
  identityHandle: string,
  options: ListFollowsQuery = { limit: 50, offset: 0 }
): Promise<ListFollowsResult> {
  const targetAccountId = await getAccountIdByIdentity(identityHandle)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }
  return getFollowing(targetAccountId, options)
}

export async function followUser(
  followerAccountId: bigint,
  targetIdentity: string
): Promise<FollowActionResult> {
  const targetAccountId = await getAccountIdByIdentity(targetIdentity)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (followerAccountId === targetAccountId) {
    throw new HTTPException(400, { message: 'Users cannot follow themselves' })
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
  const targetAccountId = await getAccountIdByIdentity(targetIdentity)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  if (followerAccountId === targetAccountId) {
    throw new HTTPException(400, { message: 'Users cannot unfollow themselves' })
  }

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

