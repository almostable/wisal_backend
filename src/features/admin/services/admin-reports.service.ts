import {
  eq,
  sql,
  desc,
  count,
  and,
  or,
  isNull,
  ilike,
  aliasedTable,
  inArray,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../../db'
import { admins, type AdminRole } from '../../../db/schema/admins'
import { accounts } from '../../../db/schema/accounts'
import { profiles } from '../../../db/schema/profiles'
import { identities } from '../../../db/schema/identities'
import { posts, type PostType } from '../../../db/schema/posts'
import { comments, type CommentType } from '../../../db/schema/comments'
import {
  reports,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
} from '../../../db/schema/reports'
import { markEntityMediaDeleted, reconcileEntityMedia } from '../../uploads/service'
import { deleteNotificationsForPosts, deleteNotificationsForComments } from '../../notifications/service'
import { banUserAccount } from './admin-users.service'
import { parseSafeBigInt } from './utils'
import type {
  AdminReportItem,
  AdminReportTarget,
  ListReportsOptions,
  ListReportsResult,
  UpdateReportResolutionInput,
  ResolveReportActionOptions,
} from '../types'

async function fetchReportTarget(
  targetType: ReportTargetType,
  targetId: bigint
): Promise<AdminReportTarget | null> {
  if (targetType === 'post') {
    const [item] = await db
      .select({
        post: posts,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(posts.id, targetId))
      .limit(1)

    if (!item) return { type: 'post', post: null }

    return {
      type: 'post',
      post: {
        id: item.post.id,
        authorId: item.post.authorId,
        content: item.post.content,
        type: item.post.type as PostType,
        payload: item.post.payload as Record<string, unknown>,
        deletedAt: item.post.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    }
  }

  if (targetType === 'comment') {
    const [item] = await db
      .select({
        comment: comments,
        author: {
          id: profiles.id,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(comments.id, targetId))
      .limit(1)

    if (!item) return { type: 'comment', comment: null }

    return {
      type: 'comment',
      comment: {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        content: item.comment.content,
        type: item.comment.type as CommentType,
        payload: item.comment.payload as Record<string, unknown>,
        deletedAt: item.comment.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    }
  }

  if (targetType === 'profile') {
    const [item] = await db
      .select({
        profile: profiles,
        identity: identities,
      })
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(profiles.id, targetId))
      .limit(1)

    if (!item) return { type: 'profile', profile: null }

    return {
      type: 'profile',
      profile: {
        id: item.profile.id,
        name: item.profile.name,
        identity: item.identity?.identity ?? null,
        avatarKey: item.profile.avatarKey,
        description: item.profile.description,
        isMale: item.profile.isMale,
      },
    }
  }

  return null
}

async function fetchReportTargetsBatch(
  reportsList: Array<{ targetType: ReportTargetType | string; targetId: bigint }>
): Promise<Map<string, AdminReportTarget>> {
  const targetMap = new Map<string, AdminReportTarget>()
  if (reportsList.length === 0) return targetMap

  const postIds: bigint[] = []
  const commentIds: bigint[] = []
  const profileIds: bigint[] = []

  for (const r of reportsList) {
    if (r.targetType === 'post') postIds.push(r.targetId)
    else if (r.targetType === 'comment') commentIds.push(r.targetId)
    else if (r.targetType === 'profile') profileIds.push(r.targetId)
  }

  const uniquePostIds = Array.from(new Set(postIds))
  const uniqueCommentIds = Array.from(new Set(commentIds))
  const uniqueProfileIds = Array.from(new Set(profileIds))

  const [postRows, commentRows, profileRows] = await Promise.all([
    uniquePostIds.length > 0
      ? db
          .select({
            post: posts,
            author: {
              id: profiles.id,
              name: profiles.name,
              avatarKey: profiles.avatarKey,
            },
            identity: {
              identity: identities.identity,
            },
          })
          .from(posts)
          .leftJoin(profiles, eq(posts.authorId, profiles.id))
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(posts.id, uniquePostIds))
      : Promise.resolve([]),
    uniqueCommentIds.length > 0
      ? db
          .select({
            comment: comments,
            author: {
              id: profiles.id,
              name: profiles.name,
              avatarKey: profiles.avatarKey,
            },
            identity: {
              identity: identities.identity,
            },
          })
          .from(comments)
          .leftJoin(profiles, eq(comments.authorId, profiles.id))
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(comments.id, uniqueCommentIds))
      : Promise.resolve([]),
    uniqueProfileIds.length > 0
      ? db
          .select({
            profile: profiles,
            identity: identities,
          })
          .from(profiles)
          .leftJoin(identities, eq(profiles.identityId, identities.id))
          .where(inArray(profiles.id, uniqueProfileIds))
      : Promise.resolve([]),
  ])

  for (const item of postRows) {
    targetMap.set(`post:${item.post.id}`, {
      type: 'post',
      post: {
        id: item.post.id,
        authorId: item.post.authorId,
        content: item.post.content,
        type: item.post.type as PostType,
        payload: item.post.payload as Record<string, unknown>,
        deletedAt: item.post.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    })
  }

  for (const item of commentRows) {
    targetMap.set(`comment:${item.comment.id}`, {
      type: 'comment',
      comment: {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        content: item.comment.content,
        type: item.comment.type as CommentType,
        payload: item.comment.payload as Record<string, unknown>,
        deletedAt: item.comment.deletedAt,
        author: item.author?.id
          ? {
              id: item.author.id,
              name: item.author.name,
              identity: item.identity?.identity ?? null,
              avatarKey: item.author.avatarKey,
            }
          : null,
      },
    })
  }

  for (const item of profileRows) {
    targetMap.set(`profile:${item.profile.id}`, {
      type: 'profile',
      profile: {
        id: item.profile.id,
        name: item.profile.name,
        identity: item.identity?.identity ?? null,
        avatarKey: item.profile.avatarKey,
        description: item.profile.description,
        isMale: item.profile.isMale,
      },
    })
  }

  return targetMap
}

export async function listReports(options: ListReportsOptions = {}): Promise<ListReportsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'
  const targetType = options.targetType ?? 'all'
  const reason = options.reason ?? 'all'
  const searchQuery = (options.q ?? options.search)?.trim()

  const reporterAccounts = aliasedTable(accounts, 'reporter_accounts')
  const reporterProfiles = aliasedTable(profiles, 'reporter_profiles')
  const reporterIdentities = aliasedTable(identities, 'reporter_identities')

  const reportedAccounts = aliasedTable(accounts, 'reported_accounts')
  const reportedProfiles = aliasedTable(profiles, 'reported_profiles')
  const reportedIdentities = aliasedTable(identities, 'reported_identities')

  const resolverAdmins = aliasedTable(admins, 'resolver_admins')

  const conditions: SQL[] = []

  if (status !== 'all') {
    conditions.push(eq(reports.status, status))
  }

  if (targetType !== 'all') {
    conditions.push(eq(reports.targetType, targetType))
  }

  if (reason !== 'all') {
    conditions.push(eq(reports.reason, reason))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(reports.id, safeId),
          eq(reports.targetId, safeId),
          eq(reports.reporterProfileId, safeId),
          eq(reports.reportedProfileId, safeId),
          ilike(reports.details, searchPattern),
          ilike(reports.modNote, searchPattern),
          ilike(reporterAccounts.email, searchPattern),
          ilike(reporterProfiles.name, searchPattern),
          ilike(reporterIdentities.identity, searchPattern),
          ilike(reportedAccounts.email, searchPattern),
          ilike(reportedProfiles.name, searchPattern),
          ilike(reportedIdentities.identity, searchPattern)
        )
      : or(
          ilike(reports.details, searchPattern),
          ilike(reports.modNote, searchPattern),
          ilike(reporterAccounts.email, searchPattern),
          ilike(reporterProfiles.name, searchPattern),
          ilike(reporterIdentities.identity, searchPattern),
          ilike(reportedAccounts.email, searchPattern),
          ilike(reportedProfiles.name, searchPattern),
          ilike(reportedIdentities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [items, totalResult, statsResult] = await Promise.all([
    db
      .select({
        report: reports,
        reporter: {
          id: reporterProfiles.id,
          email: reporterAccounts.email,
        },
        reporterProfile: {
          name: reporterProfiles.name,
          avatarKey: reporterProfiles.avatarKey,
        },
        reporterIdentity: {
          identity: reporterIdentities.identity,
        },
        reportedUser: {
          id: reportedProfiles.id,
          email: reportedAccounts.email,
        },
        reportedUserProfile: {
          name: reportedProfiles.name,
          avatarKey: reportedProfiles.avatarKey,
        },
        reportedUserIdentity: {
          identity: reportedIdentities.identity,
        },
        resolver: {
          id: resolverAdmins.id,
          email: resolverAdmins.email,
          role: resolverAdmins.role,
        },
      })
      .from(reports)
      .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
      .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
      .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
      .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
      .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
      .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
      .leftJoin(resolverAdmins, eq(reports.resolvedById, resolverAdmins.id))
      .where(whereClause)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(reports)
      .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
      .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
      .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
      .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
      .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
      .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
      .where(whereClause),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${reports.status} = 'pending')::int`,
        resolved: sql<number>`count(*) filter (where ${reports.status} = 'resolved')::int`,
        rejected: sql<number>`count(*) filter (where ${reports.status} = 'rejected')::int`,
      })
      .from(reports),
  ])

  const targetMap = await fetchReportTargetsBatch(
    items.map((i) => ({ targetType: i.report.targetType, targetId: i.report.targetId }))
  )

  const mappedReports: AdminReportItem[] = items.map((item) => {
    const reporterInfo =
      item.reporter && item.reporter.id
        ? {
            id: item.reporter.id,
            email: item.reporter.email ?? '',
            name: item.reporterProfile?.name ?? null,
            identity: item.reporterIdentity?.identity ?? null,
            avatarKey: item.reporterProfile?.avatarKey ?? null,
          }
        : null

    const reportedUserInfo =
      item.reportedUser && item.reportedUser.id
        ? {
            id: item.reportedUser.id,
            email: item.reportedUser.email ?? '',
            name: item.reportedUserProfile?.name ?? null,
            identity: item.reportedUserIdentity?.identity ?? null,
            avatarKey: item.reportedUserProfile?.avatarKey ?? null,
          }
        : null

    const resolverInfo =
      item.resolver && item.resolver.id
        ? {
            id: item.resolver.id,
            email: item.resolver.email,
            role: item.resolver.role as AdminRole,
          }
        : null

    const targetKey = `${item.report.targetType}:${item.report.targetId}`
    const target = targetMap.get(targetKey) ?? null

    return {
      id: item.report.id,
      targetType: item.report.targetType as ReportTargetType,
      targetId: item.report.targetId,
      reason: item.report.reason as ReportReason,
      details: item.report.details,
      status: item.report.status as ReportStatus,
      modNote: item.report.modNote,
      reporter: reporterInfo,
      reportedUser: reportedUserInfo,
      resolvedBy: resolverInfo,
      resolvedAt: item.report.resolvedAt,
      target,
      createdAt: item.report.createdAt,
      updatedAt: item.report.updatedAt,
    }
  })

  const stats = {
    pending: Number(statsResult[0]?.pending ?? 0),
    resolved: Number(statsResult[0]?.resolved ?? 0),
    rejected: Number(statsResult[0]?.rejected ?? 0),
  }

  return {
    reports: mappedReports,
    total: totalResult[0]?.count ?? 0,
    stats,
    limit,
    offset,
  }
}

export async function getReportById(reportId: bigint): Promise<AdminReportItem> {
  const reporterAccounts = aliasedTable(accounts, 'reporter_accounts')
  const reporterProfiles = aliasedTable(profiles, 'reporter_profiles')
  const reporterIdentities = aliasedTable(identities, 'reporter_identities')

  const reportedAccounts = aliasedTable(accounts, 'reported_accounts')
  const reportedProfiles = aliasedTable(profiles, 'reported_profiles')
  const reportedIdentities = aliasedTable(identities, 'reported_identities')

  const resolverAdmins = aliasedTable(admins, 'resolver_admins')

  const [item] = await db
    .select({
      report: reports,
      reporter: {
        id: reporterProfiles.id,
        email: reporterAccounts.email,
      },
      reporterProfile: {
        name: reporterProfiles.name,
        avatarKey: reporterProfiles.avatarKey,
      },
      reporterIdentity: {
        identity: reporterIdentities.identity,
      },
      reportedUser: {
        id: reportedProfiles.id,
        email: reportedAccounts.email,
      },
      reportedUserProfile: {
        name: reportedProfiles.name,
        avatarKey: reportedProfiles.avatarKey,
      },
      reportedUserIdentity: {
        identity: reportedIdentities.identity,
      },
      resolver: {
        id: resolverAdmins.id,
        email: resolverAdmins.email,
        role: resolverAdmins.role,
      },
    })
    .from(reports)
    .leftJoin(reporterProfiles, eq(reports.reporterProfileId, reporterProfiles.id))
    .leftJoin(reporterIdentities, eq(reporterProfiles.identityId, reporterIdentities.id))
    .leftJoin(reporterAccounts, eq(reporterProfiles.accountId, reporterAccounts.id))
    .leftJoin(reportedProfiles, eq(reports.reportedProfileId, reportedProfiles.id))
    .leftJoin(reportedIdentities, eq(reportedProfiles.identityId, reportedIdentities.id))
    .leftJoin(reportedAccounts, eq(reportedProfiles.accountId, reportedAccounts.id))
    .leftJoin(resolverAdmins, eq(reports.resolvedById, resolverAdmins.id))
    .where(eq(reports.id, reportId))

  if (!item) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  const target = await fetchReportTarget(
    item.report.targetType as ReportTargetType,
    item.report.targetId
  )

  const reporterInfo =
    item.reporter && item.reporter.id
      ? {
          id: item.reporter.id,
          email: item.reporter.email ?? '',
          name: item.reporterProfile?.name ?? null,
          identity: item.reporterIdentity?.identity ?? null,
          avatarKey: item.reporterProfile?.avatarKey ?? null,
        }
      : null

  const reportedUserInfo =
    item.reportedUser && item.reportedUser.id
      ? {
          id: item.reportedUser.id,
          email: item.reportedUser.email ?? '',
          name: item.reportedUserProfile?.name ?? null,
          identity: item.reportedUserIdentity?.identity ?? null,
          avatarKey: item.reportedUserProfile?.avatarKey ?? null,
        }
      : null

  const resolverInfo =
    item.resolver && item.resolver.id
      ? {
          id: item.resolver.id,
          email: item.resolver.email,
          role: item.resolver.role as AdminRole,
        }
      : null

  return {
    id: item.report.id,
    targetType: item.report.targetType as ReportTargetType,
    targetId: item.report.targetId,
    reason: item.report.reason as ReportReason,
    details: item.report.details,
    status: item.report.status as ReportStatus,
    modNote: item.report.modNote,
    reporter: reporterInfo,
    reportedUser: reportedUserInfo,
    resolvedBy: resolverInfo,
    resolvedAt: item.report.resolvedAt,
    target,
    createdAt: item.report.createdAt,
    updatedAt: item.report.updatedAt,
  }
}

export async function updateReportResolution(
  admin: { id: bigint; role: AdminRole },
  reportId: bigint,
  input: UpdateReportResolutionInput
): Promise<AdminReportItem> {
  const existing = await db.query.reports.findFirst({
    where: eq(reports.id, reportId),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  const { status, modNote } = input
  const isResolving = status !== 'pending'
  const resolvedAt = isResolving ? new Date() : null
  const resolvedById = isResolving ? admin.id : null

  const [updated] = await db
    .update(reports)
    .set({
      status,
      modNote: modNote !== undefined ? (modNote && modNote.trim().length > 0 ? modNote.trim() : null) : existing.modNote,
      resolvedById,
      resolvedAt,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId))
    .returning()

  if (!updated) {
    throw new HTTPException(500, { message: 'Failed to update report' })
  }

  return getReportById(reportId)
}

export async function resolveReportWithAction(
  admin: { id: bigint; role: AdminRole },
  reportId: bigint,
  options: ResolveReportActionOptions
): Promise<AdminReportItem> {
  return await db.transaction(async (tx) => {
    const report = await tx.query.reports.findFirst({
      where: eq(reports.id, reportId),
    })

    if (!report) {
      throw new HTTPException(404, { message: 'Report not found' })
    }

    const { status, modNote, action, banReason } = options

    // Apply action
    if (action === 'delete_target') {
      if (report.targetType === 'post') {
        await tx
          .update(posts)
          .set({ deletedAt: new Date(), isPinned: false })
          .where(eq(posts.id, report.targetId))
        await markEntityMediaDeleted(tx, { entityType: 'post', entityId: report.targetId })
        await deleteNotificationsForPosts(report.targetId, tx)
      } else if (report.targetType === 'comment') {
        const targetComment = await tx.query.comments.findFirst({
          where: eq(comments.id, report.targetId),
        })

        if (targetComment && targetComment.deletedAt === null) {
          let toDeleteIds: bigint[] = [targetComment.id]

          if (targetComment.parentId === null) {
            const descendants = await tx
              .select({ id: comments.id })
              .from(comments)
              .where(and(eq(comments.parentId, targetComment.id), isNull(comments.deletedAt)))

            toDeleteIds = [targetComment.id, ...descendants.map((d) => d.id)]

            await tx
              .update(comments)
              .set({ deletedAt: new Date() })
              .where(inArray(comments.id, toDeleteIds))

            await tx
              .update(posts)
              .set({
                commentsCount: sql`GREATEST(0, ${posts.commentsCount} - ${toDeleteIds.length})`,
              })
              .where(eq(posts.id, targetComment.postId))
          } else {
            await tx
              .update(comments)
              .set({ deletedAt: new Date() })
              .where(eq(comments.id, targetComment.id))

            await tx
              .update(posts)
              .set({
                commentsCount: sql`GREATEST(0, ${posts.commentsCount} - 1)`,
              })
              .where(eq(posts.id, targetComment.postId))

            await tx
              .update(comments)
              .set({
                repliesCount: sql`GREATEST(0, ${comments.repliesCount} - 1)`,
              })
              .where(eq(comments.id, targetComment.parentId))
          }

          for (const id of toDeleteIds) {
            await markEntityMediaDeleted(tx, { entityType: 'comment', entityId: id })
          }
          await deleteNotificationsForComments(toDeleteIds, tx)
        }
      }
    } else if (action === 'ban_user') {
      const reportedProfile = await tx.query.profiles.findFirst({
        where: eq(profiles.id, report.reportedProfileId),
      })
      if (reportedProfile) {
        await banUserAccount(
          { id: admin.id },
          reportedProfile.accountId,
          {
            reason: banReason ?? report.reason,
          },
          tx
        )
      }
    } else if (action === 'remove_avatar') {
      const reportedProfile = await tx.query.profiles.findFirst({
        where: eq(profiles.id, report.reportedProfileId),
      })
      if (reportedProfile && reportedProfile.avatarKey) {
        const oldKey = reportedProfile.avatarKey
        await tx
          .update(profiles)
          .set({ avatarKey: null })
          .where(eq(profiles.id, reportedProfile.id))
        await reconcileEntityMedia(tx, {
          entityType: 'avatar',
          entityId: reportedProfile.id,
          profileId: reportedProfile.id,
          newFileKeys: [],
          oldFileKeys: [oldKey],
        })
      }
    }

    const isResolving = status !== 'pending'
    const resolvedAt = isResolving ? new Date() : null
    const resolvedById = isResolving ? admin.id : null

    await tx
      .update(reports)
      .set({
        status,
        modNote: modNote !== undefined ? (modNote && modNote.trim().length > 0 ? modNote.trim() : null) : report.modNote,
        resolvedById,
        resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))

    return getReportById(reportId)
  })
}
