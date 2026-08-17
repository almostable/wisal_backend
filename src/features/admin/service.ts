import { randomBytes } from 'node:crypto'
import { eq, sql, desc, count } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { admins, safeAdminSchema, type SafeAdmin, type AdminRole } from '../../db/schema/admins'
import { adminSessions } from '../../db/schema/admin-sessions'
import { invites } from '../../db/schema/invites'
import { accounts, safeAccountSchema } from '../../db/schema/accounts'
import { profiles, type ProfileWithIdentity } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { hashPassword, verifyPassword } from '../../lib/password'
import {
  createAdminSession,
  invalidateAdminSession,
  invalidateAdminSessionByToken,
} from '../../lib/admin-session'
import type {
  AdminLoginInput,
  AdminLoginResult,
  CreateAdminInput,
  ListAdminsOptions,
  ListAdminsResult,
  CreateInviteInput,
  InviteItem,
  ListInvitesOptions,
  ListInvitesResult,
  ListUsersOptions,
  ListUsersResult,
  UserListItem,
} from './types'

export function generateRandomInviteCode(): string {
  const bytes = randomBytes(6).toString('hex').toUpperCase()
  return `WISAL-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`
}

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

  const [adminRecords, totalResult] = await Promise.all([
    db.query.admins.findMany({
      limit,
      offset,
      orderBy: [desc(admins.createdAt)],
    }),
    db.select({ count: count() }).from(admins),
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

  const existing = await db.query.admins.findFirst({
    where: eq(admins.id, targetAdminId),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Admin not found' })
  }

  await db.delete(adminSessions).where(eq(adminSessions.adminId, targetAdminId))
  await db.delete(admins).where(eq(admins.id, targetAdminId))
}

export async function createInvite(
  adminId: bigint,
  input: CreateInviteInput
): Promise<InviteItem> {
  let inviteCode = input.code?.trim().toUpperCase()

  if (!inviteCode) {
    inviteCode = generateRandomInviteCode()
  } else if (inviteCode.length < 8) {
    throw new HTTPException(400, { message: 'Invite code must be at least 8 characters long' })
  }

  if (!input.expiresAt || !(input.expiresAt instanceof Date) || isNaN(input.expiresAt.getTime())) {
    throw new HTTPException(400, { message: 'A valid expiration date (expiresAt) is required' })
  }

  const existing = await db.query.invites.findFirst({
    where: eq(invites.code, inviteCode),
  })

  if (existing) {
    throw new HTTPException(409, { message: `Invite code '${inviteCode}' already exists` })
  }

  const creatorAdmin = await db.query.admins.findFirst({
    where: eq(admins.id, adminId),
  })

  const [newInvite] = await db
    .insert(invites)
    .values({
      code: inviteCode,
      createdById: adminId,
      expiresAt: input.expiresAt,
    })
    .returning()

  if (!newInvite) {
    throw new HTTPException(500, { message: 'Failed to create invite record' })
  }

  const creatorInfo = {
    id: adminId,
    email: creatorAdmin?.email ?? '',
    role: (creatorAdmin?.role ?? 'admin') as AdminRole,
  }

  return {
    id: newInvite.id,
    code: newInvite.code,
    expiresAt: newInvite.expiresAt,
    createdBy: creatorInfo,
    created_by: creatorInfo,
    usedById: newInvite.usedById,
    usedBy: null,
    usedAt: newInvite.usedAt,
    createdAt: newInvite.createdAt,
    updatedAt: newInvite.updatedAt,
  }
}

export async function deleteInvite(inviteId: bigint): Promise<void> {
  const existing = await db.query.invites.findFirst({
    where: eq(invites.id, inviteId),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Invite not found' })
  }

  await db.delete(invites).where(eq(invites.id, inviteId))
}

export async function listInvites(options: ListInvitesOptions = {}): Promise<ListInvitesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [items, totalResult] = await Promise.all([
    db
      .select({
        invite: invites,
        creator: {
          id: admins.id,
          email: admins.email,
          role: admins.role,
        },
        usedBy: {
          id: accounts.id,
          email: accounts.email,
        },
      })
      .from(invites)
      .leftJoin(admins, eq(invites.createdById, admins.id))
      .leftJoin(accounts, eq(invites.usedById, accounts.id))
      .orderBy(desc(invites.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(invites),
  ])

  const mappedInvites: InviteItem[] = items.map((item) => {
    const creatorInfo =
      item.creator && item.creator.id
        ? { id: item.creator.id, email: item.creator.email, role: item.creator.role as AdminRole }
        : { id: item.invite.createdById, email: '', role: 'admin' as AdminRole }

    return {
      id: item.invite.id,
      code: item.invite.code,
      expiresAt: item.invite.expiresAt,
      createdBy: creatorInfo,
      created_by: creatorInfo,
      usedById: item.invite.usedById,
      usedBy: item.usedBy && item.usedBy.id ? { id: item.usedBy.id, email: item.usedBy.email } : null,
      usedAt: item.invite.usedAt,
      createdAt: item.invite.createdAt,
      updatedAt: item.invite.updatedAt,
    }
  })

  return {
    invites: mappedInvites,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [accountRecords, totalResult] = await Promise.all([
    db
      .select({
        account: accounts,
        profile: profiles,
        identity: identities,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .orderBy(desc(accounts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(accounts),
  ])

  const users: UserListItem[] = accountRecords.map(({ account, profile, identity }) => {
    const { password, ...safeAcc } = account
    const fullProfile: ProfileWithIdentity | null =
      profile && profile.id
        ? {
            ...profile,
            identity: identity && identity.id ? identity : null,
          }
        : null

    return {
      ...safeAccountSchema.parse(safeAcc),
      profile: fullProfile,
    }
  })

  return {
    users,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}
