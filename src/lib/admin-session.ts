import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions, type AdminSession } from '../db/schema/admin-sessions'
import { safeAdminSchema, type SafeAdmin } from '../db/schema/admins'

/**
 * Default Admin Session TTL: 30 days
 */
export const ADMIN_SESSION_TTL_DAYS = 30

/**
 * Cookie name used for Admin Session
 */
export const ADMIN_COOKIE_NAME = 'admin_session'

/**
 * Generates a cryptographically secure 256-bit random session token (base64url encoded)
 */
export function generateAdminSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Computes SHA-256 hex digest of a raw session token for secure database storage
 * @param token Plaintext session token
 * @returns 64-character hex hash
 */
export function hashAdminSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface AdminSessionValidationResult {
  session: AdminSession
  admin: SafeAdmin
}

/**
 * Creates a new admin session for the given admin and stores its SHA-256 hash in the database
 * @param adminId Target admin Snowflake ID (bigint)
 * @param ttlDays Number of days the session remains valid (default: 30 days)
 * @returns Object containing the created admin session entity and the raw token to send to the client
 */
export async function createAdminSession(
  adminId: bigint,
  ttlDays: number = ADMIN_SESSION_TTL_DAYS
): Promise<{ session: AdminSession; token: string }> {
  const token = generateAdminSessionToken()
  const tokenHash = hashAdminSessionToken(token)
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)

  const [session] = await db
    .insert(adminSessions)
    .values({
      adminId,
      tokenHash,
      expiresAt,
    })
    .returning()

  if (!session) {
    throw new Error('Failed to create admin session in database')
  }

  return { session, token }
}

/**
 * Validates a raw admin session token against the database
 * @param token Plaintext session token provided by client
 * @returns Admin session & safe admin object if valid, null if invalid or expired
 */
export async function validateAdminSessionToken(
  token: string
): Promise<AdminSessionValidationResult | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null
  }

  try {
    const tokenHash = hashAdminSessionToken(token.trim())

    const result = await db.query.adminSessions.findFirst({
      where: eq(adminSessions.tokenHash, tokenHash),
      with: {
        admin: true,
      },
    })

    if (!result || !result.admin) {
      return null
    }

    // Check if session has expired
    if (Date.now() >= result.expiresAt.getTime()) {
      db.delete(adminSessions).where(eq(adminSessions.id, result.id)).catch(() => {})
      return null
    }

    const { admin, ...session } = result

    return {
      session: session as AdminSession,
      admin: safeAdminSchema.parse(admin),
    }
  } catch (error) {
    console.error('Error validating admin session token:', error)
    return null
  }
}

/**
 * Explicitly invalidates (deletes) a single admin session by its Snowflake ID
 * @param sessionId Admin session Snowflake ID (bigint)
 */
export async function invalidateAdminSession(sessionId: bigint): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, sessionId))
}

/**
 * Explicitly invalidates (deletes) a single admin session by its raw token
 * @param token Raw session token
 */
export async function invalidateAdminSessionByToken(token: string): Promise<void> {
  const tokenHash = hashAdminSessionToken(token.trim())
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash))
}

/**
 * Invalidates all active sessions for an admin (e.g. on password reset or security revocation)
 * @param adminId Target admin Snowflake ID (bigint)
 */
export async function invalidateAllAdminSessions(adminId: bigint): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId))
}
