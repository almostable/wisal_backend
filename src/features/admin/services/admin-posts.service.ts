import {
  eq,
  sql,
  desc,
  count,
  and,
  or,
  isNull,
  isNotNull,
  ilike,
  inArray,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db, type DbExecutor } from '../../../db'
import { MEDIA_GC_DELETED_TTL_DAYS } from '../../../config/constants'
import { posts, type PostType, type GenderScope } from '../../../db/schema/posts'
import { comments } from '../../../db/schema/comments'
import { profiles } from '../../../db/schema/profiles'
import { accounts } from '../../../db/schema/accounts'
import { identities } from '../../../db/schema/identities'
import { mediaUploads } from '../../../db/schema/media-uploads'
import { markEntityMediaDeleted, reconcileEntityMedia } from '../../uploads/service'
import { getMediaFileKeys, validateMediaRemoval } from '../../uploads/media-edit'
import { deleteNotificationsForPosts } from '../../notifications/service'
import { parseSafeBigInt } from './utils'
import type { UpdatePostByAdminInput } from '../schema'
import type {
  AdminPostItem,
  AdminPostAuthor,
  ListPostsAdminOptions,
  ListPostsAdminResult,
} from '../types'

export async function listPostsByAdmin(
  options: ListPostsAdminOptions = {}
): Promise<ListPostsAdminResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const searchQuery = (options.q ?? options.search)?.trim()

  const conditions: (SQL | undefined)[] = []

  if (options.status === 'active') {
    conditions.push(isNull(posts.deletedAt))
  } else if (options.status === 'deleted') {
    conditions.push(isNotNull(posts.deletedAt))
  }

  if (options.authorId) {
    conditions.push(eq(posts.authorId, options.authorId))
  }

  if (options.type && options.type !== 'all') {
    conditions.push(eq(posts.type, options.type))
  }

  if (options.genderScope && options.genderScope !== 'all') {
    conditions.push(eq(posts.genderScope, options.genderScope))
  }

  if (options.isFeed === 'true') {
    conditions.push(eq(posts.isFeed, true))
  } else if (options.isFeed === 'false') {
    conditions.push(eq(posts.isFeed, false))
  }

  if (options.isPinned === 'true') {
    conditions.push(eq(posts.isPinned, true))
  } else if (options.isPinned === 'false') {
    conditions.push(eq(posts.isPinned, false))
  }

  if (searchQuery) {
    const safeId = parseSafeBigInt(searchQuery)
    const searchPattern = `%${searchQuery}%`
    const searchCondition = safeId !== null
      ? or(
          eq(posts.id, safeId),
          eq(posts.authorId, safeId),
          ilike(posts.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
      : or(
          ilike(posts.content, searchPattern),
          ilike(accounts.email, searchPattern),
          ilike(profiles.name, searchPattern),
          ilike(identities.identity, searchPattern)
        )
    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

  const [rawPosts, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
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
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(posts)
      .leftJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition),
  ])

  const mappedPosts: AdminPostItem[] = rawPosts.map((item) => {
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
      id: item.post.id,
      authorId: item.post.authorId,
      type: item.post.type as PostType,
      payload: item.post.payload as Record<string, unknown>,
      content: item.post.content,
      genderScope: item.post.genderScope as GenderScope,
      isFeed: item.post.isFeed,
      isPinned: item.post.isPinned,
      savesCount: item.post.savesCount,
      likesCount: item.post.likesCount,
      commentsCount: item.post.commentsCount,
      viewsCount: item.post.viewsCount,
      deletedAt: item.post.deletedAt,
      createdAt: item.post.createdAt,
      updatedAt: item.post.updatedAt,
      editedAt: item.post.editedAt,
      author,
    }
  })

  return {
    posts: mappedPosts,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getPostByIdByAdmin(postId: bigint): Promise<AdminPostItem> {
  const [item] = await db
    .select({
      post: posts,
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
    .from(posts)
    .leftJoin(profiles, eq(posts.authorId, profiles.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .where(eq(posts.id, postId))
    .limit(1)

  if (!item) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

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
    id: item.post.id,
    authorId: item.post.authorId,
    type: item.post.type as PostType,
    payload: item.post.payload as Record<string, unknown>,
    content: item.post.content,
    genderScope: item.post.genderScope as GenderScope,
    isFeed: item.post.isFeed,
    isPinned: item.post.isPinned,
    savesCount: item.post.savesCount,
    likesCount: item.post.likesCount,
    commentsCount: item.post.commentsCount,
    viewsCount: item.post.viewsCount,
    deletedAt: item.post.deletedAt,
    createdAt: item.post.createdAt,
    updatedAt: item.post.updatedAt,
    editedAt: item.post.editedAt,
    author,
  }
}

export async function deletePostByAdmin(postId: bigint, executor: DbExecutor = db): Promise<{ success: boolean; message: string }> {
  const executeInTx = async (tx: DbExecutor) => {
    const existing = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.deletedAt !== null) {
      throw new HTTPException(400, { message: 'Post is already deleted' })
    }

    const now = new Date()

    await tx
      .update(posts)
      .set({
        deletedAt: now,
        isPinned: false,
      })
      .where(eq(posts.id, postId))

    await tx
      .update(comments)
      .set({ deletedAt: now })
      .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))

    await markEntityMediaDeleted(tx, {
      entityType: 'post',
      entityId: postId,
    })

    await tx.execute(sql`
      UPDATE media_uploads
      SET status = 'deleted', deleted_at = NOW()
      WHERE entity_type = 'comment'
        AND status = 'attached'
        AND entity_id IN (
          SELECT id FROM comments WHERE post_id = ${postId}
        )
    `)

    await deleteNotificationsForPosts(postId, tx)

    return {
      success: true,
      message: 'Post deleted successfully by admin',
    }
  }

  return executor === db ? db.transaction(executeInTx) : executeInTx(executor)
}

export async function restorePostByAdmin(postId: bigint, executor: DbExecutor = db): Promise<{ success: boolean; message: string }> {
  const executeInTx = async (tx: DbExecutor) => {
    const existing = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.deletedAt === null) {
      throw new HTTPException(400, { message: 'Post is not deleted' })
    }

    if (existing.deletedAt.getTime() <= Date.now() - MEDIA_GC_DELETED_TTL_DAYS * 86_400_000) {
      throw new HTTPException(409, { message: 'Post restoration period has expired' })
    }

    const [author] = await tx.select({ deletedAt: accounts.deletedAt, bannedAt: accounts.bannedAt })
      .from(profiles).innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, existing.authorId)).limit(1)
    if (!author || author.deletedAt || author.bannedAt) {
      throw new HTTPException(409, { message: 'Post author is unavailable' })
    }

    const candidates = await tx.select({ id: comments.id, parentId: comments.parentId })
      .from(comments)
      .innerJoin(profiles, eq(comments.authorId, profiles.id))
      .innerJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(and(eq(comments.postId, postId), eq(comments.deletedAt, existing.deletedAt),
        isNull(accounts.deletedAt), isNull(accounts.bannedAt)))
    const rootIds = new Set(candidates.filter((comment) => comment.parentId === null).map((comment) => comment.id))
    const commentIds = candidates.filter((comment) =>
      comment.parentId === null || rootIds.has(comment.parentId)
    ).map((comment) => comment.id)
    const restoredComments = commentIds.length > 0
      ? await tx.update(comments).set({ deletedAt: null })
        .where(inArray(comments.id, commentIds)).returning({ id: comments.id, payload: comments.payload })
      : []

    await tx
      .update(posts)
      .set({ deletedAt: null })
      .where(eq(posts.id, postId))

    const postMediaKeys = getMediaFileKeys(existing.payload)
    if (postMediaKeys.length > 0) {
      await tx.update(mediaUploads).set({ status: 'attached', deletedAt: null })
        .where(and(eq(mediaUploads.entityType, 'post'), eq(mediaUploads.entityId, postId),
          inArray(mediaUploads.fileKey, postMediaKeys), eq(mediaUploads.status, 'deleted')))
    }

    const commentMediaKeys = restoredComments.flatMap((comment) => getMediaFileKeys(comment.payload))
    if (commentMediaKeys.length > 0) {
      await tx.update(mediaUploads).set({ status: 'attached', deletedAt: null })
        .where(and(eq(mediaUploads.entityType, 'comment'),
          inArray(mediaUploads.fileKey, commentMediaKeys),
          eq(mediaUploads.status, 'deleted')))
    }

    await tx.update(posts).set({
      commentsCount: sql`(SELECT COUNT(*)::int FROM comments WHERE post_id = ${postId} AND deleted_at IS NULL)`,
    }).where(eq(posts.id, postId))
    await tx.execute(sql`
      UPDATE comments AS root
      SET replies_count = (
        SELECT COUNT(*)::int FROM comments AS reply
        WHERE reply.parent_id = root.id AND reply.deleted_at IS NULL
      )
      WHERE root.post_id = ${postId} AND root.parent_id IS NULL AND root.deleted_at IS NULL
    `)

    return {
      success: true,
      message: 'Post restored successfully',
    }
  }

  return executor === db ? db.transaction(executeInTx) : executeInTx(executor)
}

export async function updatePostByAdmin(
  postId: bigint,
  input: UpdatePostByAdminInput
): Promise<AdminPostItem> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(posts)
      .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
      .for('update').limit(1)
    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    const resultingContent = input.content ?? existing.content
    if (resultingContent.length < 8 || ((input.isFeed ?? existing.isFeed) && resultingContent.length < 100)) {
      throw new HTTPException(400, { message: 'Post content is too short' })
    }

    const updateData: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() }
    if (input.isFeed !== undefined) updateData.isFeed = input.isFeed
    if (input.isPinned !== undefined) updateData.isPinned = input.isPinned
    if (input.content !== undefined) updateData.content = input.content
    if (input.payload !== undefined) {
      const { payload, oldFileKeys, newFileKeys } = validateMediaRemoval(
        existing.payload, input.payload, 'post'
      )
      updateData.payload = newFileKeys.length > 0 ? payload : {}
      updateData.type = newFileKeys.length > 0 ? 'media' : 'text'
      await reconcileEntityMedia(tx, {
        entityType: 'post', entityId: postId, profileId: existing.authorId,
        oldFileKeys, newFileKeys,
      })
    }

    await tx.update(posts).set(updateData).where(eq(posts.id, postId))
  })

  return getPostByIdByAdmin(postId)
}
