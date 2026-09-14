import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PostResponse, FeedResult } from '../types'

describe('Feed and Feed Posts Feature Tests', () => {
  const viewerAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'viewer@wisal.dev',
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
    regularReadersCount: 0,
    readersCount: 0,
    verifiedAt: null,
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
    content: 'Awesome new project announcement!',
    genderScope: 'all',
    accessLevel: 'public',
    feedCategory: 'project',
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

  it('rejects unauthenticated requests to /posts/feed and /feed with 401', async () => {
    const res1 = await app.request('/posts/feed', { method: 'GET' })
    expect(res1.status).toBe(401)

    const res2 = await app.request('/feed', { method: 'GET' })
    expect(res2.status).toBe(401)

    const resNext1 = await app.request('/posts/feed/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(resNext1.status).toBe(401)

    const resNext2 = await app.request('/feed/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(resNext2.status).toBe(401)
  })

  it('rejects users without onboarding on /posts/feed with 403', async () => {
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

    const res = await app.request('/posts/feed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(403)
  })

  it('POST /posts creates post with feed category successfully', async () => {
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
        feedCategory: input.category ?? input.feedCategory ?? null,
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Sharing a fresh thought',
        category: 'thought',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.feedCategory).toBe('thought')
  })

  it('POST /posts rejects second feed post within 24 hours with 429', async () => {
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
          message: 'You can only publish to the feed once every 24 hours',
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
        content: 'Another feed post too soon',
        category: 'thought',
      }),
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You can only publish to the feed once every 24 hours')
  })

  it('GET /posts/feed returns current feed posts and cycle metadata', async () => {
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

    const mockFeedResult: FeedResult = {
      posts: [sampleFeedPost],
      meta: {
        cycleId: 888888888888881n,
        batchNumber: 1,
        usedBatches: 1,
        maxBatches: 5,
        remainingBatches: 4,
        batchSize: 5,
        cycleStartedAt: new Date(),
        cycleExpiresAt: new Date(Date.now() + 86400000),
        cooldownSecondsRemaining: 86400,
        hasMore: true,
      },
    }

    mock.module('../service', () => ({
      getFeedPosts: async (_viewer: any, _query: any) => mockFeedResult,
    }))

    const res = await app.request('/posts/feed?categories=thought,project', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: any[]; meta: any }
    expect(body.success).toBe(true)
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].feedCategory).toBe('project')
    expect(body.meta.usedBatches).toBe(1)
    expect(body.meta.maxBatches).toBe(5)
    expect(body.meta.remainingBatches).toBe(4)
    expect(body.meta.hasMore).toBe(true)
  })

  it('GET /feed alias works identically to /posts/feed', async () => {
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

    const mockFeedResult: FeedResult = {
      posts: [sampleFeedPost],
      meta: {
        cycleId: 888888888888881n,
        batchNumber: 1,
        usedBatches: 1,
        maxBatches: 5,
        remainingBatches: 4,
        batchSize: 5,
        cycleStartedAt: new Date(),
        cycleExpiresAt: new Date(Date.now() + 86400000),
        cooldownSecondsRemaining: 86400,
        hasMore: true,
      },
    }

    mock.module('../service', () => ({
      getFeedPosts: async () => mockFeedResult,
    }))

    const res = await app.request('/feed', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: any[]; meta: any }
    expect(body.success).toBe(true)
    expect(body.meta.usedBatches).toBe(1)
  })

  it('POST /posts/feed/next advances to next batch and returns new posts', async () => {
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

    const mockNextBatchResult: FeedResult = {
      posts: [{ ...sampleFeedPost, id: 999999999999992n, content: 'Next batch post' }],
      meta: {
        cycleId: 888888888888881n,
        batchNumber: 2,
        usedBatches: 2,
        maxBatches: 5,
        remainingBatches: 3,
        batchSize: 5,
        cycleStartedAt: new Date(),
        cycleExpiresAt: new Date(Date.now() + 86400000),
        cooldownSecondsRemaining: 82000,
        hasMore: true,
      },
    }

    mock.module('../service', () => ({
      getNextFeedBatch: async (_viewer: any, _input: any) => mockNextBatchResult,
    }))

    const res = await app.request('/posts/feed/next', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        categories: ['project', 'request'],
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: any[]; meta: any }
    expect(body.success).toBe(true)
    expect(body.meta.batchNumber).toBe(2)
    expect(body.meta.usedBatches).toBe(2)
    expect(body.meta.remainingBatches).toBe(3)
  })

  it('POST /posts/feed/next returns 429 when daily batch limit of 5 is exceeded', async () => {
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
      getNextFeedBatch: async () => {
        throw new HTTPException(429, {
          message: 'Daily feed limit reached (5 of 5 batches used). Please wait for the cooldown to reset.',
        })
      },
    }))

    const res = await app.request('/posts/feed/next', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('Daily feed limit reached')
  })
})
