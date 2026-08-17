import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { sessions, type Session } from '../db/schema/sessions'
import { safeAccountSchema, type SafeAccount } from '../db/schema/accounts'

/**
 * Default Session TTL: 360 days
 */
export const SESSION_TTL_DAYS = 360

/**
 * Generates a cryptographically secure 256-bit random session token (base64url encoded)
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Computes SHA-256 hex digest of a raw session token for secure database storage
 * @param token Plaintext session token
 * @returns 64-character hex hash
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SessionValidationResult {
  session: Session
  account: SafeAccount
}

/**
 * Creates a new session for the given account and stores its SHA-256 hash in the database
 * @param accountId Target account Snowflake ID (bigint)
 * @param ttlDays Number of days the session remains valid (default: 360 days)
 * @returns Object containing the created session entity and the raw token to send to the client
 */
export async function createSession(
  accountId: bigint,
  ttlDays: number = SESSION_TTL_DAYS
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

/**
 * Validates a raw session token against the database
 * @param token Plaintext session token provided by client
 * @returns Session & safe account object if valid, null if invalid or expired
 */
export async function validateSessionToken(
  token: string
): Promise<SessionValidationResult | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null
  }

  try {
    const tokenHash = hashSessionToken(token.trim())

    const result = await db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
      with: {
        account: true,
      },
    })

    if (!result || !result.account) {
      return null
    }

    // Check if session has expired
    if (Date.now() >= result.expiresAt.getTime()) {
      db.delete(sessions).where(eq(sessions.id, result.id)).catch(() => {})
      return null
    }

    const { account, ...session } = result

    return {
      session: session as Session,
      account: safeAccountSchema.parse(account),
    }
  } catch (error) {
    console.error('Error validating session token:', error)
    return null
  }
}

/**
 * Explicitly invalidates (deletes) a single session by its Snowflake ID (e.g. for /logout)
 * @param sessionId Session Snowflake ID (bigint)
 */
export async function invalidateSession(sessionId: bigint): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

/**
 * Explicitly invalidates (deletes) a single session by its raw token
 * @param token Raw session token
 */
export async function invalidateSessionByToken(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token.trim())
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

/**
 * Invalidates all active sessions for an account (e.g. on password reset or "log out from all devices")
 * @param accountId Target account Snowflake ID (bigint)
 */
export async function invalidateAllAccountSessions(accountId: bigint): Promise<void> {
  await db.delete(sessions).where(eq(sessions.accountId, accountId))
}
