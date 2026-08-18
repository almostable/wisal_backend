import { eq } from 'drizzle-orm'
import { db } from '../db'
import { sessions, type Session } from '../db/schema/sessions'
import { accounts, safeAccountSchema, type SafeAccount } from '../db/schema/accounts'
import { generateToken, hashToken } from './token'

export const SESSION_TTL_DAYS = 360

export const generateSessionToken = () => generateToken(32)
export const hashSessionToken = (token: string) => hashToken(token)

export interface SessionValidationResult {
  session: Session
  account: SafeAccount
}

export async function createSession(
  accountId: bigint,
  ttlDays = SESSION_TTL_DAYS
): Promise<{ session: Session; token: string }> {
  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)

  const [session] = await db
    .insert(sessions)
    .values({
      accountId,
      tokenHash,
      expiresAt,
    })
    .returning()

  if (!session) {
    throw new Error('Failed to create session in database')
  }

  return { session, token }
}

export async function validateSessionToken(
  token: string
): Promise<SessionValidationResult | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null
  }

  const tokenHash = hashSessionToken(token.trim())

  const [result] = await db
    .select({
      session: sessions,
      account: accounts,
    })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  if (!result || !result.account) {
    return null
  }

  if (Date.now() >= result.session.expiresAt.getTime()) {
    db.delete(sessions).where(eq(sessions.id, result.session.id)).catch(() => {})
    return null
  }

  return {
    session: result.session,
    account: safeAccountSchema.parse(result.account),
  }
}

export async function invalidateSession(sessionId: bigint): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function invalidateSessionByToken(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token.trim())
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

export async function invalidateAllAccountSessions(accountId: bigint): Promise<void> {
  await db.delete(sessions).where(eq(sessions.accountId, accountId))
}
