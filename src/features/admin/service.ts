import { randomBytes } from 'node:crypto'
import { eq, sql, desc, count } from 'drizzle-orm'
import { db } from '../../db'
import { admins, safeAdminSchema } from '../../db/schema/admins'
import { invites, type Invite } from '../../db/schema/invites'
import { accounts, safeAccountSchema } from '../../db/schema/accounts'
import { type ProfileWithIdentity } from '../../db/schema/profiles'
import { verifyPassword } from '../../lib/password'
import {
  createAdminSession,
  invalidateAdminSession,
  invalidateAdminSessionByToken,
} from '../../lib/admin-session'
import type {
  AdminLoginInput,
  AdminLoginResult,
  CreateInviteInput,
  ListInvitesOptions,
  ListInvitesResult,
  ListUsersOptions,
  ListUsersResult,
  UserListItem,
} from './types'

export class AdminServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = 'BAD_REQUEST'
  ) {
    super(message)
    this.name = 'AdminServiceError'
  }
}

/**
 * Generates a human-friendly, high-entropy unique invite code (e.g. WISAL-A1B2-C3D4)
 */
export function generateRandomInviteCode(): string {
  const bytes = randomBytes(6).toString('hex').toUpperCase()
  return `WISAL-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`
}

/**
 * Authenticates an admin by email and password, returning an active session and token
 */
export async function loginAdmin(input: AdminLoginInput): Promise<AdminLoginResult> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const admin = await db.query.admins.findFirst({
    where: eq(sql`lower(${admins.email})`, normalizedEmail),
  })

  if (!admin) {
    throw new AdminServiceError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const isPasswordValid = await verifyPassword(admin.password, input.password)

  if (!isPasswordValid) {
    throw new AdminServiceError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const safeAdmin = safeAdminSchema.parse(admin)
  const { session, token } = await createAdminSession(admin.id)

  return {
    admin: safeAdmin,
    session,
    token,
  }
}

/**
 * Logs out an admin by invalidating their session
 */
export async function logoutAdmin(sessionId: bigint): Promise<void> {
  await invalidateAdminSession(sessionId)
}

/**
 * Logs out an admin by their raw token
 */
export async function logoutAdminByToken(token: string): Promise<void> {
  await invalidateAdminSessionByToken(token)
}

/**
 * Creates a new invite code associated with the creating admin
 */
export async function createInvite(
  adminId: bigint,
  input: CreateInviteInput
): Promise<Invite> {
  let inviteCode = input.code?.trim().toUpperCase()

  if (!inviteCode) {
    inviteCode = generateRandomInviteCode()
  } else if (inviteCode.length < 8) {
    throw new AdminServiceError('Invite code must be at least 8 characters long', 400, 'INVALID_CODE_LENGTH')
  }

  if (!input.expiresAt || !(input.expiresAt instanceof Date) || isNaN(input.expiresAt.getTime())) {
    throw new AdminServiceError('A valid expiration date (expiresAt) is required', 400, 'EXPIRES_AT_REQUIRED')
  }

  // Check if code is already taken
  const existing = await db.query.invites.findFirst({
    where: eq(invites.code, inviteCode),
  })

  if (existing) {
    throw new AdminServiceError(`Invite code '${inviteCode}' already exists`, 409, 'INVITE_CODE_EXISTS')
  }

  const [newInvite] = await db
    .insert(invites)
    .values({
      code: inviteCode,
      createdById: adminId,
      expiresAt: input.expiresAt,
    })
    .returning()

  if (!newInvite) {
    throw new AdminServiceError('Failed to create invite record', 500, 'CREATION_FAILED')
  }

  return newInvite
}

/**
 * Retrieves a paginated list of invites along with creator and consuming account information
 */
export async function listInvites(options: ListInvitesOptions = {}): Promise<ListInvitesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [items, totalResult] = await Promise.all([
    db.query.invites.findMany({
      limit,
      offset,
      orderBy: [desc(invites.createdAt)],
      with: {
        creator: {
          columns: {
            id: true,
            email: true,
            role: true,
          },
        },
        usedBy: {
          columns: {
            id: true,
            email: true,
          },
        },
      },
    }),
    db.select({ count: count() }).from(invites),
  ])

  return {
    invites: items,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

/**
 * Retrieves a paginated list of all user accounts with their profiles and identities
 */
export async function listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const [accountRecords, totalResult] = await Promise.all([
    db.query.accounts.findMany({
      limit,
      offset,
      orderBy: [desc(accounts.createdAt)],
      with: {
        profile: {
          with: {
            identity: true,
          },
        },
      },
    }),
    db.select({ count: count() }).from(accounts),
  ])

  const users: UserListItem[] = accountRecords.map(({ password, ...acc }) => ({
    ...safeAccountSchema.parse(acc),
    profile: (acc.profile as ProfileWithIdentity) ?? null,
  }))

  return {
    users,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}
