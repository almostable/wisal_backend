import {
  eq,
  sql,
  desc,
  count,
  and,
  or,
  ilike,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../../db'
import { admins, safeAdminSchema, type SafeAdmin, type AdminRole } from '../../../db/schema/admins'
import { hashPassword, verifyPassword } from '../../../lib/password'
import {
  createAdminSession,
  invalidateAdminSession,
  invalidateAdminSessionByToken,
} from '../../../lib/admin-session'
import { parseSafeBigInt } from './utils'
import type {
  AdminLoginInput,
  AdminLoginResult,
  CreateAdminInput,
  ListAdminsOptions,
  ListAdminsResult,
} from '../types'

export async function loginAdmin(input: AdminLoginInput): Promise<AdminLoginResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const admin = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.email})`, normalizedEmail),
  })

  if (!admin) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const isPasswordValid = await verifyPassword(admin.password, input.password)

  if (!isPasswordValid) {
    throw new HTTPException(401, { message: 'Invalid email or password' })
  }

  const safeAdmin = safeAdminSchema.parse(admin)
  const { session, token } = await createAdminSession(admin.id)

  return {
    admin: safeAdmin,
    session,
    token,
  }
}

export async function logoutAdmin(sessionId: bigint): Promise<void> {
  await invalidateAdminSession(sessionId)
}

export async function logoutAdminByToken(token: string): Promise<void> {
  await invalidateAdminSessionByToken(token)
}

export async function listAdmins(options: ListAdminsOptions = {}): Promise<ListAdminsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(eq(admins.id, safeId), ilike(admins.email, searchPattern))
      : ilike(admins.email, searchPattern)
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  if (options.role && options.role !== 'all') {
    conditions.push(eq(admins.role, options.role))
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [adminRecords, totalResult] = await Promise.all([
    db
      .select()
      .from(admins)
      .where(whereCondition)
      .orderBy(desc(admins.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(admins)
      .where(whereCondition),
  ])

  const safeAdmins: SafeAdmin[] = adminRecords.map((admin) => safeAdminSchema.parse(admin))

  return {
    admins: safeAdmins,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function createAdmin(input: CreateAdminInput): Promise<SafeAdmin> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const role: AdminRole = input.role ?? 'moderator'

  const existing = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.email})`, normalizedEmail),
  })

  if (existing) {
    throw new HTTPException(409, { message: `Admin with email '${normalizedEmail}' already exists` })
  }

  const passwordHash = await hashPassword(input.password)

  const [newAdmin] = await db
    .insert(admins)
    .values({
      email: normalizedEmail,
      password: passwordHash,
      role,
    })
    .returning()

  if (!newAdmin) {
    throw new HTTPException(500, { message: 'Failed to create admin record' })
  }

  return safeAdminSchema.parse(newAdmin)
}

export async function deleteAdmin(targetAdminId: bigint, currentAdminId?: bigint): Promise<void> {
  if (currentAdminId !== undefined && targetAdminId === currentAdminId) {
    throw new HTTPException(400, { message: 'Cannot delete your own admin account' })
  }

  const [deletedAdmin] = await db
    .delete(admins)
    .where(eq(admins.id, targetAdminId))
    .returning()

  if (!deletedAdmin) {
    throw new HTTPException(404, { message: 'Admin not found' })
  }
}
