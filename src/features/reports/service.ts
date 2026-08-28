import { eq, and, desc, count, isNull, type SQL } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { reports, type Report } from '../../db/schema/reports'
import { accounts } from '../../db/schema/accounts'
import { posts } from '../../db/schema/posts'
import { comments } from '../../db/schema/comments'
import type {
  CreateReportInput,
  ListUserReportsOptions,
  ListUserReportsResult,
} from './types'

export async function createReport(
  reporterId: bigint,
  input: CreateReportInput
): Promise<Report> {
  const { targetType, targetId, reason, details } = input

  let reportedUserId: bigint

  if (targetType === 'user') {
    const user = await db.query.accounts.findFirst({
      where: eq(accounts.id, targetId),
    })

    if (!user) {
      throw new HTTPException(404, { message: 'Reported user not found' })
    }

    reportedUserId = targetId
  } else if (targetType === 'post') {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, targetId), isNull(posts.deletedAt)),
    })

    if (!post) {
      throw new HTTPException(404, { message: 'Reported post not found' })
    }

    reportedUserId = post.authorId
  } else if (targetType === 'comment') {
    const comment = await db.query.comments.findFirst({
      where: and(eq(comments.id, targetId), isNull(comments.deletedAt)),
    })

    if (!comment) {
      throw new HTTPException(404, { message: 'Reported comment not found' })
    }

    reportedUserId = comment.authorId
  } else {
    throw new HTTPException(400, { message: 'Invalid target type' })
  }

  if (reportedUserId === reporterId) {
    throw new HTTPException(400, {
      message: 'You cannot report yourself or your own content',
    })
  }

  const existingReport = await db.query.reports.findFirst({
    where: and(
      eq(reports.reporterId, reporterId),
      eq(reports.targetType, targetType),
      eq(reports.targetId, targetId),
      eq(reports.reason, reason)
    ),
  })

  if (existingReport) {
    throw new HTTPException(409, {
      message: 'You have already reported this target for this reason',
    })
  }

  const [newReport] = await db
    .insert(reports)
    .values({
      reporterId,
      reportedUserId,
      targetType,
      targetId,
      reason,
      details: details && details.trim().length > 0 ? details.trim() : null,
      status: 'pending',
    })
    .returning()

  if (!newReport) {
    throw new HTTPException(500, { message: 'Failed to create report' })
  }

  return newReport
}

export async function listUserReports(
  reporterId: bigint,
  options: ListUserReportsOptions = {}
): Promise<ListUserReportsResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const status = options.status ?? 'all'

  const conditions: SQL[] = [eq(reports.reporterId, reporterId)]

  if (status !== 'all') {
    conditions.push(eq(reports.status, status))
  }

  const whereClause = and(...conditions)

  const [items, totalResult] = await Promise.all([
    db.query.reports.findMany({
      where: whereClause,
      orderBy: [desc(reports.createdAt)],
      limit,
      offset,
    }),
    db.select({ count: count() }).from(reports).where(whereClause),
  ])

  return {
    reports: items,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getUserReportById(
  reporterId: bigint,
  reportId: bigint
): Promise<Report> {
  const report = await db.query.reports.findFirst({
    where: and(eq(reports.id, reportId), eq(reports.reporterId, reporterId)),
  })

  if (!report) {
    throw new HTTPException(404, { message: 'Report not found' })
  }

  return report
}
