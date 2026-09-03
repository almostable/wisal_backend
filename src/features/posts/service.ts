import {
  eq,
  and,
  or,
  ne,
  desc,
  asc,
  isNull,
  lt,
  count,
  inArray,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { posts, type Post, type PostType, type GenderScope, type AccessLevel } from '../../db/schema/posts'
import { comments, type Comment, type CommentType } from '../../db/schema/comments'
import { userBlocks } from '../../db/schema/user-blocks'
import { postSaves } from '../../db/schema/post-saves'
import { accounts } from '../../db/schema/accounts'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { follows } from '../../db/schema/follows'
import { getAccountIdByIdentity } from '../profile/service'
import { getProfileByAccountId } from '../../lib/profile'
import {
  attachMediaFiles,
  markEntityMediaDeleted,
  reconcileEntityMedia,
} from '../uploads/service'
import type {
  CreatePostDTO,
  UpdatePostDTO,
  PinPostDTO,
  FeedQueryDTO,
  UserPostsQueryDTO,
  SavedPostsQueryDTO,
  PostResponse,
  PostAuthorInfo,
  FeedResult,
  UserPostsResult,
  SavedPostsResult,
  SaveActionResult,
  CommentResponse,
  CommentAuthorInfo,
  ReplyToUserInfo,
  CreateCommentDTO,
  ReplyCommentDTO,
  UpdateCommentDTO,
  ListCommentsQueryDTO,
  ListCommentsResult,
  DeleteCommentResult,
} from './types'

const EDIT_TIME_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const authorSelectFields = {
  authorAccount: { id: accounts.id },
  authorProfile: {
    name: profiles.name,
    avatarKey: profiles.avatarKey,
    isMale: profiles.isMale,
  },
  authorIdentity: { identity: identities.identity },
}

type AuthorSelectResult = {
  authorAccount: { id: bigint }
  authorProfile: {
    name: string | null
    avatarKey: string | null
    isMale: boolean | null
  } | null
  authorIdentity: { identity: string | null } | null
}

const viewerFollows = alias(follows, 'viewer_follows')

const replyToAccounts = alias(accounts, 'reply_to_accounts')
const replyToProfiles = alias(profiles, 'reply_to_profiles')
const replyToIdentities = alias(identities, 'reply_to_identities')

const replyToUserSelectFields = {
  replyToAccount: { id: replyToAccounts.id },
  replyToProfile: { name: replyToProfiles.name },
  replyToIdentity: { identity: replyToIdentities.identity },
}

type ReplyToUserSelectResult = {
  replyToAccount: { id: bigint | null } | null
  replyToProfile: { name: string | null } | null
  replyToIdentity: { identity: string | null } | null
}

function mapAuthor(data: AuthorSelectResult, isFollowing?: boolean): PostAuthorInfo {
  return {
    id: data.authorAccount.id,
    name: data.authorProfile?.name ?? null,
    avatarKey: data.authorProfile?.avatarKey ?? null,
    identity: data.authorIdentity?.identity ?? null,
    isMale: data.authorProfile?.isMale ?? null,
    ...(isFollowing !== undefined ? { isFollowing } : {}),
  }
}

function mapReplyToUser(data: ReplyToUserSelectResult | null | undefined): ReplyToUserInfo | null {
  if (!data || !data.replyToAccount || !data.replyToAccount.id) {
    return null
  }
  return {
    id: data.replyToAccount.id,
    name: data.replyToProfile?.name ?? null,
    identity: data.replyToIdentity?.identity ?? null,
  }
}

function formatPost(
  post: Post,
  author?: PostAuthorInfo | null,
  isSaved?: boolean,
  canViewSavesCount: boolean = false
): PostResponse {
  return {
    id: post.id,
    authorId: post.authorId,
    authorGender: post.authorGender,
    type: post.type as PostType,
    payload: (post.payload as Record<string, unknown>) ?? {},
    content: post.content,
    genderScope: post.genderScope as GenderScope,
    accessLevel: post.accessLevel as AccessLevel,
    isPinned: post.isPinned,
    ...(canViewSavesCount ? { savesCount: post.savesCount ?? 0 } : {}),
    commentsCount: post.commentsCount ?? 0,
    ...(isSaved !== undefined ? { isSaved } : {}),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: author ?? null,
  }
}

function formatComment(
  comment: Comment,
  author?: CommentAuthorInfo | null,
  replyToUser?: ReplyToUserInfo | null
): CommentResponse {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    rootId: comment.rootId ?? null,
    branchId: comment.branchId ?? null,
    parentId: comment.parentId ?? null,
    replyToUserId: comment.replyToUserId ?? null,
    replyToUser: replyToUser ?? null,
    type: comment.type as CommentType,
    payload: (comment.payload as Record<string, unknown>) ?? {},
    content: comment.content,
    repliesCount: comment.repliesCount ?? 0,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    editedAt: comment.editedAt ?? null,
    author: author ?? null,
  }
}

async function checkPostAccess(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<Post> {
  const post = await executor.query.posts.findFirst({
    where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
  })

  if (!post) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  const isAuthor = viewer.accountId === post.authorId

  if (!isAuthor) {
    const [blockRecord] = await executor
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewer.accountId),
            eq(userBlocks.blockedId, post.authorId)
          ),
          and(
            eq(userBlocks.blockerId, post.authorId),
            eq(userBlocks.blockedId, viewer.accountId)
          )
        )
      )
      .limit(1)

    if (blockRecord) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (post.genderScope === 'same_gender' && post.authorGender !== viewer.isMale) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (post.accessLevel === 'followers') { 
      const [followRecord] = await executor
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, viewer.accountId),
            eq(follows.followingId, post.authorId)
          )
        )
        .limit(1)

      if (!followRecord) {
        throw new HTTPException(404, { message: 'Post not found' })
      }
    }
  }

  return post
}

export async function createPost(
  authorAccountId: bigint,
  authorGender: boolean,
  input: CreatePostDTO
): Promise<PostResponse> {
  const isPinned = input.isPinned ?? false

  return await db.transaction(async (tx) => {
    if (isPinned) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorAccountId),
            eq(posts.isPinned, true),
            isNull(posts.deletedAt)
          )
        )
    }

    const content = input.content ? input.content.trim() : ''
    const postType = input.type ?? 'text'
    const payload = input.payload ?? {}

    const [created] = await tx
      .insert(posts)
      .values({
        authorId: authorAccountId,
        authorGender,
        type: postType,
        payload,
        content,
        genderScope: input.genderScope ?? 'all',
        accessLevel: input.accessLevel ?? 'public',
        isPinned,
      })
      .returning()

    if (!created) {
      throw new HTTPException(500, { message: 'Failed to create post' })
    }

    if (created.type === 'media') {
      const mediaItems = Array.isArray((payload as any)?.media) ? (payload as any).media : []
      const fileKeys = mediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')
      if (fileKeys.length > 0) {
        await attachMediaFiles(tx, {
          fileKeys,
          userId: authorAccountId,
          entityType: 'post',
          entityId: created.id,
        })
      }
    }

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    return formatPost(created, authorData ? mapAuthor(authorData) : null, false, true)
  })
}

export async function updatePost(
  authorAccountId: bigint,
  postId: bigint,
  input: UpdatePostDTO
): Promise<PostResponse> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.authorId !== authorAccountId) {
      throw new HTTPException(403, { message: 'You can only edit your own posts' })
    }

    if (Date.now() - existing.createdAt.getTime() > EDIT_TIME_WINDOW_MS) {
      throw new HTTPException(403, {
        message: 'Post can only be edited within 15 minutes of creation',
      })
    }

    if (input.isPinned === true) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorAccountId),
            eq(posts.isPinned, true),
            ne(posts.id, postId),
            isNull(posts.deletedAt)
          )
        )
    }

    const updateData: Partial<typeof posts.$inferInsert> = {}

    if (input.content !== undefined) {
      updateData.content = input.content ? input.content.trim() : ''
    }
    if (input.type !== undefined) {
      updateData.type = input.type
    }
    if (input.genderScope !== undefined) {
      updateData.genderScope = input.genderScope
    }
    if (input.accessLevel !== undefined) {
      updateData.accessLevel = input.accessLevel
    }
    if (input.isPinned !== undefined) {
      updateData.isPinned = input.isPinned
    }
    if (input.payload !== undefined) {
      updateData.payload = input.payload

      const oldMediaItems = Array.isArray((existing.payload as any)?.media)
        ? (existing.payload as any).media
        : []
      const oldFileKeys = oldMediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')

      const newMediaItems = Array.isArray((input.payload as any)?.media)
        ? (input.payload as any).media
        : []
      const newFileKeys = newMediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')

      if (oldFileKeys.length > 0 || newFileKeys.length > 0) {
        await reconcileEntityMedia(tx, {
          entityType: 'post',
          entityId: postId,
          userId: authorAccountId,
          newFileKeys,
          oldFileKeys,
        })
      }
    }

    const [updated] = await tx
      .update(posts)
      .set(updateData)
      .where(eq(posts.id, postId))
      .returning()

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    const [savedRecord] = await tx
      .select({ postId: postSaves.postId })
      .from(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.userId, authorAccountId)
        )
      )
      .limit(1)

    return formatPost(updated, authorData ? mapAuthor(authorData) : null, Boolean(savedRecord), true)
  })
}

export async function deletePost(
  authorAccountId: bigint,
  postId: bigint
): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.authorId !== authorAccountId) {
      throw new HTTPException(403, { message: 'You can only delete your own posts' })
    }

    await tx
      .update(posts)
      .set({
        deletedAt: new Date(),
        isPinned: false,
      })
      .where(eq(posts.id, postId))

    await markEntityMediaDeleted(tx, {
      entityType: 'post',
      entityId: postId,
    })

    await tx.execute(sql`
      UPDATE media_uploads
      SET status = 'deleted'
      WHERE entity_type = 'comment'
        AND status = 'attached'
        AND entity_id IN (
          SELECT id FROM comments WHERE post_id = ${postId}
        )
    `)

    return {
      success: true,
      message: 'Post deleted successfully',
    }
  })
}

export async function pinPost(
  authorAccountId: bigint,
  postId: bigint,
  input: PinPostDTO
): Promise<PostResponse> {
  const isPinned = input.isPinned ?? true

  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.authorId !== authorAccountId) {
      throw new HTTPException(403, { message: 'You can only pin your own posts' })
    }

    if (isPinned) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorAccountId),
            eq(posts.isPinned, true),
            ne(posts.id, postId),
            isNull(posts.deletedAt)
          )
        )
    }

    const [updated] = await tx
      .update(posts)
      .set({ isPinned })
      .where(eq(posts.id, postId))
      .returning()

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    const [savedRecord] = await tx
      .select({ postId: postSaves.postId })
      .from(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.userId, authorAccountId)
        )
      )
      .limit(1)

    return formatPost(updated, authorData ? mapAuthor(authorData) : null, Boolean(savedRecord), true)
  })
}

export async function savePost(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<SaveActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.accountId === post.authorId

    const inserted = await tx
      .insert(postSaves)
      .values({
        postId,
        userId: viewer.accountId,
      })
      .onConflictDoNothing()
      .returning()

    let currentSavesCount = post.savesCount
    if (inserted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          savesCount: sql`${posts.savesCount} + 1`,
        })
        .where(eq(posts.id, postId))
        .returning({ savesCount: posts.savesCount })

      currentSavesCount = updated?.savesCount ?? post.savesCount + 1
    }

    return {
      saved: true,
      ...(isAuthor ? { savesCount: currentSavesCount } : {}),
      message: 'Post saved successfully',
    }
  })
}

export async function unsavePost(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<SaveActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.accountId === post.authorId

    const deleted = await tx
      .delete(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.userId, viewer.accountId)
        )
      )
      .returning()

    let currentSavesCount = post.savesCount
    if (deleted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          savesCount: sql`GREATEST(0, ${posts.savesCount} - 1)`,
        })
        .where(eq(posts.id, postId))
        .returning({ savesCount: posts.savesCount })

      currentSavesCount = updated?.savesCount ?? Math.max(0, post.savesCount - 1)
    }

    return {
      saved: false,
      ...(isAuthor ? { savesCount: currentSavesCount } : {}),
      message: 'Post unsaved successfully',
    }
  })
}

export async function recordAuthorPostRead(
  readerAccountId: bigint,
  authorAccountId: bigint,
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<void> {
  await executor
    .update(follows)
    .set({ lastReadAt: sql`NOW()` })
    .where(
      and(
        eq(follows.followingId, authorAccountId),
        eq(follows.followerId, readerAccountId),
        or(
          lt(follows.lastReadAt, sql`NOW() - INTERVAL '1 day'`),
          isNull(follows.lastReadAt)
        )
      )
    )
}

export async function getPostById(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<PostResponse> {
  const post = await checkPostAccess(db, postId, viewer)

  if (viewer.accountId !== post.authorId) {
    await recordAuthorPostRead(viewer.accountId, post.authorId, db)
  }

  const [result] = await db
    .select({
      post: posts,
      ...authorSelectFields,
      isSaved: sql<boolean>`CASE WHEN ${postSaves.userId} IS NOT NULL THEN true ELSE false END`,
      isFollowingAuthor: sql<boolean>`CASE WHEN ${viewerFollows.followingId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(accounts, eq(posts.authorId, accounts.id))
    .leftJoin(profiles, eq(accounts.id, profiles.accountId))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(
      postSaves,
      and(
        eq(postSaves.postId, posts.id),
        eq(postSaves.userId, viewer.accountId)
      )
    )
    .leftJoin(
      viewerFollows,
      and(
        eq(viewerFollows.followerId, viewer.accountId),
        eq(viewerFollows.followingId, posts.authorId)
      )
    )
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1)

  if (!result || !result.post) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  return formatPost(
    result.post,
    mapAuthor(result, Boolean(result.isFollowingAuthor)),
    Boolean(result.isSaved),
    viewer.accountId === result.post.authorId
  )
}

export async function getFeed(
  viewer: { accountId: bigint; isMale: boolean },
  query: FeedQueryDTO
): Promise<FeedResult> {
  const feedType = query.feed ?? query.type ?? 'public'
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const notBlockedCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${userBlocks}
    WHERE (${userBlocks.blockerId} = ${viewer.accountId} AND ${userBlocks.blockedId} = ${posts.authorId})
       OR (${userBlocks.blockerId} = ${posts.authorId} AND ${userBlocks.blockedId} = ${viewer.accountId})
  )`

  let whereCondition: SQL

  if (feedType === 'following') {
    whereCondition = and(
      isNull(posts.deletedAt),
      notBlockedCondition,
      sql`EXISTS (
        SELECT 1 FROM ${follows}
        WHERE ${follows.followerId} = ${viewer.accountId}
          AND ${follows.followingId} = ${posts.authorId}
      )`,
      sql`(${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))`
    )!
  } else {
    whereCondition = and(
      isNull(posts.deletedAt),
      notBlockedCondition,
      sql`(${posts.authorId} = ${viewer.accountId} OR (
        (${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))
        AND
        (${posts.accessLevel} = 'public' OR EXISTS (
          SELECT 1 FROM ${follows}
          WHERE ${follows.followerId} = ${viewer.accountId}
            AND ${follows.followingId} = ${posts.authorId}
        ))
      ))`
    )!
  }

  const items = await db
    .select({
      post: posts,
      ...authorSelectFields,
      isSaved: sql<boolean>`CASE WHEN ${postSaves.userId} IS NOT NULL THEN true ELSE false END`,
      isFollowingAuthor: sql<boolean>`CASE WHEN ${viewerFollows.followingId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(accounts, eq(posts.authorId, accounts.id))
    .leftJoin(profiles, eq(accounts.id, profiles.accountId))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(
      postSaves,
      and(
        eq(postSaves.postId, posts.id),
        eq(postSaves.userId, viewer.accountId)
      )
    )
    .leftJoin(
      viewerFollows,
      and(
        eq(viewerFollows.followerId, viewer.accountId),
        eq(viewerFollows.followingId, posts.authorId)
      )
    )
    .where(whereCondition)
    .orderBy(feedType === 'following' ? desc(posts.createdAt) : sql`random()`)
    .limit(limit)
    .offset(offset)

  const formattedPosts = items.map((item) =>
    formatPost(
      item.post,
      mapAuthor(item, Boolean(item.isFollowingAuthor)),
      Boolean(item.isSaved),
      viewer.accountId === item.post.authorId
    )
  )

  return {
    posts: formattedPosts,
    limit,
    offset,
  }
}

export async function getUserPosts(
  targetIdentity: string,
  viewer: { accountId: bigint; isMale: boolean },
  query: UserPostsQueryDTO
): Promise<UserPostsResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const targetAccountId = await getAccountIdByIdentity(targetIdentity)
  if (!targetAccountId) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const targetProfile = await getProfileByAccountId(targetAccountId)
  if (!targetProfile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const isAuthor = viewer.accountId === targetAccountId

  if (!isAuthor) {
    const [blockRecord] = await db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewer.accountId),
            eq(userBlocks.blockedId, targetAccountId)
          ),
          and(
            eq(userBlocks.blockerId, targetAccountId),
            eq(userBlocks.blockedId, viewer.accountId)
          )
        )
      )
      .limit(1)

    if (blockRecord) {
      return {
        posts: [],
        total: 0,
        limit,
        offset,
      }
    }
  }

  let isFollowing = false
  if (!isAuthor) {
    const [follow] = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, viewer.accountId),
          eq(follows.followingId, targetAccountId)
        )
      )
      .limit(1)
    isFollowing = Boolean(follow)
  }

  const isSameGender = viewer.isMale === targetProfile.isMale

  const conditions: SQL[] = [
    eq(posts.authorId, targetAccountId),
    isNull(posts.deletedAt),
  ]

  if (!isAuthor) {
    if (!isSameGender) {
      conditions.push(eq(posts.genderScope, 'all'))
    }
    if (!isFollowing) {
      conditions.push(eq(posts.accessLevel, 'public'))
    }
  }

  const whereClause = and(...conditions)

  const [items, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
        ...authorSelectFields,
        isSaved: sql<boolean>`CASE WHEN ${postSaves.userId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(posts)
      .innerJoin(accounts, eq(posts.authorId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(
        postSaves,
        and(
          eq(postSaves.postId, posts.id),
          eq(postSaves.userId, viewer.accountId)
        )
      )
      .where(whereClause)
      .orderBy(desc(posts.isPinned), desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(posts)
      .where(whereClause),
  ])

  const formattedPosts = items.map((item) =>
    formatPost(
      item.post,
      mapAuthor(item, isFollowing),
      Boolean(item.isSaved),
      viewer.accountId === item.post.authorId
    )
  )

  return {
    posts: formattedPosts,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getSavedPosts(
  viewer: { accountId: bigint; isMale: boolean },
  query: SavedPostsQueryDTO
): Promise<SavedPostsResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const notBlockedCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${userBlocks}
    WHERE (${userBlocks.blockerId} = ${viewer.accountId} AND ${userBlocks.blockedId} = ${posts.authorId})
       OR (${userBlocks.blockerId} = ${posts.authorId} AND ${userBlocks.blockedId} = ${viewer.accountId})
  )`

  const whereCondition = and(
    eq(postSaves.userId, viewer.accountId),
    isNull(posts.deletedAt),
    notBlockedCondition,
    sql`(${posts.authorId} = ${viewer.accountId} OR (
      (${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))
      AND
      (${posts.accessLevel} = 'public' OR EXISTS (
        SELECT 1 FROM ${follows}
        WHERE ${follows.followerId} = ${viewer.accountId}
          AND ${follows.followingId} = ${posts.authorId}
      ))
    ))`
  )!

  const [items, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
        ...authorSelectFields,
        isFollowingAuthor: sql<boolean>`CASE WHEN ${viewerFollows.followingId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(postSaves)
      .innerJoin(posts, eq(postSaves.postId, posts.id))
      .innerJoin(accounts, eq(posts.authorId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(
        viewerFollows,
        and(
          eq(viewerFollows.followerId, viewer.accountId),
          eq(viewerFollows.followingId, posts.authorId)
        )
      )
      .where(whereCondition)
      .orderBy(desc(postSaves.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(postSaves)
      .innerJoin(posts, eq(postSaves.postId, posts.id))
      .where(whereCondition),
  ])

  const formattedPosts = items.map((item) =>
    formatPost(
      item.post,
      mapAuthor(item, Boolean(item.isFollowingAuthor)),
      true,
      viewer.accountId === item.post.authorId
    )
  )

  return {
    posts: formattedPosts,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getPostComments(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean },
  query: ListCommentsQueryDTO
): Promise<ListCommentsResult> {
  await checkPostAccess(db, postId, viewer)

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const whereClause = and(
    eq(comments.postId, postId),
    isNull(comments.rootId),
    isNull(comments.deletedAt)
  )

  const [items, totalResult] = await Promise.all([
    db
      .select({
        comment: comments,
        ...authorSelectFields,
      })
      .from(comments)
      .innerJoin(accounts, eq(comments.authorId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereClause)
      .orderBy(asc(comments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(comments)
      .where(whereClause),
  ])

  const otherAuthorIds = Array.from(
    new Set(
      items
        .map((item) => item.authorAccount.id)
        .filter((id) => id !== viewer.accountId)
    )
  )

  const blockedByViewer = new Set<bigint>()
  const blockedViewer = new Set<bigint>()

  if (otherAuthorIds.length > 0) {
    const blockRows = await db
      .select({
        blockerId: userBlocks.blockerId,
        blockedId: userBlocks.blockedId,
      })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewer.accountId),
            inArray(userBlocks.blockedId, otherAuthorIds)
          ),
          and(
            eq(userBlocks.blockedId, viewer.accountId),
            inArray(userBlocks.blockerId, otherAuthorIds)
          )
        )
      )

    for (const row of blockRows) {
      if (row.blockerId === viewer.accountId) {
        blockedByViewer.add(row.blockedId)
      } else {
        blockedViewer.add(row.blockerId)
      }
    }
  }

  const formattedComments = items.map((item) => {
    const isBlocked = blockedByViewer.has(item.authorAccount.id)
    const isHidden = blockedViewer.has(item.authorAccount.id)

    if (isBlocked || isHidden) {
      return {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        rootId: item.comment.rootId ?? null,
        branchId: item.comment.branchId ?? null,
        parentId: item.comment.parentId ?? null,
        replyToUserId: null,
        replyToUser: null,
        type: item.comment.type as CommentType,
        payload: (item.comment.payload as Record<string, unknown>) ?? {},
        content: item.comment.content,
        repliesCount: item.comment.repliesCount ?? 0,
        createdAt: item.comment.createdAt,
        updatedAt: item.comment.updatedAt,
        editedAt: item.comment.editedAt ?? null,
        author: {
          id: item.authorAccount.id,
          name: item.authorProfile?.name ?? null,
          avatarKey: null,
          identity: item.authorIdentity?.identity ?? null,
          isMale: item.authorProfile?.isMale ?? null,
          ...(isBlocked ? { isBlocked: true } : {}),
          ...(isHidden ? { isHidden: true } : {}),
        },
        ...(isBlocked ? { isBlocked: true } : {}),
        ...(isHidden ? { isHidden: true } : {}),
      }
    }

    return formatComment(item.comment, mapAuthor(item), null)
  })

  return {
    comments: formattedComments,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getCommentReplies(
  commentId: bigint,
  viewer: { accountId: bigint; isMale: boolean },
  query: ListCommentsQueryDTO
): Promise<ListCommentsResult> {
  const targetComment = await db.query.comments.findFirst({
    where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
  })

  if (!targetComment) {
    throw new HTTPException(404, { message: 'Comment not found' })
  }

  await checkPostAccess(db, targetComment.postId, viewer)

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  if (targetComment.branchId !== null) {
    return {
      comments: [],
      total: 0,
      limit,
      offset,
    }
  }

  const whereClause = targetComment.rootId === null
    ? and(
        eq(comments.rootId, targetComment.id),
        isNull(comments.branchId),
        isNull(comments.deletedAt)
      )
    : and(
        eq(comments.branchId, targetComment.id),
        isNull(comments.deletedAt)
      )

  const [items, totalResult] = await Promise.all([
    db
      .select({
        comment: comments,
        ...authorSelectFields,
        ...replyToUserSelectFields,
      })
      .from(comments)
      .innerJoin(accounts, eq(comments.authorId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(replyToAccounts, eq(comments.replyToUserId, replyToAccounts.id))
      .leftJoin(replyToProfiles, eq(replyToAccounts.id, replyToProfiles.accountId))
      .leftJoin(replyToIdentities, eq(replyToProfiles.identityId, replyToIdentities.id))
      .where(whereClause)
      .orderBy(asc(comments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(comments)
      .where(whereClause),
  ])

  const otherAuthorIds = Array.from(
    new Set(
      items
        .map((item) => item.authorAccount.id)
        .filter((id) => id !== viewer.accountId)
    )
  )

  const blockedByViewer = new Set<bigint>()
  const blockedViewer = new Set<bigint>()

  if (otherAuthorIds.length > 0) {
    const blockRows = await db
      .select({
        blockerId: userBlocks.blockerId,
        blockedId: userBlocks.blockedId,
      })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewer.accountId),
            inArray(userBlocks.blockedId, otherAuthorIds)
          ),
          and(
            eq(userBlocks.blockedId, viewer.accountId),
            inArray(userBlocks.blockerId, otherAuthorIds)
          )
        )
      )

    for (const row of blockRows) {
      if (row.blockerId === viewer.accountId) {
        blockedByViewer.add(row.blockedId)
      } else {
        blockedViewer.add(row.blockerId)
      }
    }
  }

  const formattedReplies = items.map((item) => {
    const isBlocked = blockedByViewer.has(item.authorAccount.id)
    const isHidden = blockedViewer.has(item.authorAccount.id)
    const mappedReplyToUser = mapReplyToUser(item)

    if (isBlocked || isHidden) {
      return {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        rootId: item.comment.rootId ?? null,
        branchId: item.comment.branchId ?? null,
        parentId: item.comment.parentId ?? null,
        replyToUserId: item.comment.replyToUserId ?? null,
        replyToUser: mappedReplyToUser,
        type: item.comment.type as CommentType,
        payload: (item.comment.payload as Record<string, unknown>) ?? {},
        content: item.comment.content,
        repliesCount: item.comment.repliesCount ?? 0,
        createdAt: item.comment.createdAt,
        updatedAt: item.comment.updatedAt,
        editedAt: item.comment.editedAt ?? null,
        author: {
          id: item.authorAccount.id,
          name: item.authorProfile?.name ?? null,
          avatarKey: null,
          identity: item.authorIdentity?.identity ?? null,
          isMale: item.authorProfile?.isMale ?? null,
          ...(isBlocked ? { isBlocked: true } : {}),
          ...(isHidden ? { isHidden: true } : {}),
        },
        ...(isBlocked ? { isBlocked: true } : {}),
        ...(isHidden ? { isHidden: true } : {}),
      }
    }

    return formatComment(item.comment, mapAuthor(item), mappedReplyToUser)
  })

  return {
    comments: formattedReplies,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function createComment(
  postId: bigint,
  authorAccountId: bigint,
  viewer: { accountId: bigint; isMale: boolean },
  input: CreateCommentDTO
): Promise<CommentResponse> {
  return await db.transaction(async (tx) => {
    await checkPostAccess(tx, postId, viewer)

    let rootId: bigint | null = null
    let branchId: bigint | null = null
    let parentId: bigint | null = null
    let replyToUserId: bigint | null = null

    if (input.parentId) {
      const targetComment = await tx.query.comments.findFirst({
        where: and(
          eq(comments.id, input.parentId),
          isNull(comments.deletedAt)
        ),
      })

      if (!targetComment || targetComment.postId !== postId) {
        throw new HTTPException(404, { message: 'Parent comment not found' })
      }

      parentId = targetComment.id
      replyToUserId = targetComment.authorId

      if (targetComment.rootId === null) {
        rootId = targetComment.id
        branchId = null
      } else if (targetComment.branchId === null) {
        rootId = targetComment.rootId
        branchId = targetComment.id
      } else {
        rootId = targetComment.rootId
        branchId = targetComment.branchId
      }

      const targetAuthorIds: bigint[] = [targetComment.authorId]
      if (rootId && rootId !== targetComment.id) {
        const rootComment = await tx.query.comments.findFirst({
          where: and(
            eq(comments.id, rootId),
            isNull(comments.deletedAt)
          ),
        })
        if (rootComment && !targetAuthorIds.includes(rootComment.authorId)) {
          targetAuthorIds.push(rootComment.authorId)
        }
      }
      if (branchId && branchId !== targetComment.id && branchId !== rootId) {
        const branchComment = await tx.query.comments.findFirst({
          where: and(
            eq(comments.id, branchId),
            isNull(comments.deletedAt)
          ),
        })
        if (branchComment && !targetAuthorIds.includes(branchComment.authorId)) {
          targetAuthorIds.push(branchComment.authorId)
        }
      }

      const otherTargetAuthorIds = targetAuthorIds.filter((id) => id !== authorAccountId)

      if (otherTargetAuthorIds.length > 0) {
        const [blockRecord] = await tx
          .select({ blockerId: userBlocks.blockerId })
          .from(userBlocks)
          .where(
            or(
              and(
                eq(userBlocks.blockerId, authorAccountId),
                inArray(userBlocks.blockedId, otherTargetAuthorIds)
              ),
              and(
                inArray(userBlocks.blockerId, otherTargetAuthorIds),
                eq(userBlocks.blockedId, authorAccountId)
              )
            )
          )
          .limit(1)

        if (blockRecord) {
          throw new HTTPException(400, { message: 'Cannot reply to a blocked user' })
        }
      }

      await tx
        .update(comments)
        .set({
          repliesCount: sql`${comments.repliesCount} + 1`,
        })
        .where(eq(comments.id, rootId))

      if (branchId) {
        await tx
          .update(comments)
          .set({
            repliesCount: sql`${comments.repliesCount} + 1`,
          })
          .where(eq(comments.id, branchId))
      }
    }

    const content = input.content ? input.content.trim() : ''
    const commentType = input.type ?? 'text'
    const payload = input.payload ?? {}

    const [created] = await tx
      .insert(comments)
      .values({
        postId,
        authorId: authorAccountId,
        rootId,
        branchId,
        parentId,
        replyToUserId,
        type: commentType,
        payload,
        content,
      })
      .returning()

    if (!created) {
      throw new HTTPException(500, { message: 'Failed to create comment' })
    }

    if (created.type === 'media') {
      const mediaItems = Array.isArray((payload as any)?.media) ? (payload as any).media : []
      const fileKeys = mediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')
      if (fileKeys.length > 0) {
        await attachMediaFiles(tx, {
          fileKeys,
          userId: authorAccountId,
          entityType: 'comment',
          entityId: created.id,
        })
      }
    }

    await tx
      .update(posts)
      .set({
        commentsCount: sql`${posts.commentsCount} + 1`,
      })
      .where(eq(posts.id, postId))

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    let replyToUserData: ReplyToUserInfo | null = null
    if (replyToUserId) {
      const [replyToRow] = await tx
        .select({
          account: { id: accounts.id },
          profile: { name: profiles.name },
          identity: { identity: identities.identity },
        })
        .from(accounts)
        .leftJoin(profiles, eq(accounts.id, profiles.accountId))
        .leftJoin(identities, eq(profiles.identityId, identities.id))
        .where(eq(accounts.id, replyToUserId))
        .limit(1)

      if (replyToRow) {
        replyToUserData = {
          id: replyToRow.account.id,
          name: replyToRow.profile?.name ?? null,
          identity: replyToRow.identity?.identity ?? null,
        }
      }
    }

    return formatComment(
      created,
      authorData ? mapAuthor(authorData) : null,
      replyToUserData
    )
  })
}

export async function replyToComment(
  commentId: bigint,
  authorAccountId: bigint,
  viewer: { accountId: bigint; isMale: boolean },
  input: ReplyCommentDTO
): Promise<CommentResponse> {
  return await db.transaction(async (tx) => {
    const parentComment = await tx.query.comments.findFirst({
      where: and(
        eq(comments.id, commentId),
        isNull(comments.deletedAt)
      ),
    })

    if (!parentComment) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    return await createComment(
      parentComment.postId,
      authorAccountId,
      viewer,
      {
        content: input.content,
        parentId: commentId,
        type: input.type,
        payload: input.payload,
      }
    )
  })
}

export async function deleteComment(
  authorAccountId: bigint,
  commentId: bigint
): Promise<DeleteCommentResult> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.authorId !== authorAccountId) {
      throw new HTTPException(403, { message: 'You can only delete your own comments' })
    }

    await tx
      .update(comments)
      .set({
        deletedAt: new Date(),
      })
      .where(eq(comments.id, commentId))

    await tx
      .update(posts)
      .set({
        commentsCount: sql`GREATEST(0, ${posts.commentsCount} - 1)`,
      })
      .where(eq(posts.id, existing.postId))

    if (existing.rootId) {
      await tx
        .update(comments)
        .set({
          repliesCount: sql`GREATEST(0, ${comments.repliesCount} - 1)`,
        })
        .where(eq(comments.id, existing.rootId))
    }

    if (existing.branchId) {
      await tx
        .update(comments)
        .set({
          repliesCount: sql`GREATEST(0, ${comments.repliesCount} - 1)`,
        })
        .where(eq(comments.id, existing.branchId))
    }

    await markEntityMediaDeleted(tx, {
      entityType: 'comment',
      entityId: commentId,
    })

    return {
      success: true,
      message: 'Comment deleted successfully',
    }
  })
}

export async function updateComment(
  authorAccountId: bigint,
  commentId: bigint,
  input: UpdateCommentDTO
): Promise<CommentResponse> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.authorId !== authorAccountId) {
      throw new HTTPException(403, { message: 'You can only edit your own comments' })
    }

    if (Date.now() - existing.createdAt.getTime() > EDIT_TIME_WINDOW_MS) {
      throw new HTTPException(403, {
        message: 'Comment can only be edited within 15 minutes of creation',
      })
    }

    const updateData: Partial<typeof comments.$inferInsert> = {
      updatedAt: new Date(),
      editedAt: new Date(),
    }

    if (input.content !== undefined) {
      updateData.content = input.content ? input.content.trim() : ''
    }
    if (input.payload !== undefined) {
      updateData.payload = input.payload

      const oldMediaItems = Array.isArray((existing.payload as any)?.media)
        ? (existing.payload as any).media
        : []
      const oldFileKeys = oldMediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')

      const newMediaItems = Array.isArray((input.payload as any)?.media)
        ? (input.payload as any).media
        : []
      const newFileKeys = newMediaItems
        .map((m: any) => m.fileKey)
        .filter((k: any): k is string => typeof k === 'string')

      if (oldFileKeys.length > 0 || newFileKeys.length > 0) {
        await reconcileEntityMedia(tx, {
          entityType: 'comment',
          entityId: commentId,
          userId: authorAccountId,
          newFileKeys,
          oldFileKeys,
        })
      }
    }

    const [updated] = await tx
      .update(comments)
      .set(updateData)
      .where(eq(comments.id, commentId))
      .returning()

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    let replyToUserData: ReplyToUserInfo | null = null
    if (updated.replyToUserId) {
      const [replyToRow] = await tx
        .select({
          account: { id: accounts.id },
          profile: { name: profiles.name },
          identity: { identity: identities.identity },
        })
        .from(accounts)
        .leftJoin(profiles, eq(accounts.id, profiles.accountId))
        .leftJoin(identities, eq(profiles.identityId, identities.id))
        .where(eq(accounts.id, updated.replyToUserId))
        .limit(1)

      if (replyToRow) {
        replyToUserData = {
          id: replyToRow.account.id,
          name: replyToRow.profile?.name ?? null,
          identity: replyToRow.identity?.identity ?? null,
        }
      }
    }

    return formatComment(
      updated,
      authorData ? mapAuthor(authorData) : null,
      replyToUserData
    )
  })
}
