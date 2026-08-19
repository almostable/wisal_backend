import { eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { accounts, safeAccountSchema, type Account } from '../../db/schema/accounts'
import { invites } from '../../db/schema/invites'
import { profiles } from '../../db/schema/profiles'
import { sessions } from '../../db/schema/sessions'
import { hashPassword, verifyPassword } from '../../lib/password'
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
import type { RegisterInput, LoginInput, AuthSessionResult, AuthMeResult } from './types'

export async function registerUser(input: RegisterInput): Promise<AuthSessionResult> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const normalizedInviteCode = input.inviteCode.trim().toUpperCase()

  const existingAccount = await db.query.accounts.findFirst({
    where: eq(sql`lower(${accounts.email})`, normalizedEmail),
  })

  if (existingAccount) {
    throw new HTTPException(409, { message: 'Account with this email already exists' })
  }

  const invite = await db.query.invites.findFirst({
    where: eq(invites.code, normalizedInviteCode),
  })

  if (!invite) {
    throw new HTTPException(400, { message: 'Invalid or expired invite code' })
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
        password: passwordHash,
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

    const initialUserInvites = Array.from({ length: 5 }, () => ({
      code: generateRandomInviteCode(),
      inviterId: createdAccount.id,
      createdById: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
      createdSession,
      sessionToken,
      profile: initialProfile ? { ...initialProfile, identity: null } : null,
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
    where: eq(sql`lower(${accounts.email})`, normalizedEmail),
  })

  if (!account) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const isPasswordValid = await verifyPassword(account.password, input.password)

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

export async function logoutAllSessions(accountId: bigint): Promise<void> {
  await invalidateAllAccountSessions(accountId)
}

export async function getAuthMe(accountId: bigint): Promise<AuthMeResult> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  })

  if (!account) {
    throw new HTTPException(404, { message: 'Account not found' })
  }

  const profile = await getProfileByAccountId(accountId)

  return {
    account: safeAccountSchema.parse(account),
    profile: formatProfileResponse(profile),
    isOnboardingCompleted: isOnboardingCompleted(profile),
  }
}
