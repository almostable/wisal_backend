import {
  eq,
  and,
  ne,
  desc,
  isNull,
  count,
  sql,
  type SQL,
} from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { posts, type Post, type PostType, type GenderScope, type AccessLevel } from '../../db/schema/posts'
import { postLikes } from '../../db/schema/post-likes'
import { accounts } from '../../db/schema/accounts'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { follows } from '../../db/schema/follows'
import { getAccountIdByIdentity } from '../profile/service'
import { getProfileByAccountId } from '../../lib/profile'
import type {
  CreatePostDTO,
  UpdatePostDTO,
  PinPostDTO,
  FeedQueryDTO,
  UserPostsQueryDTO,
  PostResponse,
  PostAuthorInfo,
  FeedResult,
  UserPostsResult,
  LikeActionResult,
} from './types'

function formatPost(
  post: Post,
  author?: PostAuthorInfo | null,
  isLiked?: boolean
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
    likesCount: post.likesCount ?? 0,
    ...(isLiked !== undefined ? { isLiked } : {}),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: author ?? null,
  }
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

    const [created] = await tx
      .insert(posts)
      .values({
        authorId: authorAccountId,
        authorGender,
        type: input.type ?? 'text',
        payload: input.payload ?? {},
        content: input.content.trim(),
        genderScope: input.genderScope ?? 'all',
        accessLevel: input.accessLevel ?? 'public',
        isPinned,
      })
      .returning()

    if (!created) {
      throw new HTTPException(500, { message: 'Failed to create post' })
    }

    const [authorData] = await tx
      .select({
        id: accounts.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        isMale: profiles.isMale,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    return formatPost(created, authorData ?? null, false)
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
      updateData.content = input.content.trim()
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
    }

    const [updated] = await tx
      .update(posts)
      .set(updateData)
      .where(eq(posts.id, postId))
      .returning()

    const [authorData] = await tx
      .select({
        id: accounts.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        isMale: profiles.isMale,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    const [likedRecord] = await tx
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.userId, authorAccountId)
        )
      )
      .limit(1)

    return formatPost(updated, authorData ?? null, Boolean(likedRecord))
  })
}

export async function deletePost(
  authorAccountId: bigint,
  postId: bigint
): Promise<{ success: boolean; message: string }> {
  const existing = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
  })

  if (!existing) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  if (existing.authorId !== authorAccountId) {
    throw new HTTPException(403, { message: 'You can only delete your own posts' })
  }

  await db
    .update(posts)
    .set({
      deletedAt: new Date(),
      isPinned: false,
    })
    .where(eq(posts.id, postId))

  return {
    success: true,
    message: 'Post deleted successfully',
  }
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
      .select({
        id: accounts.id,
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        identity: identities.identity,
        isMale: profiles.isMale,
      })
      .from(accounts)
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(accounts.id, authorAccountId))
      .limit(1)

    const [likedRecord] = await tx
      .select({ postId: postLikes.postId })
      .from(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.userId, authorAccountId)
        )
      )
      .limit(1)

    return formatPost(updated, authorData ?? null, Boolean(likedRecord))
  })
}

export async function likePost(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<LikeActionResult> {
  return await db.transaction(async (tx) => {
    const post = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!post) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    const isAuthor = viewer.accountId === post.authorId

    if (!isAuthor) {
      if (post.genderScope === 'same_gender' && post.authorGender !== viewer.isMale) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (post.accessLevel === 'followers') {
        const [followRecord] = await tx
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

    const inserted = await tx
      .insert(postLikes)
      .values({
        postId,
        userId: viewer.accountId,
      })
      .onConflictDoNothing()
      .returning()

    if (inserted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          likesCount: sql`${posts.likesCount} + 1`,
        })
        .where(eq(posts.id, postId))
        .returning({ likesCount: posts.likesCount })

      return {
        liked: true,
        likesCount: updated?.likesCount ?? post.likesCount + 1,
        message: 'Post liked successfully',
      }
    }

    return {
      liked: true,
      likesCount: post.likesCount,
      message: 'Post liked successfully',
    }
  })
}

export async function unlikePost(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<LikeActionResult> {
  return await db.transaction(async (tx) => {
    const post = await tx.query.posts.findFirst({
      where: and(eq(posts.id, postId), isNull(posts.deletedAt)),
    })

    if (!post) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    const isAuthor = viewer.accountId === post.authorId

    if (!isAuthor) {
      if (post.genderScope === 'same_gender' && post.authorGender !== viewer.isMale) {
        throw new HTTPException(404, { message: 'Post not found' })
      }

      if (post.accessLevel === 'followers') {
        const [followRecord] = await tx
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

    const deleted = await tx
      .delete(postLikes)
      .where(
        and(
          eq(postLikes.postId, postId),
          eq(postLikes.userId, viewer.accountId)
        )
      )
      .returning()

    if (deleted.length > 0) {
      const [updated] = await tx
        .update(posts)
        .set({
          likesCount: sql`GREATEST(0, ${posts.likesCount} - 1)`,
        })
        .where(eq(posts.id, postId))
        .returning({ likesCount: posts.likesCount })

      return {
        liked: false,
        likesCount: updated?.likesCount ?? Math.max(0, post.likesCount - 1),
        message: 'Post unliked successfully',
      }
    }

    return {
      liked: false,
      likesCount: post.likesCount,
      message: 'Post unliked successfully',
    }
  })
}

export async function getPostById(
  postId: bigint,
  viewer: { accountId: bigint; isMale: boolean }
): Promise<PostResponse> {
  const [result] = await db
    .select({
      post: posts,
      authorAccount: { id: accounts.id },
      authorProfile: {
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        isMale: profiles.isMale,
      },
      authorIdentity: { identity: identities.identity },
      isLiked: sql<boolean>`CASE WHEN ${postLikes.userId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(accounts, eq(posts.authorId, accounts.id))
    .leftJoin(profiles, eq(accounts.id, profiles.accountId))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(
      postLikes,
      and(
        eq(postLikes.postId, posts.id),
        eq(postLikes.userId, viewer.accountId)
      )
    )
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1)

  if (!result || !result.post) {
    throw new HTTPException(404, { message: 'Post not found' })
  }

  const { post, authorAccount, authorProfile, authorIdentity, isLiked } = result
  const isAuthor = viewer.accountId === post.authorId

  if (!isAuthor) {
    if (post.genderScope === 'same_gender' && post.authorGender !== viewer.isMale) {
      throw new HTTPException(404, { message: 'Post not found' })
    }

    if (post.accessLevel === 'followers') {
      const [followRecord] = await db
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

  const author: PostAuthorInfo = {
    id: authorAccount.id,
    name: authorProfile?.name ?? null,
    avatarKey: authorProfile?.avatarKey ?? null,
    identity: authorIdentity?.identity ?? null,
    isMale: authorProfile?.isMale ?? null,
  }

  return formatPost(post, author, Boolean(isLiked))
}

export async function getFeed(
  viewer: { accountId: bigint; isMale: boolean },
  query: FeedQueryDTO
): Promise<FeedResult> {
  const feedType = query.feed ?? query.type ?? 'public'
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = Math.max(query.offset ?? 0, 0)

  let whereCondition: SQL

  if (feedType === 'following') {
    whereCondition = and(
      isNull(posts.deletedAt),
      sql`(${posts.authorId} = ${viewer.accountId} OR EXISTS (
        SELECT 1 FROM ${follows}
        WHERE ${follows.followerId} = ${viewer.accountId}
          AND ${follows.followingId} = ${posts.authorId}
      ))`,
      sql`(${posts.authorId} = ${viewer.accountId} OR ${posts.genderScope} = 'all' OR (${posts.genderScope} = 'same_gender' AND ${posts.authorGender} = ${viewer.isMale}))`
    )!
  } else {
    whereCondition = and(
      isNull(posts.deletedAt),
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
      authorAccount: { id: accounts.id },
      authorProfile: {
        name: profiles.name,
        avatarKey: profiles.avatarKey,
        isMale: profiles.isMale,
      },
      authorIdentity: { identity: identities.identity },
      isLiked: sql<boolean>`CASE WHEN ${postLikes.userId} IS NOT NULL THEN true ELSE false END`,
    })
    .from(posts)
    .innerJoin(accounts, eq(posts.authorId, accounts.id))
    .leftJoin(profiles, eq(accounts.id, profiles.accountId))
    .leftJoin(identities, eq(profiles.identityId, identities.id))
    .leftJoin(
      postLikes,
      and(
        eq(postLikes.postId, posts.id),
        eq(postLikes.userId, viewer.accountId)
      )
    )
    .where(whereCondition)
    .orderBy(feedType === 'following' ? desc(posts.createdAt) : sql`random()`)
    .limit(limit)
    .offset(offset)

  const formattedPosts = items.map((item) =>
    formatPost(
      item.post,
      {
        id: item.authorAccount.id,
        name: item.authorProfile?.name ?? null,
        avatarKey: item.authorProfile?.avatarKey ?? null,
        identity: item.authorIdentity?.identity ?? null,
        isMale: item.authorProfile?.isMale ?? null,
      },
      Boolean(item.isLiked)
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
        authorAccount: { id: accounts.id },
        authorProfile: {
          name: profiles.name,
          avatarKey: profiles.avatarKey,
          isMale: profiles.isMale,
        },
        authorIdentity: { identity: identities.identity },
        isLiked: sql<boolean>`CASE WHEN ${postLikes.userId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(posts)
      .innerJoin(accounts, eq(posts.authorId, accounts.id))
      .leftJoin(profiles, eq(accounts.id, profiles.accountId))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .leftJoin(
        postLikes,
        and(
          eq(postLikes.postId, posts.id),
          eq(postLikes.userId, viewer.accountId)
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
      {
        id: item.authorAccount.id,
        name: item.authorProfile?.name ?? null,
        avatarKey: item.authorProfile?.avatarKey ?? null,
        identity: item.authorIdentity?.identity ?? null,
        isMale: item.authorProfile?.isMale ?? null,
      },
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
