import { eq } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions, type AdminSession } from '../db/schema/admin-sessions'
import { admins, safeAdminSchema, type SafeAdmin } from '../db/schema/admins'
import { generateToken, hashToken, calculateExpiryDate, isExpired } from './token'

export const ADMIN_SESSION_TTL_DAYS = 30
export const ADMIN_COOKIE_NAME = 'admin_session'

export const generateAdminSessionToken = () => generateToken(32)
export const hashAdminSessionToken = (token: string) => hashToken(token)

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
  const expiresAt = calculateExpiryDate(ttlDays)

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

  if (isExpired(result.session.expiresAt)) {
    db.delete(adminSessions).where(eq(adminSessions.id, result.session.id)).catch(() => {})
    return null
  }

  return {
    session: result.session,
    admin: safeAdminSchema.parse(result.admin),
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
