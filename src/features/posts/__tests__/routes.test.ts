import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PostResponse } from '../types'

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
    contacts: null,
    identityId: 444444444444444n,
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
    contacts: null,
    identityId: 888888888888888n,
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
    likesCount: 0,
    isLiked: false,
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

  it('rejects unauthenticated requests with 401 on /posts routes', async () => {
    const resFeed = await app.request('/posts/feed', { method: 'GET' })
    expect(resFeed.status).toBe(401)

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

    const resLike = await app.request('/posts/999999999999991/like', { method: 'POST' })
    expect(resLike.status).toBe(401)

    const resUnlike = await app.request('/posts/999999999999991/unlike', { method: 'POST' })
    expect(resUnlike.status).toBe(401)
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

  it('POST /posts/:id/like likes a post and increments likes count', async () => {
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
      likePost: async (_postId: bigint, viewer: { accountId: bigint; isMale: boolean }) => {
        expect(viewer.accountId).toBe(maleAccount.id)
        expect(viewer.isMale).toBe(true)
        return {
          liked: true,
          likesCount: 1,
          message: 'Post liked successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      liked: boolean
      likesCount: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(true)
    expect(body.likesCount).toBe(1)
    expect(body.message).toBe('Post liked successfully')
  })

  it('POST /posts/:id/like returns 404 when post does not exist or gender scope check fails', async () => {
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
      likePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })

  it('POST /posts/:id/unlike unlikes a post and decrements likes count', async () => {
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
      unlikePost: async (_postId: bigint, viewer: { accountId: bigint; isMale: boolean }) => {
        expect(viewer.accountId).toBe(maleAccount.id)
        expect(viewer.isMale).toBe(true)
        return {
          liked: false,
          likesCount: 0,
          message: 'Post unliked successfully',
        }
      },
    }))

    const res = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      liked: boolean
      likesCount: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(false)
    expect(body.likesCount).toBe(0)
    expect(body.message).toBe('Post unliked successfully')
  })

  it('POST /posts/:id/unlike returns 404 when post does not exist or gender scope check fails', async () => {
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
      unlikePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_female_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
  })
})

