import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PostResponse, CommentResponse } from '../types'

describe('Posts Feature Route Tests', () => {
  const maleAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'male@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const maleSession: Session = {
    id: 222222222222222n,
    accountId: maleAccount.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const maleProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: maleAccount.id,
    name: 'Male User',
    isMale: true,
    avatarKey: null,
    description: 'Male bio',
    shortDescription: null,
    countryCode: null,
    cityId: null,
    contacts: null,
    identityId: 444444444444444n,
    regularFollowersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'male_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const femaleAccount: SafeAccount = {
    id: 555555555555555n,
    email: 'female@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const femaleSession: Session = {
    id: 666666666666666n,
    accountId: femaleAccount.id,
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const femaleProfile: ProfileWithIdentity = {
    id: 777777777777777n,
    accountId: femaleAccount.id,
    name: 'Female User',
    isMale: false,
    avatarKey: null,
    description: 'Female bio',
    shortDescription: null,
    countryCode: null,
    cityId: null,
    contacts: null,
    identityId: 888888888888888n,
    regularFollowersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 888888888888888n,
      identity: 'female_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const samplePost: PostResponse = {
    id: 999999999999991n,
    authorId: maleAccount.id,
    authorGender: true,
    type: 'text',
    payload: {},
    content: 'First test post',
    genderScope: 'all',
    accessLevel: 'public',
    isPinned: false,
    savesCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    isSaved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: maleAccount.id,
      name: 'Male User',
      identity: 'male_user',
      avatarKey: null,
      isMale: true,
    },
  }

  const sampleComment: CommentResponse = {
    id: 888888888888881n,
    postId: samplePost.id,
    authorId: maleAccount.id,
    rootId: null,
    branchId: null,
    parentId: null,
    replyToUserId: null,
    replyToUser: null,
    type: 'text',
    payload: {},
    content: 'First comment on post',
    repliesCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    author: {
      id: maleAccount.id,
      name: 'Male User',
      identity: 'male_user',
      avatarKey: null,
      isMale: true,
    },
  }

  it('rejects unauthenticated requests with 401 on /posts routes', async () => {
    const resFeed = await app.request('/posts/feed', { method: 'GET' })
    expect(resFeed.status).toBe(401)

    const resSaves = await app.request('/posts/saves', { method: 'GET' })
    expect(resSaves.status).toBe(401)

    const resCreate = await app.request('/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello' }),
    })
    expect(resCreate.status).toBe(401)

    const resGet = await app.request('/posts/999999999999991', { method: 'GET' })
    expect(resGet.status).toBe(401)

    const resUser = await app.request('/posts/user/male_user', { method: 'GET' })
    expect(resUser.status).toBe(401)

    const resSave = await app.request('/posts/999999999999991/save', { method: 'POST' })
    expect(resSave.status).toBe(401)

    const resUnsave = await app.request('/posts/999999999999991/unsave', { method: 'POST' })
    expect(resUnsave.status).toBe(401)

    const resComments = await app.request('/posts/999999999999991/comments', { method: 'GET' })
    expect(resComments.status).toBe(401)

    const resReplies = await app.request('/posts/comments/888888888888881/replies', { method: 'GET' })
    expect(resReplies.status).toBe(401)

    const resPostComment = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Comment' }),
    })
    expect(resPostComment.status).toBe(401)

    const resReplyComment = await app.request('/posts/comments/888888888888881/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Reply' }),
    })
    expect(resReplyComment.status).toBe(401)

    const resUpdateComment = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Edited' }),
    })
    expect(resUpdateComment.status).toBe(401)

    const resDeleteComment = await app.request('/posts/comments/888888888888881', {
      method: 'DELETE',
    })
    expect(resDeleteComment.status).toBe(401)
  })

  it('rejects users who have not completed onboarding with 403', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...maleProfile,
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
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Profile onboarding required')
  })

  it('POST /posts creates a new post successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createPost: async (authorId: bigint, authorGender: boolean, input: any) => ({
        ...samplePost,
        authorId,
        authorGender,
        content: input.content,
        genderScope: input.genderScope ?? 'all',
        accessLevel: input.accessLevel ?? 'public',
        isPinned: input.isPinned ?? false,
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Hello Wisal world!',
        genderScope: 'same_gender',
        accessLevel: 'followers',
        isPinned: true,
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Hello Wisal world!')
    expect(body.post.authorGender).toBe(true)
    expect(body.post.genderScope).toBe('same_gender')
    expect(body.post.accessLevel).toBe('followers')
    expect(body.post.isPinned).toBe(true)
  })

  it('POST /posts rejects empty content with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '   ',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /posts creates a media post with single media item and no content successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createPost: async (
        authorId: bigint,
        authorGender: boolean,
        input: any
      ) => ({
        ...samplePost,
        authorId,
        authorGender,
        content: '',
        type: 'media',
        payload: input.payload ?? {},
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.jpg',
              width: 1920,
              height: 1080,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('')
    expect(body.post.type).toBe('media')
    expect((body.post.payload as any).media).toHaveLength(1)
    expect((body.post.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.jpg')
    expect((body.post.payload as any).media[0].width).toBe(1920)
    expect((body.post.payload as any).media[0].height).toBe(1080)
  })

  it('POST /posts creates a media post with multiple images (up to 10) in payload successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createPost: async (
        authorId: bigint,
        authorGender: boolean,
        input: any
      ) => ({
        ...samplePost,
        authorId,
        authorGender,
        content: input.content,
        type: 'media',
        payload: input.payload ?? {},
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        content: 'Check out my gallery!',
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.jpg',
              width: 1080,
              height: 1080,
            },
            {
              fileKey: 'media/2026-08-30/723491823749128302.png',
              width: 1920,
              height: 1080,
            },
            {
              fileKey: 'media/2026-08-30/723491823749128303.webp',
              width: 800,
              height: 600,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Check out my gallery!')
    expect((body.post.payload as any).media).toHaveLength(3)
    expect((body.post.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.jpg')
    expect((body.post.payload as any).media[1].fileKey).toBe('media/2026-08-30/723491823749128302.png')
    expect((body.post.payload as any).media[2].fileKey).toBe('media/2026-08-30/723491823749128303.webp')
  })

  it('POST /posts rejects media post with more than 10 images with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const media = Array.from({ length: 11 }, (_, i) => ({
      fileKey: `media/2026-08-30/72349182374912830${i}.jpg`,
      width: 100,
      height: 100,
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {
          media,
        },
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /posts rejects media post with invalid payload fileKey with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'https://malicious.com/image.jpg',
              width: 100,
              height: 100,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /posts rejects media post with empty payload with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {},
      }),
    })

    expect(res.status).toBe(400)
  })

  it('PATCH /posts/:id updates post content and settings', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updatePost: async (_authorId: bigint, _postId: bigint, input: any) => ({
        ...samplePost,
        content: input.content ?? samplePost.content,
        accessLevel: input.accessLevel ?? samplePost.accessLevel,
      }),
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Updated post content',
        accessLevel: 'followers',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Updated post content')
    expect(body.post.accessLevel).toBe('followers')
  })

  it('PATCH /posts/:id returns 403 when trying to edit someone else post', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updatePost: async () => {
        throw new HTTPException(403, { message: 'You can only edit your own posts' })
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_female_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Malicious edit',
      }),
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You can only edit your own posts')
  })

  it('PATCH /posts/:id/pin pins a post and returns updated state', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      pinPost: async (_authorId: bigint, _postId: bigint, input: any) => ({
        ...samplePost,
        isPinned: input.isPinned ?? true,
      }),
    }))

    const res = await app.request('/posts/999999999999991/pin', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isPinned: true,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.isPinned).toBe(true)
  })

  it('DELETE /posts/:id soft deletes post', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      deletePost: async () => ({
        success: true,
        message: 'Post deleted successfully',
      }),
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(body.message).toBe('Post deleted successfully')
  })

  it('GET /posts/feed returns feed posts', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getFeed: async () => ({
        posts: [samplePost],
        limit: 20,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/feed?feed=public&limit=20&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: PostResponse[]; limit: number; offset: number }
    expect(body.success).toBe(true)
    expect(body.posts.length).toBe(1)
    expect(body.posts[0].content).toBe('First test post')
  })

  it('GET /posts/feed?feed=following passes feed parameter and returns following feed posts', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getFeed: async (_viewer: any, query: any) => {
        expect(query.feed).toBe('following')
        return {
          posts: [samplePost],
          limit: 20,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/posts/feed?feed=following&limit=20&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; posts: PostResponse[]; limit: number; offset: number }
    expect(body.success).toBe(true)
    expect(body.posts.length).toBe(1)
  })

  it('GET /posts/:id returns post when allowed', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostById: async () => samplePost,
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: any }
    expect(body.success).toBe(true)
    expect(body.post.id).toBe('999999999999991')
  })

  it('GET /posts/:id returns 404 when post violates same_gender or followers rules', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostById: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('GET /posts/user/:identity returns target user posts with pinned ordering', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserPosts: async () => ({
        posts: [
          { ...samplePost, isPinned: true },
          { ...samplePost, id: 999999999999992n, isPinned: false },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/user/male_user', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      posts: PostResponse[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.posts.length).toBe(2)
    expect(body.posts[0].isPinned).toBe(true)
    expect(body.total).toBe(2)
  })

  it('POST /posts/:id/save saves a post and returns savesCount for author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      savePost: async (_postId: bigint, viewer: { accountId: bigint; isMale: boolean }) => {
        expect(viewer.accountId).toBe(maleAccount.id)
        expect(viewer.isMale).toBe(true)
        return {
          saved: true,
          savesCount: 1,
          message: 'Post saved successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/save', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      saved: boolean
      savesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.saved).toBe(true)
    expect(body.savesCount).toBe(1)
    expect(body.message).toBe('Post saved successfully')
  })

  it('POST /posts/:id/save saves a post and omits savesCount for non-author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      savePost: async () => {
        return {
          saved: true,
          message: 'Post saved successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/save', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      saved: boolean
      savesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.saved).toBe(true)
    expect(body.savesCount).toBeUndefined()
    expect(body.message).toBe('Post saved successfully')
  })

  it('POST /posts/:id/save returns 404 when post does not exist or gender scope check fails', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      savePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991/save', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('POST /posts/:id/unsave unsaves a post and returns savesCount for author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      unsavePost: async (_postId: bigint, viewer: { accountId: bigint; isMale: boolean }) => {
        expect(viewer.accountId).toBe(maleAccount.id)
        expect(viewer.isMale).toBe(true)
        return {
          saved: false,
          savesCount: 0,
          message: 'Post unsaved successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/unsave', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      saved: boolean
      savesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.saved).toBe(false)
    expect(body.savesCount).toBe(0)
    expect(body.message).toBe('Post unsaved successfully')
  })

  it('POST /posts/:id/unsave unsaves a post and omits savesCount for non-author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      unsavePost: async () => {
        return {
          saved: false,
          message: 'Post unsaved successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/unsave', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      saved: boolean
      savesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.saved).toBe(false)
    expect(body.savesCount).toBeUndefined()
    expect(body.message).toBe('Post unsaved successfully')
  })

  it('POST /posts/:id/unsave returns 404 when post does not exist or gender scope check fails', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      unsavePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991/unsave', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('GET /posts/saves returns paginated list of saved posts', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const savedPost1: PostResponse = {
      ...samplePost,
      id: 999999999999991n,
      isSaved: true,
      savesCount: 5, // Author can see savesCount
    }
    const savedPost2: PostResponse = {
      ...samplePost,
      id: 999999999999992n,
      authorId: femaleAccount.id,
      isSaved: true,
      // Non-author: savesCount is undefined
    }
    delete (savedPost2 as any).savesCount

    mock.module('../service', () => ({
      getSavedPosts: async (
        viewer: { accountId: bigint; isMale: boolean },
        query: { limit?: number; offset?: number }
      ) => {
        expect(viewer.accountId).toBe(maleAccount.id)
        expect(query.limit).toBe(10)
        expect(query.offset).toBe(0)
        return {
          posts: [savedPost1, savedPost2],
          total: 2,
          limit: 10,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/posts/saves?limit=10&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      posts: PostResponse[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.posts.length).toBe(2)
    expect(body.posts[0].isSaved).toBe(true)
    expect(body.posts[0].savesCount).toBe(5)
    expect(body.posts[1].isSaved).toBe(true)
    expect(body.posts[1].savesCount).toBeUndefined()
    expect(body.total).toBe(2)
  })

  it('GET /posts/:id/comments returns post comments list with pagination', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostComments: async () => ({
        comments: [sampleComment],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments?limit=50&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      comments: CommentResponse[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(1)
    expect(body.comments[0].content).toBe('First comment on post')
    expect(body.total).toBe(1)
  })

  it('GET /posts/:id/comments returns 404 when post access is restricted or post does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostComments: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('GET /posts/comments/:id/replies returns comment replies list with pagination', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const sampleReply: CommentResponse = {
      ...sampleComment,
      id: 888888888888882n,
      parentId: sampleComment.id,
      content: 'First reply to comment',
      repliesCount: 0,
    }

    mock.module('../service', () => ({
      getCommentReplies: async (commentId: bigint) => {
        expect(commentId).toBe(sampleComment.id)
        return {
          comments: [sampleReply],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/posts/comments/888888888888881/replies?limit=50&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      comments: any[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(1)
    expect(body.comments[0].id).toBe('888888888888882')
    expect(body.comments[0].parentId).toBe('888888888888881')
    expect(body.comments[0].content).toBe('First reply to comment')
    expect(body.comments[0].repliesCount).toBe(0)
    expect(body.total).toBe(1)
  })

  it('GET /posts/comments/:id/replies returns 404 when parent comment does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getCommentReplies: async () => {
        throw new HTTPException(404, { message: 'Comment not found' })
      },
    }))

    const res = await app.request('/posts/comments/999999999999999/replies', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Comment not found')
  })

  it('GET /posts/comments/:id/replies returns 404 when post access is restricted or post does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getCommentReplies: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/comments/888888888888881/replies', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('GET /posts/comments/:id/replies returns masked replies when reply author is blocked', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const sampleReply: CommentResponse = {
      ...sampleComment,
      id: 888888888888882n,
      parentId: sampleComment.id,
      content: 'Visible reply content',
      repliesCount: 0,
      isBlocked: true,
      author: {
        ...sampleComment.author!,
        avatarKey: null,
        isBlocked: true,
      },
    }

    mock.module('../service', () => ({
      getCommentReplies: async () => ({
        comments: [sampleReply],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/comments/888888888888881/replies', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comments: any[] }
    expect(body.success).toBe(true)
    expect(body.comments[0].content).toBe('Visible reply content')
    expect(body.comments[0].isBlocked).toBe(true)
    expect(body.comments[0].is_blocked).toBeUndefined()
    expect(body.comments[0].author.avatarKey).toBeNull()
  })

  it('POST /posts/:id/comments creates a new root comment successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createComment: async (
        postId: bigint,
        authorAccountId: bigint,
        _viewer: any,
        input: any
      ) => ({
        ...sampleComment,
        postId,
        authorId: authorAccountId,
        content: input.content,
        parentId: input.parentId ?? null,
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Great post content!',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; comment: CommentResponse }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Great post content!')
    expect(body.comment.parentId).toBeNull()
  })

  it('POST /posts/:id/comments creates a reply when parentId is provided', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createComment: async (
        postId: bigint,
        authorAccountId: bigint,
        _viewer: any,
        input: any
      ) => ({
        ...sampleComment,
        id: 888888888888882n,
        postId,
        authorId: authorAccountId,
        content: input.content,
        parentId: input.parentId,
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Replying to comment',
        parentId: '888888888888881',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; comment: any }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Replying to comment')
    expect(body.comment.parentId).toBe('888888888888881')
  })

  it('POST /posts/:id/comments rejects empty content with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '   ',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /posts/:id/comments creates comment with media type and payload (no content) successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createComment: async (
        postId: bigint,
        authorAccountId: bigint,
        _viewer: any,
        input: any
      ) => ({
        ...sampleComment,
        id: 888888888888883n,
        postId,
        authorId: authorAccountId,
        content: '',
        type: 'media',
        payload: input.payload ?? {},
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.jpg',
              width: 800,
              height: 600,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; comment: CommentResponse }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('')
    expect(body.comment.type).toBe('media')
    expect((body.comment.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.jpg')
  })

  it('POST /posts/:id/comments creates comment with media type, text AND payload successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createComment: async (
        postId: bigint,
        authorAccountId: bigint,
        _viewer: any,
        input: any
      ) => ({
        ...sampleComment,
        id: 888888888888884n,
        postId,
        authorId: authorAccountId,
        content: input.content,
        type: 'media',
        payload: input.payload ?? {},
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        content: 'Check this image comment!',
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.png',
              width: 500,
              height: 500,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; comment: CommentResponse }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Check this image comment!')
    expect((body.comment.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.png')
  })

  it('POST /posts/comments/:id/reply replies directly to a comment', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      replyToComment: async (
        commentId: bigint,
        authorAccountId: bigint,
        _viewer: any,
        input: any
      ) => ({
        ...sampleComment,
        id: 888888888888883n,
        authorId: authorAccountId,
        parentId: commentId,
        content: input.content,
      }),
    }))

    const res = await app.request('/posts/comments/888888888888881/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Direct reply to comment',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; comment: any }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Direct reply to comment')
    expect(body.comment.parentId).toBe('888888888888881')
  })

  it('POST /posts/comments/:id/reply returns 404 when parent comment does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      replyToComment: async () => {
        throw new HTTPException(404, { message: 'Comment not found' })
      },
    }))

    const res = await app.request('/posts/comments/999999999999999/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Reply to non-existent comment',
      }),
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Comment not found')
  })

  it('DELETE /posts/comments/:id deletes a comment successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      deleteComment: async (authorAccountId: bigint, commentId: bigint) => {
        expect(authorAccountId).toBe(maleAccount.id)
        expect(commentId).toBe(888888888888881n)
        return {
          success: true,
          message: 'Comment deleted successfully',
        }
      },
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(body.message).toBe('Comment deleted successfully')
  })

  it('DELETE /posts/comments/:id returns 403 when user is not comment author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      deleteComment: async () => {
        throw new HTTPException(403, { message: 'You can only delete your own comments' })
      },
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You can only delete your own comments')
  })

  it('DELETE /posts/comments/:id returns 404 when comment does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      deleteComment: async () => {
        throw new HTTPException(404, { message: 'Comment not found' })
      },
    }))

    const res = await app.request('/posts/comments/999999999999999', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Comment not found')
  })

  it('GET /posts/user/:identity returns empty list when block exists', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserPosts: async () => ({
        posts: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/user/blocked_user', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      posts: any[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.posts).toEqual([])
    expect(body.total).toBe(0)
  })

  it('GET /posts/:id/comments returns masked comments when comment author is blocked', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostComments: async () => ({
        comments: [
          {
            ...sampleComment,
            content: 'Comment content visible',
            author: {
              ...sampleComment.author,
              avatarKey: null,
              isBlocked: true,
            },
            isBlocked: true,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comments: any[] }
    expect(body.success).toBe(true)
    expect(body.comments[0].content).toBe('Comment content visible')
    expect(body.comments[0].isBlocked).toBe(true)
    expect(body.comments[0].is_blocked).toBeUndefined()
    expect(body.comments[0].author.avatarKey).toBeNull()
  })

  it('POST /posts/:id/comments and POST /posts/comments/:id/reply reject replying to blocked user with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createComment: async () => {
        throw new HTTPException(400, { message: 'Cannot reply to a blocked user' })
      },
      replyToComment: async () => {
        throw new HTTPException(400, { message: 'Cannot reply to a blocked user' })
      },
    }))

    const res1 = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Replying to blocked user comment',
        parentId: '888888888888881',
      }),
    })

    expect(res1.status).toBe(400)
    const body1 = (await res1.json()) as { error: string }
    expect(body1.error).toBe('Cannot reply to a blocked user')

    const res2 = await app.request('/posts/comments/888888888888881/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Replying to blocked user directly',
      }),
    })

    expect(res2.status).toBe(400)
    const body2 = (await res2.json()) as { error: string }
    expect(body2.error).toBe('Cannot reply to a blocked user')
  })

  it('GET /posts/:id, POST /posts/:id/save, POST /posts/:id/unsave return 404 for blocked or restricted post access', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getPostById: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
      savePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
      unsavePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const resGet = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resGet.status).toBe(404)

    const resSave = await app.request('/posts/999999999999991/save', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resSave.status).toBe(404)

    const resUnsave = await app.request('/posts/999999999999991/unsave', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resUnsave.status).toBe(404)
  })

  it('GET /posts/:id/comments only returns root comments and excludes replies', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const rootComment1: CommentResponse = {
      ...sampleComment,
      id: 888888888888881n,
      parentId: null,
      content: 'Root comment 1',
      repliesCount: 2,
    }

    const rootComment2: CommentResponse = {
      ...sampleComment,
      id: 888888888888882n,
      parentId: null,
      content: 'Root comment 2',
      repliesCount: 0,
    }

    mock.module('../service', () => ({
      getPostComments: async (postId: bigint) => {
        expect(postId).toBe(999999999999991n)
        return {
          comments: [rootComment1, rootComment2],
          total: 2,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      comments: CommentResponse[]
      total: number
    }
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(2)
    expect(body.comments[0].parentId).toBeNull()
    expect(body.comments[0].repliesCount).toBe(2)
    expect(body.comments[1].parentId).toBeNull()
    expect(body.comments[1].repliesCount).toBe(0)
    expect(body.total).toBe(2)
  })

  it('GET /posts/comments/:id/replies returns flat list with replyToUser info', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const reply1: CommentResponse = {
      ...sampleComment,
      id: 888888888888882n,
      rootId: 888888888888881n,
      branchId: null,
      parentId: 888888888888881n,
      replyToUserId: maleAccount.id,
      replyToUser: {
        id: maleAccount.id,
        name: 'Male User',
        identity: 'male_user',
      },
      content: 'First reply to root (Level 1 branch)',
      repliesCount: 1,
    }

    const reply2: CommentResponse = {
      ...sampleComment,
      id: 888888888888883n,
      authorId: femaleAccount.id,
      rootId: 888888888888881n,
      branchId: 888888888888882n,
      parentId: 888888888888882n,
      replyToUserId: maleAccount.id,
      replyToUser: {
        id: maleAccount.id,
        name: 'Male User',
        identity: 'male_user',
      },
      content: 'Reply to reply1 inside branch (Level 2)',
      repliesCount: 0,
      author: {
        id: femaleAccount.id,
        name: 'Female User',
        identity: 'female_user',
        avatarKey: null,
        isMale: false,
      },
    }

    mock.module('../service', () => ({
      getCommentReplies: async (commentId: bigint) => {
        expect(commentId).toBe(888888888888881n)
        return {
          comments: [reply1, reply2],
          total: 2,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/posts/comments/888888888888881/replies', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      comments: any[]
      total: number
    }
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(2)
    expect(body.comments[0].rootId).toBe('888888888888881')
    expect(body.comments[0].branchId).toBeNull()
    expect(body.comments[0].parentId).toBe('888888888888881')
    expect(body.comments[0].replyToUser?.identity).toBe('male_user')
    expect(body.comments[1].rootId).toBe('888888888888881')
    expect(body.comments[1].branchId).toBe('888888888888882')
    expect(body.comments[1].parentId).toBe('888888888888882')
    expect(body.comments[1].replyToUserId).toBe(maleAccount.id.toString())
    expect(body.comments[1].replyToUser?.name).toBe('Male User')
  })

  it('PATCH /posts/:id returns 403 when post is older than 15 minutes', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updatePost: async () => {
        throw new HTTPException(403, {
          message: 'Post can only be edited within 15 minutes of creation',
        })
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Trying to edit expired post',
      }),
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post can only be edited within 15 minutes of creation')
  })

  it('PATCH /posts/comments/:id updates comment successfully within 15 minutes', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updateComment: async (authorAccountId: bigint, commentId: bigint, input: any) => {
        expect(authorAccountId).toBe(maleAccount.id)
        expect(commentId).toBe(888888888888881n)
        return {
          ...sampleComment,
          id: commentId,
          content: input.content,
        }
      },
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Updated comment text',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comment: CommentResponse }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Updated comment text')
  })

  it('PATCH /posts/comments/:id returns 403 when user is not comment author', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: femaleAccount,
        session: femaleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => femaleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updateComment: async () => {
        throw new HTTPException(403, { message: 'You can only edit your own comments' })
      },
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_female_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Malicious edit of someone else comment',
      }),
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You can only edit your own comments')
  })

  it('PATCH /posts/comments/:id returns 403 when comment is older than 15 minutes', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updateComment: async () => {
        throw new HTTPException(403, {
          message: 'Comment can only be edited within 15 minutes of creation',
        })
      },
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Trying to edit after 15m',
      }),
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Comment can only be edited within 15 minutes of creation')
  })

  it('PATCH /posts/comments/:id returns 404 when comment not found', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      updateComment: async () => {
        throw new HTTPException(404, { message: 'Comment not found' })
      },
    }))

    const res = await app.request('/posts/comments/999999999999999', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Edit missing comment',
      }),
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Comment not found')
  })

  it('GET /posts/feed and GET /posts/:id include author.isFollowing for viewer', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const postWithFollowingAuthor: PostResponse = {
      ...samplePost,
      author: {
        ...samplePost.author!,
        isFollowing: true,
      },
    }

    mock.module('../service', () => ({
      getFeed: async () => ({
        posts: [postWithFollowingAuthor],
        limit: 20,
        offset: 0,
      }),
      getPostById: async () => postWithFollowingAuthor,
    }))

    const resFeed = await app.request('/posts/feed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resFeed.status).toBe(200)
    const bodyFeed = (await resFeed.json()) as { success: boolean; posts: PostResponse[] }
    expect(bodyFeed.success).toBe(true)
    expect(bodyFeed.posts[0].author?.isFollowing).toBe(true)

    const resPost = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resPost.status).toBe(200)
    const bodyPost = (await resPost.json()) as { success: boolean; post: PostResponse }
    expect(bodyPost.success).toBe(true)
    expect(bodyPost.post.author?.isFollowing).toBe(true)
  })

  it('GET /posts/user/:identity includes author.isFollowing status', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const postWithUnfollowedAuthor: PostResponse = {
      ...samplePost,
      author: {
        ...samplePost.author!,
        isFollowing: false,
      },
    }

    mock.module('../service', () => ({
      getUserPosts: async () => ({
        posts: [postWithUnfollowedAuthor],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    }))

    const resUser = await app.request('/posts/user/male_user', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resUser.status).toBe(200)
    const bodyUser = (await resUser.json()) as { success: boolean; posts: PostResponse[] }
    expect(bodyUser.success).toBe(true)
    expect(bodyUser.posts[0].author?.isFollowing).toBe(false)
  })

  it('GET /posts/comments/:id/replies returns Level 1 comments for Level 0 root', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const level1Branch: CommentResponse = {
      ...sampleComment,
      id: 888888888888882n,
      rootId: sampleComment.id,
      branchId: null,
      parentId: sampleComment.id,
      replyToUserId: maleAccount.id,
      content: 'Branch Level 1',
      repliesCount: 3,
    }

    mock.module('../service', () => ({
      getCommentReplies: async (commentId: bigint) => {
        expect(commentId).toBe(sampleComment.id)
        return {
          comments: [level1Branch],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request(`/posts/comments/${sampleComment.id}/replies`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comments: any[] }
    expect(body.success).toBe(true)
    expect(body.comments[0].rootId).toBe(sampleComment.id.toString())
    expect(body.comments[0].branchId).toBeNull()
    expect(body.comments[0].parentId).toBe(sampleComment.id.toString())
    expect(body.comments[0].repliesCount).toBe(3)
  })

  it('GET /posts/comments/:id/replies returns Level 2 comments for Level 1 branch', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const branchId = 888888888888882n
    const level2Reply: CommentResponse = {
      ...sampleComment,
      id: 888888888888883n,
      rootId: sampleComment.id,
      branchId: branchId,
      parentId: branchId,
      replyToUserId: maleAccount.id,
      content: 'Reply inside branch Level 2',
      repliesCount: 0,
    }

    mock.module('../service', () => ({
      getCommentReplies: async (commentId: bigint) => {
        expect(commentId).toBe(branchId)
        return {
          comments: [level2Reply],
          total: 1,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request(`/posts/comments/${branchId}/replies`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comments: any[] }
    expect(body.success).toBe(true)
    expect(body.comments[0].rootId).toBe(sampleComment.id.toString())
    expect(body.comments[0].branchId).toBe(branchId.toString())
    expect(body.comments[0].parentId).toBe(branchId.toString())
    expect(body.comments[0].repliesCount).toBe(0)
  })

  it('GET /posts/comments/:id/replies returns empty array for Level 2 leaf', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const leafId = 888888888888883n

    mock.module('../service', () => ({
      getCommentReplies: async (commentId: bigint) => {
        expect(commentId).toBe(leafId)
        return {
          comments: [],
          total: 0,
          limit: 50,
          offset: 0,
        }
      },
    }))

    const res = await app.request(`/posts/comments/${leafId}/replies`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comments: any[]; total: number }
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(0)
    expect(body.total).toBe(0)
  })

  it('PATCH /posts/comments/:id returns editedAt timestamp when comment is edited', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: maleAccount,
        session: maleSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => maleProfile,
      isOnboardingCompleted: () => true,
    }))

    const editedDate = new Date()
    const editedComment: CommentResponse = {
      ...sampleComment,
      content: 'Updated comment content',
      editedAt: editedDate,
    }

    mock.module('../service', () => ({
      updateComment: async () => editedComment,
    }))

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Updated comment content' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; comment: any }
    expect(body.success).toBe(true)
    expect(body.comment.content).toBe('Updated comment content')
    expect(body.comment.editedAt).toBe(editedDate.toISOString())
  })

  describe('POST /posts/views batch endpoint', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await app.request('/posts/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: ['999999999999991'] }),
      })
      expect(res.status).toBe(401)
    })

    it('rejects when onboarding is incomplete with 403', async () => {
      mock.module('../../../lib/session', () => ({
        validateSessionToken: async () => ({
          account: maleAccount,
          session: maleSession,
        }),
      }))
      mock.module('../../../lib/profile', () => ({
        getProfileByAccountId: async () => ({
          ...maleProfile,
          identityId: null,
          identity: null,
        }),
        isOnboardingCompleted: () => false,
      }))

      const res = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postIds: ['999999999999991'] }),
      })
      expect(res.status).toBe(403)
    })

    it('rejects with 400 if postIds is missing, empty, or invalid', async () => {
      mock.module('../../../lib/session', () => ({
        validateSessionToken: async () => ({
          account: maleAccount,
          session: maleSession,
        }),
      }))
      mock.module('../../../lib/profile', () => ({
        getProfileByAccountId: async () => maleProfile,
        isOnboardingCompleted: () => true,
      }))

      // Missing postIds
      const resEmpty = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      expect(resEmpty.status).toBe(400)

      // Empty array
      const resZero = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postIds: [] }),
      })
      expect(resZero.status).toBe(400)

      // Invalid ID format
      const resInvalid = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postIds: ['not-a-number'] }),
      })
      expect(resInvalid.status).toBe(400)

      // Exceeds max 100
      const tooMany = Array.from({ length: 101 }, (_, i) => String(100000000000000 + i))
      const resTooMany = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postIds: tooMany }),
      })
      expect(resTooMany.status).toBe(400)
    })

    it('records views successfully with 200', async () => {
      mock.module('../../../lib/session', () => ({
        validateSessionToken: async () => ({
          account: maleAccount,
          session: maleSession,
        }),
      }))
      mock.module('../../../lib/profile', () => ({
        getProfileByAccountId: async () => maleProfile,
        isOnboardingCompleted: () => true,
      }))

      let capturedIds: bigint[] = []
      mock.module('../service', () => ({
        recordPostViews: async (postIds: bigint[]) => {
          capturedIds = postIds
          return { success: true, updatedCount: postIds.length }
        },
      }))

      const res = await app.request('/posts/views', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_male_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postIds: ['999999999999991', '999999999999992'],
        }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as { success: boolean; updatedCount: number }
      expect(body.success).toBe(true)
      expect(body.updatedCount).toBe(2)
      expect(capturedIds).toEqual([999999999999991n, 999999999999992n])
    })
  })
})


