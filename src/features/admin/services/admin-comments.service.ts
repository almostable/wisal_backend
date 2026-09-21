import {
  eq,
  desc,
  asc,
  count,
  and,
  or,
  isNull,
  isNotNull,
  ilike,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../../db'
import { comments, type CommentType } from '../../../db/schema/comments'
import { profiles } from '../../../db/schema/profiles'
import { accounts } from '../../../db/schema/accounts'
import { identities } from '../../../db/schema/identities'
import { mediaUploads } from '../../../db/schema/media-uploads'
import { markEntityMediaDeleted } from '../../uploads/service'
import { parseSafeBigInt } from './utils'
import type {
  AdminCommentItem,
  AdminPostAuthor,
  ListCommentsAdminOptions,
  ListCommentsAdminResult,
} from '../types'

export async function listCommentsByAdmin(
  options: ListCommentsAdminOptions = {}
): Promise<ListCommentsAdminResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (options.status === 'active') {
    conditions.push(isNull(comments.deletedAt))
  } else if (options.status === 'deleted') {
    conditions.push(isNotNull(comments.deletedAt))
  }

  if (options.postId) {
    conditions.push(eq(comments.postId, options.postId))
  }

  if (options.authorId) {
    conditions.push(eq(comments.authorId, options.authorId))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(comments.id, safeId),
          eq(comments.postId, safeId),
          eq(comments.authorId, safeId),
          ilike(comments.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
      : or(
          ilike(comments.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [rawComments, totalResult] = await Promise.all([
    db
      .select({
        comment: comments,
        author: {
          id: profiles.id,
          accountId: profiles.accountId,
          email: accounts.email,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
          isMale: profiles.isMale,
          verifiedAt: profiles.verifiedAt,
        },
        identity: {
          identity: identities.identity,
        },
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
  ])

  const mappedComments: AdminCommentItem[] = rawComments.map((item) => {
    const author: AdminPostAuthor | null =
      item.author && item.author.id && item.author.accountId && item.author.email
        ? {
            id: item.author.id,
            accountId: item.author.accountId,
            email: item.author.email,
            name: item.author.name,
            identity: item.identity?.identity ?? null,
            avatarKey: item.author.avatarKey,
            isMale: item.author.isMale,
            isVerified: Boolean(item.author.verifiedAt),
          }
        : null

    return {
      id: item.comment.id,
      postId: item.comment.postId,
      authorId: item.comment.authorId,
      parentId: item.comment.parentId,
      replyToCommentId: item.comment.replyToCommentId,
      replyToProfileId: item.comment.replyToProfileId,
      type: item.comment.type as CommentType,
      payload: item.comment.payload as Record<string, unknown>,
      content: item.comment.content,
      repliesCount: item.comment.repliesCount,
      deletedAt: item.comment.deletedAt,
      createdAt: item.comment.createdAt,
      updatedAt: item.comment.updatedAt,
      editedAt: item.comment.editedAt,
      author,
    }
  })

  return {
    comments: mappedComments,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getPostCommentsByAdmin(postId: bigint): Promise<AdminCommentItem[]> {
  const rawComments = await db
    .select({
      comment: comments,
      author: {
        id: profiles.id,
        accountId: profiles.accountId,
        email: accounts.email,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        isMale: profiles.isMale,
        verifiedAt: profiles.verifiedAt,
      },
      identity: {
        identity: identities.identity,
      },
    })
    .from(comments)
    .leftJoin(profiles, eq(comments.authorId, profiles.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))

  return rawComments.map((item) => {
    const author: AdminPostAuthor | null =
      item.author && item.author.id && item.author.accountId && item.author.email
        ? {
            id: item.author.id,
            accountId: item.author.accountId,
            email: item.author.email,
            name: item.author.name,
            identity: item.identity?.identity ?? null,
            avatarKey: item.author.avatarKey,
            isMale: item.author.isMale,
            isVerified: Boolean(item.author.verifiedAt),
          }
        : null

    return {
      id: item.comment.id,
      postId: item.comment.postId,
      authorId: item.comment.authorId,
      parentId: item.comment.parentId,
      replyToCommentId: item.comment.replyToCommentId,
      replyToProfileId: item.comment.replyToProfileId,
      type: item.comment.type as CommentType,
      payload: item.comment.payload as Record<string, unknown>,
      content: item.comment.content,
      repliesCount: item.comment.repliesCount,
      deletedAt: item.comment.deletedAt,
      createdAt: item.comment.createdAt,
      updatedAt: item.comment.updatedAt,
      editedAt: item.comment.editedAt,
      author,
    }
  })
}

export async function deleteCommentByAdmin(commentId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.deletedAt !== null) {
      throw new HTTPException(400, { message: 'Comment is already deleted' })
    }

    await tx
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, commentId))

    await markEntityMediaDeleted(tx, {
      entityType: 'comment',
      entityId: commentId,
    })

    return {
      success: true,
      message: 'Comment deleted successfully by admin',
    }
  })
}

export async function restoreCommentByAdmin(commentId: bigint): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: eq(comments.id, commentId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.deletedAt === null) {
      throw new HTTPException(400, { message: 'Comment is not deleted' })
    }

    await tx
      .update(comments)
      .set({ deletedAt: null })
      .where(eq(comments.id, commentId))

    await tx
      .update(mediaUploads)
      .set({ status: 'attached' })
      .where(
        and(
          eq(mediaUploads.entityType, 'comment'),
          eq(mediaUploads.entityId, commentId),
          eq(mediaUploads.status, 'deleted')
        )
      )

    return {
      success: true,
      message: 'Comment restored successfully',
    }
  })
}
