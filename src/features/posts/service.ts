import {
  eq,
  and,
  or,
  ne,
  desc,
  asc,
  isNull,
  isNotNull,
  lt,
  gt,
  gte,
  count,
  inArray,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import {
  posts,
  type Post,
  type PostType,
  type GenderScope,
} from '../../db/schema/posts'
import { comments, type Comment, type CommentType } from '../../db/schema/comments'
import { profileBlocks } from '../../db/schema/profile-blocks'
import { postSaves } from '../../db/schema/post-saves'
import { postLikes } from '../../db/schema/post-likes'
import { accounts } from '../../db/schema/accounts'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { readers } from '../../db/schema/readers'
import { postViews } from '../../db/schema/post-views'
import { getProfileByIdentity } from '../../lib/profile'
import {
  attachMediaFiles,
  markEntityMediaDeleted,
  reconcileEntityMedia,
} from '../uploads/service'
import { createNotification } from '../notifications/service'
import { CONTENT_EDIT_WINDOW_MS, MAX_FEED_POSTS_PER_24_HOURS } from '../../config/constants'
import type {
  CreatePostDTO,
  UpdatePostDTO,
  PinPostDTO,
  UserPostsQueryDTO,
  SavedPostsQueryDTO,
  PostResponse,
  PostAuthorInfo,
  UserPostsResult,
  SavedPostsResult,
  SaveActionResult,
  LikeActionResult,
  CommentResponse,
  CommentAuthorInfo,
  ReplyToProfileInfo,
  CreateCommentDTO,
  UpdateCommentDTO,
  ListCommentsQueryDTO,
  ListCommentsResult,
  DeleteCommentResult,
  RecordViewsResult,
  FeedQueryDTO,
  FeedPostsResult,
} from './types'


const authorSelectFields = {
  authorProfile: {
    id: profiles.id,
    name: profiles.name,
    avatarKey: profiles.avatarKey,
    isMale: profiles.isMale,
    verifiedAt: profiles.verifiedAt,
  },
  authorAccount: { deletedAt: accounts.deletedAt },
  authorIdentity: { identity: identities.identity },
}

type AuthorSelectResult = {
  authorProfile: {
    id: bigint
    name: string | null
    avatarKey: string | null
    isMale: boolean | null
    verifiedAt?: Date | null
  } | null
  authorAccount: { deletedAt?: Date | null } | null
  authorIdentity: { identity: string | null } | null
}

const viewerReaders = alias(readers, 'viewer_readers')

const replyToProfiles = alias(profiles, 'reply_to_profiles')
const replyToAccounts = alias(accounts, 'reply_to_accounts')
const replyToIdentities = alias(identities, 'reply_to_identities')

const replyToProfileSelectFields = {
  replyToProfile: { id: replyToProfiles.id, name: replyToProfiles.name },
  replyToAccount: { deletedAt: replyToAccounts.deletedAt },
  replyToIdentity: { identity: replyToIdentities.identity },
}

type ReplyToProfileSelectResult = {
  replyToProfile: { id: bigint; name: string | null } | null
  replyToAccount: { deletedAt?: Date | null } | null
  replyToIdentity: { identity: string | null } | null
}

function mapAuthor(
  data: AuthorSelectResult,
  isReading?: boolean,
  isPublicGuest: boolean = false
): PostAuthorInfo {
  const isDeleted = Boolean(data.authorAccount?.deletedAt)
  if (isDeleted || !data.authorProfile) {
    return {
      id: data.authorProfile?.id ?? 0n,
      name: null,
      identity: null,
      avatarKey: null,
      isVerified: false,
      ...(isPublicGuest ? {} : { isMale: null }),
      isDeleted: true,
    }
  }

  if (isPublicGuest) {
    return {
      name: data.authorProfile.name ?? null,
      avatarKey: data.authorProfile.isMale === true ? (data.authorProfile.avatarKey ?? null) : null,
      identity: data.authorIdentity?.identity ?? null,
      isVerified: Boolean(data.authorProfile.verifiedAt),
    }
  }

  return {
    id: data.authorProfile.id,
    name: data.authorProfile.name ?? null,
    avatarKey: data.authorProfile.avatarKey ?? null,
    identity: data.authorIdentity?.identity ?? null,
    isMale: data.authorProfile.isMale ?? null,
    isVerified: Boolean(data.authorProfile.verifiedAt),
    ...(isReading !== undefined ? { isReading } : {}),
  }
}

function mapReplyToProfile(data: ReplyToProfileSelectResult | null | undefined): ReplyToProfileInfo | null {
  if (!data || !data.replyToProfile || !data.replyToProfile.id) {
    return null
  }
  const isDeleted = Boolean(data.replyToAccount?.deletedAt)
  if (isDeleted) {
    return {
      id: data.replyToProfile.id,
      name: null,
      identity: null,
      isDeleted: true,
    }
  }
  return {
    id: data.replyToProfile.id,
    name: data.replyToProfile.name ?? null,
    identity: data.replyToIdentity?.identity ?? null,
  }
}

function mapCommentAuthor(
  data: AuthorSelectResult,
  isBlocked?: boolean,
  isHidden?: boolean
): CommentAuthorInfo {
  const isDeleted = Boolean(data.authorAccount?.deletedAt)
  if (isDeleted || !data.authorProfile) {
    return {
      id: data.authorProfile?.id ?? 0n,
      name: null,
      identity: null,
      avatarKey: null,
      isMale: null,
      isDeleted: true,
      ...(isBlocked ? { isBlocked: true } : {}),
      ...(isHidden ? { isHidden: true } : {}),
    }
  }

  const isRestricted = Boolean(isBlocked || isHidden)

  return {
    id: data.authorProfile.id,
    name: data.authorProfile.name ?? null,
    avatarKey: isRestricted ? null : (data.authorProfile.avatarKey ?? null),
    identity: data.authorIdentity?.identity ?? null,
    isMale: data.authorProfile.isMale ?? null,
    ...(isBlocked ? { isBlocked: true } : {}),
    ...(isHidden ? { isHidden: true } : {}),
  }
}

function formatPost(
  post: Post,
  author?: PostAuthorInfo | null,
  isSaved?: boolean,
  canViewAuthorCounts: boolean = false,
  isLiked?: boolean
): PostResponse {
  return {
    id: post.id,
    authorId: post.authorId,
    type: post.type as PostType,
    payload: (post.payload as Record<string, unknown>) ?? {},
    content: post.content,
    genderScope: post.genderScope as GenderScope,
    isFeed: post.isFeed ?? false,
    isPinned: post.isPinned,
    ...(canViewAuthorCounts
      ? {
          savesCount: post.savesCount ?? 0,
          likesCount: post.likesCount ?? 0,
          viewsCount: post.viewsCount ?? 0,
        }
      : {}),
    commentsCount: post.commentsCount ?? 0,
    ...(isSaved !== undefined ? { isSaved } : {}),
    ...(isLiked !== undefined ? { isLiked } : {}),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    editedAt: post.editedAt ?? null,
    ...(author !== undefined ? { author } : {}),
  }
}

function formatComment(
  comment: Comment,
  author?: CommentAuthorInfo | null,
  replyToProfile?: ReplyToProfileInfo | null
): CommentResponse {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    parentId: comment.parentId ?? null,
    replyToCommentId: comment.replyToCommentId ?? null,
    replyToProfile: replyToProfile ?? null,
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
  viewer?: { profileId: bigint; isMale: boolean } | null
): Promise<Post> {
  const post = await executor.query.posts.findFirst({
    where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
  })

  if (!post) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  if (!viewer) {
    if (post.genderScope !== 'all') {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    const [authorRecord] = await executor
      .select({
        deletedAt: accounts.deletedAt,
        name: profiles.name,
        identityId: profiles.identityId,
      })
      .from(profiles)
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, post.authorId))
      .limit(1)

    if (!authorRecord || authorRecord.deletedAt || !authorRecord.name || !authorRecord.identityId) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    return post
  }

  const isAuthor = viewer.profileId === post.authorId

  if (!isAuthor) {
    const [blockRecord] = await executor
      .select({ blockerProfileId: profileBlocks.blockerProfileId })
      .from(profileBlocks)
      .where(
        or(
          and(
            eq(profileBlocks.blockerProfileId, viewer.profileId),
            eq(profileBlocks.blockedProfileId, post.authorId)
          ),
          and(
            eq(profileBlocks.blockerProfileId, post.authorId),
            eq(profileBlocks.blockedProfileId, viewer.profileId)
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
  }

  return post
}

export async function createPost(
  authorProfileId: bigint,
  authorGender: boolean,
  input: CreatePostDTO
): Promise<PostResponse> {
  const isPinned = input.isPinned ?? false
  const isFeed = input.isFeed ?? input.showInFeed ?? false

  return await db.transaction(async (tx) => {
    await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, authorProfileId))
      .for('update')

    if (isFeed) {
      const [recentFeedCount] = await tx
        .select({ count: count() })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, authorProfileId),
            eq(posts.isFeed, true),
            isNull(posts.deletedAt),
            gte(posts.createdAt, sql`NOW() - INTERVAL '24 HOURS'`)
          )
        )

      if ((recentFeedCount?.count ?? 0) >= MAX_FEED_POSTS_PER_24_HOURS) {
        throw new HTTPException(429, {
          message: `You can only publish to the feed up to ${MAX_FEED_POSTS_PER_24_HOURS} times every 24 hours`,
        })
      }
    }

    if (isPinned) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorProfileId),
            eq(posts.isPinned, true),
            isNull(posts.deletedAt)
          )
        )
    }

    const content = input.content ? input.content.trim() : ''
    if (content.length < 8) {
      throw new HTTPException(400, { message: 'Content must be at least 8 characters' })
    }
    if (isFeed && content.length < 100) {
      throw new HTTPException(400, {
        message: 'Posts published to the public feed must contain at least 100 characters',
      })
    }
    const postType = input.type ?? 'text'
    const payload = input.payload ?? {}
    const genderScope = input.genderScope ?? 'all'

    const [created] = await tx
      .insert(posts)
      .values({
        authorId: authorProfileId,
        authorGender,
        type: postType,
        payload,
        content,
        genderScope,
        isFeed,
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
          profileId: authorProfileId,
          entityType: 'post',
          entityId: created.id,
        })
      }
    }

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, authorProfileId))
      .limit(1)

    return formatPost(created, authorData ? mapAuthor(authorData) : null, false, true, false)
  })
}

export async function updatePost(
  authorProfileId: bigint,
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

    if (existing.authorId !== authorProfileId) {
      throw new HTTPException(403, { message: 'You can only edit your own posts' })
    }

    if (Date.now() - existing.createdAt.getTime() > CONTENT_EDIT_WINDOW_MS) {
      throw new HTTPException(403, {
        message: 'Post can only be edited within 15 minutes of creation',
      })
    }

    const targetIsFeed =
      input.isFeed !== undefined
        ? input.isFeed
        : input.showInFeed !== undefined
          ? input.showInFeed
          : existing.isFeed

    if ((targetIsFeed && !existing.isFeed) || input.isPinned === true) {
      await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, authorProfileId))
        .for('update')
    }

    if (targetIsFeed && !existing.isFeed) {
      const [recentFeedCount] = await tx
        .select({ count: count() })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, authorProfileId),
            eq(posts.isFeed, true),
            ne(posts.id, postId),
            isNull(posts.deletedAt),
            gte(posts.createdAt, sql`NOW() - INTERVAL '24 HOURS'`)
          )
        )

      if ((recentFeedCount?.count ?? 0) >= MAX_FEED_POSTS_PER_24_HOURS) {
        throw new HTTPException(429, {
          message: `You can only publish to the feed up to ${MAX_FEED_POSTS_PER_24_HOURS} times every 24 hours`,
        })
      }
    }

    if (input.isPinned === true) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorProfileId),
            eq(posts.isPinned, true),
            ne(posts.id, postId),
            isNull(posts.deletedAt)
          )
        )
    }

    const resultingContent =
      input.content !== undefined
        ? input.content
          ? input.content.trim()
          : ''
        : existing.content

    if (input.content !== undefined && resultingContent.length < 8) {
      throw new HTTPException(400, { message: 'Content must be at least 8 characters' })
    }

    if (targetIsFeed && resultingContent.length < 100) {
      throw new HTTPException(400, {
        message: 'Posts published to the public feed must contain at least 100 characters',
      })
    }

    const updateData: Partial<typeof posts.$inferInsert> = {
      updatedAt: new Date(),
      editedAt: new Date(),
    }

    if (input.content !== undefined) {
      updateData.content = resultingContent
    }
    if (input.type !== undefined) {
      updateData.type = input.type
    }
    if (input.genderScope !== undefined) {
      updateData.genderScope = input.genderScope
    }
    if (input.isPinned !== undefined) {
      updateData.isPinned = input.isPinned
    }
    if (input.isFeed !== undefined || input.showInFeed !== undefined) {
      updateData.isFeed = targetIsFeed
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
          profileId: authorProfileId,
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
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, authorProfileId))
      .limit(1)

    const [savedRecord] = await tx
      .select({ postId: postSaves.postId })
      .from(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.profileId, authorProfileId)
        )
      )
      .limit(1)

    const [likedRecord] = await tx
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.profileId, authorProfileId)
        )
      )
      .limit(1)

    return formatPost(
      updated,
      authorData ? mapAuthor(authorData) : null,
      Boolean(savedRecord),
      true,
      Boolean(likedRecord)
    )
  })
}

export async function deletePost(
  authorProfileId: bigint,
  postId: bigint
): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.authorId !== authorProfileId) {
      throw new HTTPException(403, { message: 'You can only delete your own posts' })
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
  authorProfileId: bigint,
  postId: bigint,
  input: PinPostDTO
): Promise<PostResponse> {
  const isPinned = input.isPinned ?? true

  return await db.transaction(async (tx) => {
    await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, authorProfileId))
      .for('update')

    const existing = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (existing.authorId !== authorProfileId) {
      throw new HTTPException(403, { message: 'You can only pin your own posts' })
    }

    if (isPinned) {
      await tx
        .update(posts)
        .set({ isPinned: false })
        .where(
          and(
            eq(posts.authorId, authorProfileId),
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
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, authorProfileId))
      .limit(1)

    const [savedRecord] = await tx
      .select({ postId: postSaves.postId })
      .from(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.profileId, authorProfileId)
        )
      )
      .limit(1)

    const [likedRecord] = await tx
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.profileId, authorProfileId)
        )
      )
      .limit(1)

    return formatPost(
      updated,
      authorData ? mapAuthor(authorData) : null,
      Boolean(savedRecord),
      true,
      Boolean(likedRecord)
    )
  })
}

export async function savePost(
  postId: bigint,
  viewer: { profileId: bigint; isMale: boolean }
): Promise<SaveActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.profileId === post.authorId

    const inserted = await tx
      .insert(postSaves)
      .values({
        postId,
        profileId: viewer.profileId,
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
  viewer: { profileId: bigint; isMale: boolean }
): Promise<SaveActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.profileId === post.authorId

    const deleted = await tx
      .delete(postSaves)
      .where(
        and(
          eq(postSaves.postId, postId),
          eq(postSaves.profileId, viewer.profileId)
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

export async function likePost(
  postId: bigint,
  viewer: { profileId: bigint; isMale: boolean }
): Promise<LikeActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.profileId === post.authorId

    const inserted = await tx
      .insert(postLikes)
      .values({
        postId,
        profileId: viewer.profileId,
      })
      .onConflictDoNothing()
      .returning()

    let currentLikesCount = post.likesCount
    if (inserted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          likesCount: sql`${posts.likesCount} + 1`,
        })
        .where(eq(posts.id, postId))
        .returning({ likesCount: posts.likesCount })

      currentLikesCount = updated?.likesCount ?? post.likesCount + 1
    }

    return {
      liked: true,
      ...(isAuthor ? { likesCount: currentLikesCount } : {}),
      message: 'Post liked successfully',
    }
  })
}

export async function unlikePost(
  postId: bigint,
  viewer: { profileId: bigint; isMale: boolean }
): Promise<LikeActionResult> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)
    const isAuthor = viewer.profileId === post.authorId

    const deleted = await tx
      .delete(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.profileId, viewer.profileId)
        )
      )
      .returning()

    let currentLikesCount = post.likesCount
    if (deleted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          likesCount: sql`GREATEST(0, ${posts.likesCount} - 1)`,
        })
        .where(eq(posts.id, postId))
        .returning({ likesCount: posts.likesCount })

      currentLikesCount = updated?.likesCount ?? Math.max(0, post.likesCount - 1)
    }

    return {
      liked: false,
      ...(isAuthor ? { likesCount: currentLikesCount } : {}),
      message: 'Post unliked successfully',
    }
  })
}

export async function recordAuthorPostRead(
  readerProfileId: bigint,
  authorProfileId: bigint,
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<void> {
  await executor
    .update(readers)
    .set({
      lastReadAt: new Date(),
    })
    .where(
      and(
        eq(readers.authorProfileId, authorProfileId),
        eq(readers.readerProfileId, readerProfileId),
        or(
          lt(readers.lastReadAt, sql`NOW() - INTERVAL '1 day'`),
          isNull(readers.lastReadAt)
        )
      )
    )
}

export async function getPostById(
  postId: bigint,
  viewer?: { profileId: bigint; isMale: boolean } | null
): Promise<PostResponse> {
  const post = await checkPostAccess(db, postId, viewer)

  if (!viewer) {
    const [result] = await db
      .select({
        post: posts,
        ...authorSelectFields,
      })
      .from(posts)
      .innerJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(posts.id, postId))
      .limit(1)

    return formatPost(
      result.post,
      mapAuthor(result, undefined, true),
      undefined,
      false,
      undefined
    )
  }

  if (viewer.profileId !== post.authorId) {
    await recordAuthorPostRead(viewer.profileId, post.authorId)
  }

  const [result] = await db
    .select({
      post: posts,
      ...authorSelectFields,
      isSaved: sql<boolean>`CASE WHEN ${postSaves.profileId} IS NOT NULL THEN true ELSE false END`,
      isLiked: sql<boolean>`CASE WHEN ${postLikes.profileId} IS NOT NULL THEN true ELSE false END`,
      isReadingAuthor: sql<boolean>`CASE WHEN ${viewerReaders.authorProfileId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(profiles, eq(posts.authorId, profiles.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(
      postSaves,
      and(
        eq(postSaves.postId, posts.id),
        eq(postSaves.profileId, viewer.profileId)
      )
    )
    .leftJoin(
      postLikes,
      and(
        eq(postLikes.postId, posts.id),
        eq(postLikes.profileId, viewer.profileId)
      )
    )
    .leftJoin(
      viewerReaders,
      and(
        eq(viewerReaders.readerProfileId, viewer.profileId),
        eq(viewerReaders.authorProfileId, posts.authorId)
      )
    )
    .where(eq(posts.id, postId))
    .limit(1)

  return formatPost(
    result.post,
    mapAuthor(result, Boolean(result.isReadingAuthor), false),
    Boolean(result.isSaved),
    viewer.profileId === result.post.authorId,
    Boolean(result.isLiked)
  )
}

export async function getUserPosts(
  targetIdentity: string,
  viewer: { profileId: bigint; isMale: boolean },
  query: UserPostsQueryDTO
): Promise<UserPostsResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const targetProfile = await getProfileByIdentity(targetIdentity)
  if (!targetProfile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  const isAuthor = viewer.profileId === targetProfile.id

  if (!isAuthor) {
    const [blockRecord] = await db
      .select({ blockerProfileId: profileBlocks.blockerProfileId })
      .from(profileBlocks)
      .where(
        or(
          and(
            eq(profileBlocks.blockerProfileId, viewer.profileId),
            eq(profileBlocks.blockedProfileId, targetProfile.id)
          ),
          and(
            eq(profileBlocks.blockerProfileId, targetProfile.id),
            eq(profileBlocks.blockedProfileId, viewer.profileId)
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

  const isSameGender = viewer.isMale === targetProfile.isMale

  const conditions: SQL[] = [
    eq(posts.authorId, targetProfile.id),
    isNull(posts.deletedAt),
  ]

  if (!isAuthor) {
    if (!isSameGender) {
      conditions.push(eq(posts.genderScope, 'all'))
    }
  }

  const whereCondition = and(...conditions)!

  const [items, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
        isSaved: sql<boolean>`CASE WHEN ${postSaves.profileId} IS NOT NULL THEN true ELSE false END`,
        isLiked: sql<boolean>`CASE WHEN ${postLikes.profileId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(posts)
      .leftJoin(
        postSaves,
        and(
          eq(postSaves.postId, posts.id),
          eq(postSaves.profileId, viewer.profileId)
        )
      )
      .leftJoin(
        postLikes,
        and(
          eq(postLikes.postId, posts.id),
          eq(postLikes.profileId, viewer.profileId)
        )
      )
      .where(whereCondition)
      .orderBy(desc(posts.isPinned), desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(posts)
      .where(whereCondition),
  ])

  const formattedPosts = items.map((item) =>
    formatPost(
      item.post,
      undefined,
      Boolean(item.isSaved),
      isAuthor,
      Boolean(item.isLiked)
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
  viewer: { profileId: bigint; isMale: boolean },
  query: SavedPostsQueryDTO
): Promise<SavedPostsResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const notBlockedCondition = sql`NOT EXISTS (
    SELECT 1 FROM ${profileBlocks}
    WHERE (${profileBlocks.blockerProfileId} = ${viewer.profileId} AND ${profileBlocks.blockedProfileId} = ${posts.authorId})
       OR (${profileBlocks.blockerProfileId} = ${posts.authorId} AND ${profileBlocks.blockedProfileId} = ${viewer.profileId})
  )`

  const whereCondition = and(
    eq(postSaves.profileId, viewer.profileId),
    isNull(posts.deletedAt),
    notBlockedCondition,
    sql`(${posts.authorId} = ${viewer.profileId} OR (${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale})))`
  )!

  const [items, totalResult] = await Promise.all([
    db
      .select({
        post: posts,
        ...authorSelectFields,
        isReadingAuthor: sql<boolean>`CASE WHEN ${viewerReaders.authorProfileId} IS NOT NULL THEN true ELSE false END`,
        isLiked: sql<boolean>`CASE WHEN ${postLikes.profileId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(postSaves)
      .innerJoin(posts, eq(postSaves.postId, posts.id))
      .innerJoin(profiles, eq(posts.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(
        viewerReaders,
        and(
          eq(viewerReaders.readerProfileId, viewer.profileId),
          eq(viewerReaders.authorProfileId, posts.authorId)
        )
      )
      .leftJoin(
        postLikes,
        and(
          eq(postLikes.postId, posts.id),
          eq(postLikes.profileId, viewer.profileId)
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
      mapAuthor(item, Boolean(item.isReadingAuthor)),
      true,
      viewer.profileId === item.post.authorId,
      Boolean(item.isLiked)
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
  viewer: { profileId: bigint; isMale: boolean },
  query: ListCommentsQueryDTO
): Promise<ListCommentsResult> {
  await checkPostAccess(db, postId, viewer)

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const whereClause = and(
    eq(comments.postId, postId),
    isNull(comments.deletedAt)
  )

  const [items, totalResult] = await Promise.all([
    db
      .select({
        comment: comments,
        ...authorSelectFields,
        ...replyToProfileSelectFields,
      })
      .from(comments)
      .innerJoin(profiles, eq(comments.authorId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .leftJoin(replyToProfiles, eq(comments.replyToProfileId, replyToProfiles.id))
      .leftJoin(replyToIdentities, eq(replyToProfiles.identityId, replyToIdentities.id))
      .leftJoin(replyToAccounts, eq(replyToProfiles.accountId, replyToAccounts.id))
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
        .map((item) => item.authorProfile.id)
        .filter((id) => id !== viewer.profileId)
    )
  )

  const blockedByViewer = new Set<bigint>()
  const blockedViewer = new Set<bigint>()

  if (otherAuthorIds.length > 0) {
    const blockRows = await db
      .select({
        blockerProfileId: profileBlocks.blockerProfileId,
        blockedProfileId: profileBlocks.blockedProfileId,
      })
      .from(profileBlocks)
      .where(
        or(
          and(
            eq(profileBlocks.blockerProfileId, viewer.profileId),
            inArray(profileBlocks.blockedProfileId, otherAuthorIds)
          ),
          and(
            eq(profileBlocks.blockedProfileId, viewer.profileId),
            inArray(profileBlocks.blockerProfileId, otherAuthorIds)
          )
        )
      )

    for (const row of blockRows) {
      if (row.blockerProfileId === viewer.profileId) {
        blockedByViewer.add(row.blockedProfileId)
      } else {
        blockedViewer.add(row.blockerProfileId)
      }
    }
  }

  const formattedComments = items.map((item) => {
    const isDeleted = Boolean(item.authorAccount?.deletedAt)
    const mappedReplyToProfileInfo = mapReplyToProfile(item)

    if (isDeleted) {
      return {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        parentId: item.comment.parentId ?? null,
        replyToCommentId: item.comment.replyToCommentId ?? null,
        replyToProfile: mappedReplyToProfileInfo,
        type: item.comment.type as CommentType,
        payload: (item.comment.payload as Record<string, unknown>) ?? {},
        content: item.comment.content,
        repliesCount: item.comment.repliesCount ?? 0,
        createdAt: item.comment.createdAt,
        updatedAt: item.comment.updatedAt,
        editedAt: item.comment.editedAt ?? null,
        author: {
          id: item.authorProfile.id,
          name: null,
          identity: null,
          avatarKey: null,
          isMale: null,
          isDeleted: true,
        },
      }
    }

    const isBlocked = blockedByViewer.has(item.authorProfile.id)
    const isHidden = blockedViewer.has(item.authorProfile.id)

    if (isBlocked || isHidden) {
      return {
        id: item.comment.id,
        postId: item.comment.postId,
        authorId: item.comment.authorId,
        parentId: item.comment.parentId ?? null,
        replyToCommentId: item.comment.replyToCommentId ?? null,
        replyToProfile: mappedReplyToProfileInfo,
        type: item.comment.type as CommentType,
        payload: (item.comment.payload as Record<string, unknown>) ?? {},
        content: item.comment.content,
        repliesCount: item.comment.repliesCount ?? 0,
        createdAt: item.comment.createdAt,
        updatedAt: item.comment.updatedAt,
        editedAt: item.comment.editedAt ?? null,
        author: {
          id: item.authorProfile.id,
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

    return formatComment(item.comment, mapCommentAuthor(item), mappedReplyToProfileInfo)
  })

  return {
    comments: formattedComments,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function createComment(
  postId: bigint,
  authorProfileId: bigint,
  viewer: { profileId: bigint; isMale: boolean },
  input: CreateCommentDTO
): Promise<CommentResponse> {
  return await db.transaction(async (tx) => {
    const post = await checkPostAccess(tx, postId, viewer)

    let threadRootId: bigint | null = null
    let replyToCommentId: bigint | null = null
    let replyToProfileId: bigint | null = null

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

      threadRootId = targetComment.parentId ?? targetComment.id
      replyToCommentId = targetComment.id
      replyToProfileId = targetComment.authorId

      const targetAuthorIds: bigint[] = [targetComment.authorId]
      if (threadRootId !== targetComment.id) {
        const rootComment = await tx.query.comments.findFirst({
          where: and(
            eq(comments.id, threadRootId),
            isNull(comments.deletedAt)
          ),
        })
        if (rootComment && !targetAuthorIds.includes(rootComment.authorId)) {
          targetAuthorIds.push(rootComment.authorId)
        }
      }

      const otherTargetAuthorIds = targetAuthorIds.filter((id) => id !== authorProfileId)

      if (otherTargetAuthorIds.length > 0) {
        const [blockRecord] = await tx
          .select({ blockerProfileId: profileBlocks.blockerProfileId })
          .from(profileBlocks)
          .where(
            or(
              and(
                eq(profileBlocks.blockerProfileId, authorProfileId),
                inArray(profileBlocks.blockedProfileId, otherTargetAuthorIds)
              ),
              and(
                inArray(profileBlocks.blockerProfileId, otherTargetAuthorIds),
                eq(profileBlocks.blockedProfileId, authorProfileId)
              )
            )
          )
          .limit(1)

        if (blockRecord) {
          throw new HTTPException(400, { message: 'Cannot reply to a blocked profile' })
        }
      }

      await tx
        .update(comments)
        .set({
          repliesCount: sql`${comments.repliesCount} + 1`,
        })
        .where(eq(comments.id, threadRootId))
    }

    const content = input.content ? input.content.trim() : ''
    const commentType = input.type ?? 'text'
    const payload = input.payload ?? {}

    const [created] = await tx
      .insert(comments)
      .values({
        postId,
        authorId: authorProfileId,
        parentId: threadRootId,
        replyToCommentId,
        replyToProfileId,
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
          profileId: authorProfileId,
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

    // Send notifications
    const commentSnippet = content.length > 0 ? content.slice(0, 100) : ''
    if (replyToProfileId) {
      // It's a reply: notify the author of the comment being replied to
      await createNotification(
        {
          recipientProfileId: replyToProfileId,
          actorProfileId: authorProfileId,
          type: 'comment_reply',
          targetType: 'comment',
          targetId: created.id,
          payload: { postId: post.id, commentSnippet },
        },
        tx
      )

      // Also notify post author if they are not the reply recipient and not the commenter
      if (post.authorId !== replyToProfileId && post.authorId !== authorProfileId) {
        await createNotification(
          {
            recipientProfileId: post.authorId,
            actorProfileId: authorProfileId,
            type: 'new_comment',
            targetType: 'post',
            targetId: post.id,
            payload: { commentId: created.id, commentSnippet },
          },
          tx
        )
      }
    } else {
      // Root comment: notify post author
      await createNotification(
        {
          recipientProfileId: post.authorId,
          actorProfileId: authorProfileId,
          type: 'new_comment',
          targetType: 'post',
          targetId: post.id,
          payload: { commentId: created.id, commentSnippet },
        },
        tx
      )
    }

    const [authorData] = await tx
      .select(authorSelectFields)
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, authorProfileId))
      .limit(1)

    let replyToProfileData: ReplyToProfileInfo | null = null
    if (replyToProfileId) {
      const [replyToRow] = await tx
        .select({
          profile: { id: profiles.id, name: profiles.name },
          identity: { identity: identities.identity },
        })
        .from(profiles)
        .leftJoin(identities, eq(profiles.identityId, identities.id))
        .where(eq(profiles.id, replyToProfileId))
        .limit(1)

      if (replyToRow) {
        replyToProfileData = {
          id: replyToRow.profile.id,
          name: replyToRow.profile.name ?? null,
          identity: replyToRow.identity?.identity ?? null,
        }
      }
    }

    return formatComment(
      created,
      authorData ? mapCommentAuthor(authorData) : null,
      replyToProfileData
    )
  })
}

export async function deleteComment(
  authorProfileId: bigint,
  commentId: bigint
): Promise<DeleteCommentResult> {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.comments.findFirst({
      where: and(eq(comments.id, commentId), isNull(comments.deletedAt)),
    })

    if (!existing) {
      throw new HTTPException(404, { message: 'Comment not found' })
    }

    if (existing.authorId !== authorProfileId) {
      throw new HTTPException(403, { message: 'You can only delete your own comments' })
    }

    let toDeleteIds: bigint[] = [existing.id]

    if (existing.parentId === null) {
      const descendants = await tx
        .select({ id: comments.id })
        .from(comments)
        .where(and(eq(comments.parentId, existing.id), isNull(comments.deletedAt)))

      toDeleteIds = [existing.id, ...descendants.map((d) => d.id)]

      await tx
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(inArray(comments.id, toDeleteIds))

      await tx
        .update(posts)
        .set({
          commentsCount: sql`GREATEST(0, ${posts.commentsCount} - ${toDeleteIds.length})`,
        })
        .where(eq(posts.id, existing.postId))
    } else {
      await tx
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(eq(comments.id, existing.id))

      await tx
        .update(posts)
        .set({
          commentsCount: sql`GREATEST(0, ${posts.commentsCount} - 1)`,
        })
        .where(eq(posts.id, existing.postId))

      await tx
        .update(comments)
        .set({
          repliesCount: sql`GREATEST(0, ${comments.repliesCount} - 1)`,
        })
        .where(eq(comments.id, existing.parentId))
    }

    for (const id of toDeleteIds) {
      await markEntityMediaDeleted(tx, {
        entityType: 'comment',
        entityId: id,
      })
    }

    return {
      success: true,
      message: 'Comment deleted successfully',
    }
  })
}

export async function updateComment(
  authorProfileId: bigint,
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

    if (existing.authorId !== authorProfileId) {
      throw new HTTPException(403, { message: 'You can only edit your own comments' })
    }

    if (Date.now() - existing.createdAt.getTime() > CONTENT_EDIT_WINDOW_MS) {
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
          profileId: authorProfileId,
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
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(accounts, eq(profiles.accountId, accounts.id))
      .where(eq(profiles.id, authorProfileId))
      .limit(1)

    let replyToProfileData: ReplyToProfileInfo | null = null
    if (updated.replyToProfileId) {
      const [replyToRow] = await tx
        .select({
          profile: { id: profiles.id, name: profiles.name },
          identity: { identity: identities.identity },
        })
        .from(profiles)
        .leftJoin(identities, eq(profiles.identityId, identities.id))
        .where(eq(profiles.id, updated.replyToProfileId))
        .limit(1)

      if (replyToRow) {
        replyToProfileData = {
          id: replyToRow.profile.id,
          name: replyToRow.profile.name ?? null,
          identity: replyToRow.identity?.identity ?? null,
        }
      }
    }

    return formatComment(
      updated,
      authorData ? mapCommentAuthor(authorData) : null,
      replyToProfileData
    )
  })
}

export async function recordPostViews(
  viewer: { profileId: bigint; isMale: boolean },
  postIds: bigint[],
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<RecordViewsResult> {
  if (postIds.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const uniquePostIds = Array.from(new Set(postIds))

  const accessiblePosts = await executor
    .select({
      id: posts.id,
      authorId: posts.authorId,
    })
    .from(posts)
    .where(
      and(
        inArray(posts.id, uniquePostIds),
        isNull(posts.deletedAt),
        or(
          eq(posts.authorId, viewer.profileId),
          and(
            sql`NOT EXISTS (
              SELECT 1 FROM ${profileBlocks}
              WHERE (${profileBlocks.blockerProfileId} = ${viewer.profileId} AND ${profileBlocks.blockedProfileId} = ${posts.authorId})
                 OR (${profileBlocks.blockerProfileId} = ${posts.authorId} AND ${profileBlocks.blockedProfileId} = ${viewer.profileId})
            )`,
            sql`(${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))`
          )
        )
      )
    )

  if (accessiblePosts.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const rowsToInsert = accessiblePosts
    .map((p) => ({
      postId: p.id,
      profileId: viewer.profileId,
    }))
    .sort((a, b) => (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0))

  const insertedViews = await executor
    .insert(postViews)
    .values(rowsToInsert)
    .onConflictDoNothing()
    .returning({ postId: postViews.postId })

  if (insertedViews.length > 0) {
    const newlyViewedPostIds = insertedViews
      .map((v) => v.postId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    await executor
      .update(posts)
      .set({
        viewsCount: sql`${posts.viewsCount} + 1`,
      })
      .where(inArray(posts.id, newlyViewedPostIds))
  }

  return {
    success: true,
    updatedCount: insertedViews.length,
  }
}

export async function getFeedPosts(
  viewer: { profileId: bigint; isMale: boolean },
  query: FeedQueryDTO = {}
): Promise<FeedPostsResult> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  const conditions: SQL[] = [
    eq(posts.isFeed, true),
    isNull(posts.deletedAt),
    gte(posts.createdAt, sql`NOW() - INTERVAL '168 HOURS'`),
    ne(posts.authorId, viewer.profileId),
    sql`(${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${profileBlocks}
      WHERE (${profileBlocks.blockerProfileId} = ${viewer.profileId} AND ${profileBlocks.blockedProfileId} = ${posts.authorId})
         OR (${profileBlocks.blockerProfileId} = ${posts.authorId} AND ${profileBlocks.blockedProfileId} = ${viewer.profileId})
    )`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${readers}
      WHERE ${readers.readerProfileId} = ${viewer.profileId}
        AND ${readers.authorProfileId} = ${posts.authorId}
    )`,
  ]

  if (query.cursor) {
    try {
      const cursorId = BigInt(query.cursor)
      conditions.push(lt(posts.id, cursorId))
    } catch {
      // ignore invalid bigint cursor format
    }
  }

  const whereCondition = and(...conditions)!

  const fetchRowsPromise = db
    .select({
      post: posts,
      ...authorSelectFields,
      isSaved: sql<boolean>`CASE WHEN ${postSaves.profileId} IS NOT NULL THEN true ELSE false END`,
      isLiked: sql<boolean>`CASE WHEN ${postLikes.profileId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(profiles, eq(posts.authorId, profiles.id))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(accounts, eq(profiles.accountId, accounts.id))
    .leftJoin(
      postSaves,
      and(
        eq(postSaves.postId, posts.id),
        eq(postSaves.profileId, viewer.profileId)
      )
    )
    .leftJoin(
      postLikes,
      and(
        eq(postLikes.postId, posts.id),
        eq(postLikes.profileId, viewer.profileId)
      )
    )
    .where(and(whereCondition, isNull(accounts.deletedAt))!)
    .orderBy(desc(posts.id))
    .limit(limit + 1)
    .offset(query.cursor ? 0 : offset)

  const fetchTotalPromise = query.cursor
    ? Promise.resolve([{ count: 0 }])
    : db
        .select({ count: count() })
        .from(posts)
        .innerJoin(profiles, eq(posts.authorId, profiles.id))
        .leftJoin(accounts, eq(profiles.accountId, accounts.id))
        .where(and(whereCondition, isNull(accounts.deletedAt))!)

  const [rows, totalResult] = await Promise.all([fetchRowsPromise, fetchTotalPromise])

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = items.length > 0 ? items[items.length - 1].post.id.toString() : null

  const formattedPosts = items.map((r) =>
    formatPost(
      r.post,
      mapAuthor(r, false),
      Boolean(r.isSaved),
      viewer.profileId === r.post.authorId,
      Boolean(r.isLiked)
    )
  )

  return {
    posts: formattedPosts,
    total: totalResult[0]?.count ?? 0,
    limit,
    offset,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  }
}

