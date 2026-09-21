import {
  eq,
  sql,
  desc,
  count,
  and,
  or,
  isNull,
  isNotNull,
  gt,
  lte,
  ilike,
  aliasedTable,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../../db'
import { admins, type AdminRole } from '../../../db/schema/admins'
import { invites } from '../../../db/schema/invites'
import { accounts } from '../../../db/schema/accounts'
import { generateRandomInviteCode } from '../../../lib/invite'
import { parseSafeBigInt } from './utils'
import type {
  CreateInviteInput,
  InviteCreator,
  InviteItem,
  ListInvitesOptions,
  ListInvitesResult,
} from '../types'

export async function createInvite(
  creator: { id: bigint; email: string; role: AdminRole },
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

  const [newInvite] = await db
    .insert(invites)
    .values({
      code: inviteCode,
      createdById: creator.id,
      expiresAt: input.expiresAt,
    })
    .returning()

  if (!newInvite) {
    throw new HTTPException(500, { message: 'Failed to create invite record' })
  }

  const creatorInfo: InviteCreator = {
    id: creator.id,
    email: creator.email,
    role: creator.role,
  }

  return {
    id: newInvite.id,
    code: newInvite.code,
    expiresAt: newInvite.expiresAt,
    createdBy: creatorInfo,
    inviter: null,
    usedBy: null,
    usedAt: newInvite.usedAt,
    createdAt: newInvite.createdAt,
    updatedAt: newInvite.updatedAt,
  }
}

export async function deleteInvite(inviteId: bigint): Promise<void> {
  const [deleted] = await db
    .delete(invites)
    .where(eq(invites.id, inviteId))
    .returning()

  if (!deleted) {
    throw new HTTPException(404, { message: 'Invite not found' })
  }
}

export async function listInvites(options: ListInvitesOptions = {}): Promise<ListInvitesResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'
  const searchQuery = (options.q ?? options.search)?.trim()
  const inviterAccounts = aliasedTable(accounts, 'inviter_accounts')

  const conditions: SQL[] = []

  if (status === 'active') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(gt(invites.expiresAt, sql`now()`))
  } else if (status === 'used') {
    conditions.push(isNotNull(invites.usedAt))
  } else if (status === 'expired') {
    conditions.push(isNull(invites.usedAt))
    conditions.push(lte(invites.expiresAt, sql`now()`))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(invites.id, safeId),
          eq(invites.createdById, safeId),
          eq(invites.usedById, safeId),
          eq(invites.inviterId, safeId),
          ilike(invites.code, searchPattern),
          ilike(admins.email, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(inviterAccounts.email, searchPattern)
        )
      : or(
          ilike(invites.code, searchPattern),
          ilike(admins.email, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(inviterAccounts.email, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const totalCountQuery = searchQuery
    ? db
        .select({ count: count() })
        .from(invites)
        .leftJoin(admins, eq(invites.createdById, admins.id))
        .leftJoin(inviterAccounts, eq(invites.inviterId, inviterAccounts.id))
        .leftJoin(accounts, eq(invites.usedById, accounts.id))
        .where(whereClause)
    : db
        .select({ count: count() })
        .from(invites)
        .where(whereClause)

  const [items, totalResult, statsResult] = await Promise.all([
    db
      .select({
        invite: invites,
        creator: {
          id: admins.id,
          email: admins.email,
          role: admins.role,
        },
        inviter: {
          id: inviterAccounts.id,
          email: inviterAccounts.email,
        },
        usedBy: {
          id: accounts.id,
          email: accounts.email,
        },
      })
      .from(invites)
      .leftJoin(admins, eq(invites.createdById, admins.id))
      .leftJoin(inviterAccounts, eq(invites.inviterId, inviterAccounts.id))
      .leftJoin(accounts, eq(invites.usedById, accounts.id))
      .where(whereClause)
      .orderBy(desc(invites.createdAt))
      .limit(limit)
      .offset(offset),
    totalCountQuery,
    db
      .select({
        active: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} > now())::int`,
        used: sql<number>`count(*) filter (where ${invites.usedAt} is not null)::int`,
        expired: sql<number>`count(*) filter (where ${invites.usedAt} is null and ${invites.expiresAt} <= now())::int`,
      })
      .from(invites),
  ])

  const mappedInvites: InviteItem[] = items.map((item) => {
    const creatorInfo =
      item.creator && item.creator.id
        ? { id: item.creator.id, email: item.creator.email, role: item.creator.role as AdminRole }
        : null

    const inviterInfo =
      item.inviter && item.inviter.id
        ? { id: item.inviter.id, email: item.inviter.email }
        : null

    return {
      id: item.invite.id,
      code: item.invite.code,
      expiresAt: item.invite.expiresAt,
      createdBy: creatorInfo,
      inviter: inviterInfo,
      usedBy: item.usedBy && item.usedBy.id ? { id: item.usedBy.id, email: item.usedBy.email } : null,
      usedAt: item.invite.usedAt,
      createdAt: item.invite.createdAt,
      updatedAt: item.invite.updatedAt,
    }
  })

  const stats = {
    active: Number(statsResult[0]?.active ?? 0),
    used: Number(statsResult[0]?.used ?? 0),
    expired: Number(statsResult[0]?.expired ?? 0),
  }

  return {
    invites: mappedInvites,
    total: totalResult[0]?.count ?? 0,
    stats,
    limit,
    offset,
  }
}
