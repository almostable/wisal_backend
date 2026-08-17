import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions, type AdminSession } from '../db/schema/admin-sessions'
import { admins, safeAdminSchema, type SafeAdmin } from '../db/schema/admins'

export const ADMIN_SESSION_TTL_DAYS = 30
export const ADMIN_COOKIE_NAME = 'admin_session'

export function generateAdminSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashAdminSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface AdminSessionValidationResult {
  session: AdminSession
  admin: SafeAdmin
}

export async function createAdminSession(
  adminId: bigint,
  ttlDays = ADMIN_SESSION_TTL_DAYS
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

export async function validateAdminSessionToken(
  token: string
): Promise<AdminSessionValidationResult | null> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return null
  }

  try {
    const tokenHash = hashAdminSessionToken(token.trim())

    const [result] = await db
      .select({
        session: adminSessions,
        admin: admins,
      })
      .from(adminSessions)
      .innerJoin(admins, eq(adminSessions.adminId, admins.id))
      .where(eq(adminSessions.tokenHash, tokenHash))
      .limit(1)

    if (!result || !result.admin) {
      return null
    }

    if (Date.now() >= result.session.expiresAt.getTime()) {
      db.delete(adminSessions).where(eq(adminSessions.id, result.session.id)).catch(() => {})
      return null
    }

    return {
      session: result.session,
      admin: safeAdminSchema.parse(result.admin),
    }
  } catch (error) {
    console.error('Error validating admin session token:', error)
    return null
  }
}

export async function invalidateAdminSession(sessionId: bigint): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, sessionId))
}

export async function invalidateAdminSessionByToken(token: string): Promise<void> {
  const tokenHash = hashAdminSessionToken(token.trim())
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash))
}

export async function invalidateAllAdminSessions(adminId: bigint): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId))
}
