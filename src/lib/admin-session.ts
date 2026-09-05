import { eq, and, gt, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { adminSessions, type AdminSession } from '../db/schema/admin-sessions'
import { admins, safeAdminSchema, type SafeAdmin } from '../db/schema/admins'
import { generateToken, hashToken, calculateExpiryDate } from './token'
import { ADMIN_SESSION_TTL_DAYS, ADMIN_COOKIE_NAME } from '../config/constants'

export { ADMIN_SESSION_TTL_DAYS, ADMIN_COOKIE_NAME }

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
      admin: {
        id: admins.id,
        email: admins.email,
        role: admins.role,
        createdAt: admins.createdAt,
        updatedAt: admins.updatedAt,
      },
    })
    .from(adminSessions)
    .innerJoin(admins, eq(adminSessions.adminId, admins.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        gt(adminSessions.expiresAt, sql`now()`)
      )
    )
    .limit(1)

  if (!result || !result.admin) {
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

export async function cleanupExpiredAdminSessions(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<number> {
  const deleted = await executor
    .delete(adminSessions)
    .where(lte(adminSessions.expiresAt, sql`now()`))
    .returning({ id: adminSessions.id })

  return deleted.length
}
