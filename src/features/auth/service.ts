import { eq, and, or, sql, isNull, inArray, gt } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { accounts, safeAccountSchema, type Account } from '../../db/schema/accounts'
import { invites } from '../../db/schema/invites'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { sessions } from '../../db/schema/sessions'
import { posts } from '../../db/schema/posts'
import { postSaves } from '../../db/schema/post-saves'
import { postLikes } from '../../db/schema/post-likes'
import { readers } from '../../db/schema/readers'
import { profileBlocks } from '../../db/schema/profile-blocks'
import { mediaUploads } from '../../db/schema/media-uploads'
import { markEntityMediaDeleted } from '../uploads/service'
import { createNotification } from '../notifications/service'
import { hashPassword, verifyPassword } from '../../lib/password'
import {
  INITIAL_USER_INVITES_COUNT,
  INITIAL_USER_INVITES_TTL_MS,
} from '../../config/constants'
import {
  createSession,
  generateSessionToken,
  hashSessionToken,
  invalidateSession,
  invalidateAllAccountSessions,
  SESSION_TTL_DAYS,
} from '../../lib/session'
import {
  getProfileByAccountId,
  isOnboardingCompleted,
  formatProfileResponse,
} from '../../lib/profile'
import { generateRandomInviteCode } from '../../lib/invite'
import type {
  RegisterInput,
  LoginInput,
  DeleteAccountInput,
  AuthSessionResult,
  AuthMeResult,
  DeleteAccountResult,
} from './types'

export async function registerUser(input: RegisterInput): Promise<AuthSessionResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const existingAccount = await db.query.accounts.findFirst({
    where: eq(sql`lower(${accounts.email})`, normalizedEmail),
  })

  if (existingAccount) {
    throw new HTTPException(409, { message: 'Email already in use' })
  }

  const normalizedCode = input.inviteCode.trim()

  const invite = await db.query.invites.findFirst({
    where: eq(invites.code, normalizedCode),
  })

  if (!invite) {
    throw new HTTPException(400, { message: 'Invalid invite code' })
  }

  if (invite.usedAt !== null || invite.usedById !== null) {
    throw new HTTPException(400, { message: 'Invite code has already been used' })
  }

  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new HTTPException(400, { message: 'Invite code has expired' })
  }

  const passwordHash = await hashPassword(input.password)

  const result = await db.transaction(async (tx) => {
    const [lockedInvite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, invite.id))
      .for('update')

    if (!lockedInvite || lockedInvite.usedAt !== null || lockedInvite.usedById !== null) {
      throw new HTTPException(400, { message: 'Invite code has already been used' })
    }

    if (lockedInvite.expiresAt.getTime() <= Date.now()) {
      throw new HTTPException(400, { message: 'Invite code has expired' })
    }

    const [createdAccount] = await tx
      .insert(accounts)
      .values({
        email: normalizedEmail,
        passwordHash,
      })
      .returning()

    if (!createdAccount) {
      throw new HTTPException(500, { message: 'Failed to create account record' })
    }

    await tx
      .update(invites)
      .set({
        usedById: createdAccount.id,
        usedAt: new Date(),
      })
      .where(eq(invites.id, invite.id))

    const initialUserInvites = Array.from({ length: INITIAL_USER_INVITES_COUNT }, () => ({
      code: generateRandomInviteCode(),
      inviterId: createdAccount.id,
      createdById: null,
      expiresAt: new Date(Date.now() + INITIAL_USER_INVITES_TTL_MS),
    }))

    await tx.insert(invites).values(initialUserInvites)

    const [initialProfile] = await tx
      .insert(profiles)
      .values({
        accountId: createdAccount.id,
      })
      .returning()

    const sessionToken = generateSessionToken()
    const tokenHash = hashSessionToken(sessionToken)
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

    if (lockedInvite.inviterId) {
      const inviterProfile = await tx.query.profiles.findFirst({
        where: eq(profiles.accountId, lockedInvite.inviterId),
      })
      if (inviterProfile) {
        await createNotification(
          {
            recipientProfileId: inviterProfile.id,
            actorProfileId: null,
            type: 'invite_used',
            targetType: 'invite',
            targetId: lockedInvite.id,
            payload: { inviteCode: lockedInvite.code },
          },
          tx
        )
      }
    }

    const [createdSession] = await tx
      .insert(sessions)
      .values({
        accountId: createdAccount.id,
        tokenHash,
        expiresAt,
      })
      .returning()

    if (!createdSession) {
      throw new HTTPException(500, { message: 'Failed to create session' })
    }

    return {
      createdAccount,
      sessionToken,
      profile: initialProfile,
    }
  })

  return {
    account: safeAccountSchema.parse(result.createdAccount),
    token: result.sessionToken,
    profile: formatProfileResponse(result.profile),
    isOnboardingCompleted: false,
  }
}

export async function loginUser(input: LoginInput): Promise<AuthSessionResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const account = await db.query.accounts.findFirst({
    where: and(eq(sql`lower(${accounts.email})`, normalizedEmail), isNull(accounts.deletedAt)),
  })

  if (!account) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  if (account.bannedAt !== null) {
    throw new HTTPException(403, { message: 'Your account has been suspended' })
  }

  const isPasswordValid = await verifyPassword(account.passwordHash, input.password)

  if (!isPasswordValid) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const safeAccount = safeAccountSchema.parse(account)
  const { token } = await createSession(account.id)
  const profile = await getProfileByAccountId(account.id)
  const completed = isOnboardingCompleted(profile)

  return {
    account: safeAccount,
    token,
    profile: formatProfileResponse(profile),
    isOnboardingCompleted: completed,
  }
}

export async function logoutUser(sessionId: bigint): Promise<void> {
  await invalidateSession(sessionId)
}

export async function logoutAllUserSessions(accountId: bigint): Promise<void> {
  await invalidateAllAccountSessions(accountId)
}

export async function getMe(accountId: bigint): Promise<AuthMeResult> {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), isNull(accounts.deletedAt)),
  })

  if (!account) {
    throw new HTTPException(404, { message: 'Account not found' })
  }

  const profile = await getProfileByAccountId(accountId)
  const completed = isOnboardingCompleted(profile)

  return {
    account: safeAccountSchema.parse(account),
    isOnboardingCompleted: completed,
  }
}

export async function deleteAccount(
  accountId: bigint,
  input: DeleteAccountInput,
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<DeleteAccountResult> {
  return await executor.transaction(async (tx) => {
    const account = await tx.query.accounts.findFirst({
      where: and(eq(accounts.id, accountId), isNull(accounts.deletedAt)),
    })

    if (!account) {
      throw new HTTPException(404, { message: 'Account not found' })
    }

    const isPasswordValid = await verifyPassword(account.passwordHash, input.password)
    if (!isPasswordValid) {
      throw new HTTPException(401, { message: 'Invalid password' })
    }

    await tx
      .update(accounts)
      .set({
        deletedAt: new Date(),
        email: `${accountId}@deleted.invalid`,
        passwordHash: '!ACCOUNT_DELETED!',
      })
      .where(eq(accounts.id, accountId))

    // Expire all unused active invites created by this account
    await tx
      .update(invites)
      .set({ expiresAt: new Date() })
      .where(
        and(
          eq(invites.inviterId, accountId),
          isNull(invites.usedAt),
          gt(invites.expiresAt, sql`now()`)
        )
      )

    const existingProfile = await tx.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
    })

    if (existingProfile) {
      await tx
        .update(profiles)
        .set({
          name: null,
          identity: null,
          identityId: null,
          isMale: null,
          avatarKey: null,
          description: null,
          links: null,
          verifiedAt: null,
          readersCount: 0,
        })
        .where(eq(profiles.id, existingProfile.id))

      if (existingProfile.identityId) {
        await tx
          .delete(identities)
          .where(eq(identities.id, existingProfile.identityId))
      }

      if (existingProfile.avatarKey) {
        await markEntityMediaDeleted(tx, {
          entityType: 'avatar',
          entityId: existingProfile.id,
        })
      }

      const userPosts = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.authorId, existingProfile.id), isNull(posts.deletedAt)))

      if (userPosts.length > 0) {
        const postIds = userPosts.map((p) => p.id)

        await tx
          .update(posts)
          .set({
            deletedAt: new Date(),
            isPinned: false,
          })
          .where(and(eq(posts.authorId, existingProfile.id), isNull(posts.deletedAt)))

        await tx
          .update(mediaUploads)
          .set({ status: 'deleted' })
          .where(
            and(
              eq(mediaUploads.entityType, 'post'),
              inArray(mediaUploads.entityId, postIds),
              eq(mediaUploads.status, 'attached')
            )
          )

        await tx.execute(sql`
          UPDATE media_uploads
          SET status = 'deleted'
          WHERE entity_type = 'comment'
            AND status = 'attached'
            AND entity_id IN (
              SELECT id FROM comments WHERE post_id IN (${sql.join(postIds, sql`, `)})
            )
        `)
      }

      const userSaves = await tx
        .delete(postSaves)
        .where(eq(postSaves.profileId, existingProfile.id))
        .returning({ postId: postSaves.postId })

      if (userSaves.length > 0) {
        const postIds = Array.from(new Set(userSaves.map((s) => s.postId)))
        await tx
          .update(posts)
          .set({
            savesCount: sql`GREATEST(0, ${posts.savesCount} - 1)`,
          })
          .where(inArray(posts.id, postIds))
      }

      const userLikes = await tx
        .delete(postLikes)
        .where(eq(postLikes.profileId, existingProfile.id))
        .returning({ postId: postLikes.postId })

      if (userLikes.length > 0) {
        const postIds = Array.from(new Set(userLikes.map((s) => s.postId)))
        await tx
          .update(posts)
          .set({
            likesCount: sql`GREATEST(0, ${posts.likesCount} - 1)`,
          })
          .where(inArray(posts.id, postIds))
      }

      const userReading = await tx
        .select({ authorProfileId: readers.authorProfileId })
        .from(readers)
        .where(eq(readers.readerProfileId, existingProfile.id))

      if (userReading.length > 0) {
        const authorProfileIds = Array.from(new Set(userReading.map((item) => item.authorProfileId)))
        await tx
          .update(profiles)
          .set({
            readersCount: sql`GREATEST(0, ${profiles.readersCount} - 1)`,
          })
          .where(inArray(profiles.id, authorProfileIds))
      }

      await tx
        .delete(readers)
        .where(or(eq(readers.readerProfileId, existingProfile.id), eq(readers.authorProfileId, existingProfile.id)))

      await tx
        .delete(profileBlocks)
        .where(or(eq(profileBlocks.blockerProfileId, existingProfile.id), eq(profileBlocks.blockedProfileId, existingProfile.id)))
    }

    await tx.delete(sessions).where(eq(sessions.accountId, accountId))

    return {
      success: true,
      message: 'Account deleted successfully',
    }
  })
}

