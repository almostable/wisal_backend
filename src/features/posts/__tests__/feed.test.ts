import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PostResponse, FeedPostsResult } from '../types'

describe('Feed and Feed Posts Feature Tests', () => {
  const viewerAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'viewer@wisal.dev',
    bannedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const viewerSession: Session = {
    id: 222222222222222n,
    accountId: viewerAccount.id,
    tokenHash: 'v'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const viewerProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: viewerAccount.id,
    name: 'Viewer User',
    isMale: true,
    avatarKey: null,
    description: 'Viewer bio',
    contacts: null,
    identityId: 444444444444444n,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'viewer_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const sampleFeedPost: PostResponse = {
    id: 999999999999991n,
    authorId: 555555555555555n,
    type: 'text',
    payload: {},
    content: 'Awesome post for the feed!',
    genderScope: 'all',
    isFeed: true,
    isPinned: false,
    savesCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    isSaved: false,
    isLiked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    author: {
      id: 555555555555555n,
      name: 'Author User',
      identity: 'author_user',
      avatarKey: null,
      isMale: true,
      isReading: false,
    },
  }

  it('rejects unauthenticated requests to /feed with 401', async () => {
    const res = await app.request('/feed', { method: 'GET' })
    expect(res.status).toBe(401)
  })

  it('verifies /posts/feed is not treated as a feed route', async () => {
    const res = await app.request('/posts/feed', { method: 'GET' })
    expect(res.status).toBe(400) // matches /posts/:id and fails snowflake param validation
  })

  it('rejects users without onboarding on /feed with 403', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: viewerAccount,
        session: viewerSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...viewerProfile,
        isMale: null,
        identity: null,
      }),
      isOnboardingCompleted: () => false,
    }))

    const res = await app.request('/feed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(403)
  })

  it('POST /posts creates post with isFeed=true successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: viewerAccount,
        session: viewerSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => viewerProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createPost: async (authorId: bigint, _authorGender: boolean, input: any) => ({
        ...sampleFeedPost,
        authorId,
        content: input.content,
        isFeed: input.isFeed ?? input.showInFeed ?? false,
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Sharing a fresh post to feed',
        showInFeed: true,
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.isFeed).toBe(true)
  })

  it('POST /posts rejects feed post exceeding 24h limit (max 3) with 429', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: viewerAccount,
        session: viewerSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => viewerProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createPost: async () => {
        throw new HTTPException(429, {
          message: 'You can only publish to the feed up to 3 times every 24 hours',
        })
      },
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Fourth feed post too soon',
        isFeed: true,
      }),
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You can only publish to the feed up to 3 times every 24 hours')
  })

  it('GET /feed returns feed posts with pagination (20 posts)', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: viewerAccount,
        session: viewerSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => viewerProfile,
      isOnboardingCompleted: () => true,
    }))

    const mockFeedResult: FeedPostsResult = {
      posts: [sampleFeedPost],
      total: 1,
      limit: 20,
      offset: 0,
      nextCursor: null,
      hasMore: false,
    }

    mock.module('../service', () => ({
      getFeedPosts: async (_viewer: any, _query: any) => mockFeedResult,
    }))

    const res = await app.request('/feed', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: any[]; total: number; limit: number; offset: number; hasMore: boolean }
    expect(body.success).toBe(true)
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].isFeed).toBe(true)
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  it('GET /feed handles cursor pagination query params', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: viewerAccount,
        session: viewerSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => viewerProfile,
      isOnboardingCompleted: () => true,
    }))

    const mockFeedResult: FeedPostsResult = {
      posts: [{ ...sampleFeedPost, id: 999999999999990n }],
      total: 25,
      limit: 20,
      offset: 0,
      nextCursor: '999999999999990',
      hasMore: true,
    }

    mock.module('../service', () => ({
      getFeedPosts: async (_viewer: any, query: any) => {
        expect(query.cursor).toBe('999999999999991')
        return mockFeedResult
      },
    }))

    const res = await app.request('/feed?cursor=999999999999991', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: any[]; nextCursor: string; hasMore: boolean }
    expect(body.success).toBe(true)
    expect(body.hasMore).toBe(true)
    expect(body.nextCursor).toBe('999999999999990')
  })
})
