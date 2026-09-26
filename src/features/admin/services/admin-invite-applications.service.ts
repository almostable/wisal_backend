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
import { admins, type SafeAdmin, type AdminRole } from '../../../db/schema/admins'
import { invites } from '../../../db/schema/invites'
import { accounts } from '../../../db/schema/accounts'
import {
  inviteApplications,
  type InviteApplicationStatus,
} from '../../../db/schema/invite-applications'
import { generateRandomInviteCode } from '../../../lib/invite'
import { APPLICATION_INVITE_TTL_MS } from '../../../config/constants'
import { parseSafeBigInt } from './utils'
import type {
  InviteApplicationItem,
  ListInviteApplicationsOptions,
  ListInviteApplicationsResult,
  ApproveInviteApplicationInput,
  RejectInviteApplicationInput,
} from '../types'

function mapApplicationItem(row: {
  app: typeof inviteApplications.$inferSelect
  reviewer: { id: bigint; email: string; role: string } | null
  invite: typeof invites.$inferSelect | null
  usedBy: { id: bigint; email: string } | null
}): InviteApplicationItem {
  const reviewerInfo =
    row.reviewer && row.reviewer.id
      ? {
          id: row.reviewer.id,
          email: row.reviewer.email,
          role: row.reviewer.role as AdminRole,
        }
      : null

  const inviteInfo =
    row.invite && row.invite.id
      ? {
          id: row.invite.id,
          code: row.invite.code,
          expiresAt: row.invite.expiresAt,
          usedAt: row.invite.usedAt,
          usedBy:
            row.usedBy && row.usedBy.id
              ? { id: row.usedBy.id, email: row.usedBy.email }
              : null,
        }
      : null

  return {
    id: row.app.id,
    name: row.app.name,
    about: row.app.about,
    reason: row.app.reason,
    contact: row.app.contact,
    contactNormalized: row.app.contactNormalized,
    status: row.app.status as InviteApplicationStatus,
    reviewedBy: reviewerInfo,
    reviewedAt: row.app.reviewedAt,
    reviewNote: row.app.reviewNote,
    invite: inviteInfo,
    ip: row.app.ip,
    userAgent: row.app.userAgent,
    createdAt: row.app.createdAt,
    updatedAt: row.app.updatedAt,
  }
}

export async function listInviteApplications(
  options: ListInviteApplicationsOptions = {}
): Promise<ListInviteApplicationsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: SQL[] = []

  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    conditions.push(eq(inviteApplications.status, status))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition =
      safeId !== null
        ? or(
            eq(inviteApplications.id, safeId),
            eq(inviteApplications.inviteId, safeId),
            ilike(inviteApplications.name, searchPattern),
            ilike(inviteApplications.contact, searchPattern),
            ilike(inviteApplications.contactNormalized, searchPattern)
          )
        : or(
            ilike(inviteApplications.name, searchPattern),
            ilike(inviteApplications.contact, searchPattern),
            ilike(inviteApplications.contactNormalized, searchPattern)
          )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [items, totalResult, statsResult] = await Promise.all([
    db
      .select({
        app: inviteApplications,
        reviewer: {
          id: admins.id,
          email: admins.email,
          role: admins.role,
        },
        invite: invites,
        usedBy: {
          id: accounts.id,
          email: accounts.email,
        },
      })
      .from(inviteApplications)
      .leftJoin(admins, eq(inviteApplications.reviewedById, admins.id))
      .leftJoin(invites, eq(inviteApplications.inviteId, invites.id))
      .leftJoin(accounts, eq(invites.usedById, accounts.id))
      .where(whereClause)
      .orderBy(desc(inviteApplications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(inviteApplications)
      .where(whereClause),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${inviteApplications.status} = 'pending')::int`,
        approved: sql<number>`count(*) filter (where ${inviteApplications.status} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${inviteApplications.status} = 'rejected')::int`,
        total: count(),
      })
      .from(inviteApplications),
  ])

  const mappedApplications = items.map(mapApplicationItem)

  const stats = {
    pending: Number(statsResult[0]?.pending ?? 0),
    approved: Number(statsResult[0]?.approved ?? 0),
    rejected: Number(statsResult[0]?.rejected ?? 0),
    total: Number(statsResult[0]?.total ?? 0),
  }

  return {
    applications: mappedApplications,
    total: totalResult[0]?.count ?? 0,
    stats,
    limit,
    offset,
  }
}

export async function getInviteApplicationById(id: bigint): Promise<InviteApplicationItem> {
  const [row] = await db
    .select({
      app: inviteApplications,
      reviewer: {
        id: admins.id,
        email: admins.email,
        role: admins.role,
      },
      invite: invites,
      usedBy: {
        id: accounts.id,
        email: accounts.email,
      },
    })
    .from(inviteApplications)
    .leftJoin(admins, eq(inviteApplications.reviewedById, admins.id))
    .leftJoin(invites, eq(inviteApplications.inviteId, invites.id))
    .leftJoin(accounts, eq(invites.usedById, accounts.id))
    .where(eq(inviteApplications.id, id))
    .limit(1)

  if (!row) {
    throw new HTTPException(404, { message: 'Invite application not found' })
  }

  return mapApplicationItem(row)
}

export async function approveInviteApplication(
  id: bigint,
  admin: SafeAdmin,
  input: ApproveInviteApplicationInput = {}
): Promise<InviteApplicationItem> {
  return await db.transaction(async (tx) => {
    // Acquire row-level lock to prevent concurrent reviews
    const [existing] = await tx
      .select()
      .from(inviteApplications)
      .where(eq(inviteApplications.id, id))
      .for('update')

    if (!existing) {
      throw new HTTPException(404, { message: 'Invite application not found' })
    }

    if (existing.status !== 'pending') {
      throw new HTTPException(409, { message: 'Application has already been reviewed' })
    }

    const inviteCode = generateRandomInviteCode()
    const expiresAt = new Date(Date.now() + APPLICATION_INVITE_TTL_MS)

    const [newInvite] = await tx
      .insert(invites)
      .values({
        code: inviteCode,
        createdById: admin.id,
        expiresAt,
      })
      .returning()

    if (!newInvite) {
      throw new HTTPException(500, { message: 'Failed to create invite record' })
    }

    const now = new Date()
    const reviewNote = input.reviewNote?.trim() || null

    const [updated] = await tx
      .update(inviteApplications)
      .set({
        status: 'approved',
        inviteId: newInvite.id,
        reviewedById: admin.id,
        reviewedAt: now,
        reviewNote,
        updatedAt: now,
      })
      .where(eq(inviteApplications.id, id))
      .returning()

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to update invite application' })
    }

    return {
      id: updated.id,
      name: updated.name,
      about: updated.about,
      reason: updated.reason,
      contact: updated.contact,
      contactNormalized: updated.contactNormalized,
      status: 'approved',
      reviewedBy: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      reviewedAt: now,
      reviewNote,
      invite: {
        id: newInvite.id,
        code: newInvite.code,
        expiresAt: newInvite.expiresAt,
        usedAt: null,
        usedBy: null,
      },
      ip: updated.ip,
      userAgent: updated.userAgent,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
  })
}

export async function rejectInviteApplication(
  id: bigint,
  admin: SafeAdmin,
  input: RejectInviteApplicationInput
): Promise<InviteApplicationItem> {
  const note = input.reviewNote?.trim()
  if (!note || note.length < 5) {
    throw new HTTPException(400, {
      message: 'Rejection review note must be at least 5 characters long',
    })
  }

  return await db.transaction(async (tx) => {
    // Acquire row-level lock to prevent concurrent reviews
    const [existing] = await tx
      .select()
      .from(inviteApplications)
      .where(eq(inviteApplications.id, id))
      .for('update')

    if (!existing) {
      throw new HTTPException(404, { message: 'Invite application not found' })
    }

    if (existing.status !== 'pending') {
      throw new HTTPException(409, { message: 'Application has already been reviewed' })
    }

    const now = new Date()

    const [updated] = await tx
      .update(inviteApplications)
      .set({
        status: 'rejected',
        reviewedById: admin.id,
        reviewedAt: now,
        reviewNote: note,
        updatedAt: now,
      })
      .where(eq(inviteApplications.id, id))
      .returning()

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to update invite application' })
    }

    return {
      id: updated.id,
      name: updated.name,
      about: updated.about,
      reason: updated.reason,
      contact: updated.contact,
      contactNormalized: updated.contactNormalized,
      status: 'rejected',
      reviewedBy: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      reviewedAt: now,
      reviewNote: note,
      invite: null,
      ip: updated.ip,
      userAgent: updated.userAgent,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
  })
}
