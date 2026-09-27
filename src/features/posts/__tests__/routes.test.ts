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
    bannedAt: null,
    deletedAt: null,
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
    links: null,
    identityId: 444444444444444n,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: null,
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
    bannedAt: null,
    deletedAt: null,
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
    links: null,
    identityId: 888888888888888n,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: null,
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
    type: 'text',
    payload: {},
    content: 'First test post',
    genderScope: 'all',
    isPinned: false,
    savesCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    isSaved: false,
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

  const sampleComment: CommentResponse = {
    id: 888888888888881n,
    postId: samplePost.id,
    authorId: maleAccount.id,
    parentId: null,
    replyToCommentId: null,
    replyToProfile: null,
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

  it('rejects unauthenticated requests with 401 on protected /posts routes', async () => {
    const resSaves = await app.request('/posts/saves', { method: 'GET' })
    expect(resSaves.status).toBe(401)

    const resCreate = await app.request('/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello' }),
    })
    expect(resCreate.status).toBe(401)

    const resViews = await app.request('/posts/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds: ['999999999999991'] }),
    })
    expect(resViews.status).toBe(401)

    const resUser = await app.request('/posts/user/male_user', { method: 'GET' })
    expect(resUser.status).toBe(401)

    const resSave = await app.request('/posts/999999999999991/save', { method: 'POST' })
    expect(resSave.status).toBe(401)

    const resUnsave = await app.request('/posts/999999999999991/unsave', { method: 'POST' })
    expect(resUnsave.status).toBe(401)

    const resLike = await app.request('/posts/999999999999991/like', { method: 'POST' })
    expect(resLike.status).toBe(401)

    const resUnlike = await app.request('/posts/999999999999991/unlike', { method: 'POST' })
    expect(resUnlike.status).toBe(401)

    const resComments = await app.request('/posts/999999999999991/comments', { method: 'GET' })
    expect(resComments.status).toBe(401)

    const resPostComment = await app.request('/posts/999999999999991/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Comment' }),
    })
    expect(resPostComment.status).toBe(401)

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

    const res = await app.request('/posts/saves', {
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
      createPost: async (authorId: bigint, _authorGender: boolean, input: any) => ({
        ...samplePost,
        authorId,
        content: input.content,
        genderScope: input.genderScope ?? 'all',
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
        isPinned: true,
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Hello Wisal world!')
    expect(body.post.genderScope).toBe('same_gender')
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

    // Rejects content shorter than 8 characters
    const resShort = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Short',
      }),
    })
    expect(resShort.status).toBe(400)
  })

  it('POST /posts rejects media post without content or with content < 8 chars with 400', async () => {
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

    // No content
    const resNoContent = await app.request('/posts', {
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
    expect(resNoContent.status).toBe(400)

    // Short content < 8 chars
    const resShortContent = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        content: 'Short',
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
    expect(resShortContent.status).toBe(400)
  })

  it('POST /posts creates a media post with single media item and valid content successfully', async () => {
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
        _authorGender: boolean,
        input: any
      ) => ({
        ...samplePost,
        authorId,
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
        content: 'A photo from my trip!',
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
    expect(body.post.content).toBe('A photo from my trip!')
    expect(body.post.type).toBe('media')
    expect((body.post.payload as any).media).toHaveLength(1)
    expect((body.post.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.jpg')
    expect((body.post.payload as any).media[0].width).toBe(1920)
    expect((body.post.payload as any).media[0].height).toBe(1080)
  })

  it('POST /posts creates a media post with multiple images (up to 5) in payload successfully', async () => {
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
        _authorGender: boolean,
        input: any
      ) => ({
        ...samplePost,
        authorId,
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
            {
              fileKey: 'media/2026-08-30/723491823749128304.jpg',
              width: 800,
              height: 600,
            },
            {
              fileKey: 'media/2026-08-30/723491823749128305.jpg',
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
    expect((body.post.payload as any).media).toHaveLength(5)
    expect((body.post.payload as any).media[0].fileKey).toBe('media/2026-08-30/723491823749128301.jpg')
    expect((body.post.payload as any).media[4].fileKey).toBe('media/2026-08-30/723491823749128305.jpg')
  })

  it('POST /posts rejects media post with more than 5 images with 400', async () => {
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

    const media = Array.from({ length: 6 }, (_, i) => ({
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
        content: 'Valid post content text',
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
        content: 'Valid post content text',
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
        content: 'Valid post content text',
        payload: {},
      }),
    })

    expect(res.status).toBe(400)
  })

  it('PATCH /posts/:id updates post content only', async () => {
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
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: PostResponse }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Updated post content')
    expect(body.post.genderScope).toBe(samplePost.genderScope)
  })

  it('PATCH /posts/:id rejects updating media post with more than 5 images with 400', async () => {
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

    const media = Array.from({ length: 6 }, (_, i) => ({
      fileKey: `media/2026-08-30/72349182374912830${i}.jpg`,
      width: 100,
      height: 100,
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'PATCH',
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

  it('PATCH /posts/:id returns editedAt timestamp when post is edited', async () => {
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
    const editedPost: PostResponse = {
      ...samplePost,
      content: 'Updated post with editedAt',
      editedAt: editedDate,
    }

    mock.module('../service', () => ({
      updatePost: async () => editedPost,
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Updated post with editedAt',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: any }
    expect(body.success).toBe(true)
    expect(body.post.content).toBe('Updated post with editedAt')
    expect(body.post.editedAt).toBe(editedDate.toISOString())
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

  it('GET /posts/:id allows unauthenticated guest access to post (genderScope all) with male author avatarKey', async () => {
    const guestPublicPost: PostResponse = {
      ...samplePost,
      genderScope: 'all',
      author: {
        name: 'Male User',
        identity: 'male_user',
        avatarKey: 'avatars/male.png',
        isVerified: false,
      },
    }

    mock.module('../service', () => ({
      getPostById: async (postId: bigint, viewer?: any) => {
        expect(postId).toBe(999999999999991n)
        expect(viewer).toBeUndefined()
        return guestPublicPost
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'GET',
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: any }
    expect(body.success).toBe(true)
    expect(body.post.id).toBe('999999999999991')
    expect(body.post.author.name).toBe('Male User')
    expect(body.post.author.identity).toBe('male_user')
    expect(body.post.author.avatarKey).toBe('avatars/male.png')
    expect(body.post.author.id).toBeUndefined()
    expect(body.post.author.isMale).toBeUndefined()
  })

  it('GET /posts/:id allows unauthenticated guest access to post (genderScope all) with female author returning null avatarKey', async () => {
    const guestFemalePost: PostResponse = {
      ...samplePost,
      genderScope: 'all',
      author: {
        name: 'Female User',
        identity: 'female_user',
        avatarKey: null,
        isVerified: true,
      },
    }

    mock.module('../service', () => ({
      getPostById: async (postId: bigint, viewer?: any) => {
        expect(postId).toBe(999999999999991n)
        expect(viewer).toBeUndefined()
        return guestFemalePost
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'GET',
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; post: any }
    expect(body.success).toBe(true)
    expect(body.post.author.name).toBe('Female User')
    expect(body.post.author.identity).toBe('female_user')
    expect(body.post.author.avatarKey).toBeNull()
    expect(body.post.author.id).toBeUndefined()
    expect(body.post.author.isMale).toBeUndefined()
  })

  it('GET /posts/:id returns 404 for unauthenticated guest when post is same_gender', async () => {
    mock.module('../service', () => ({
      getPostById: async (postId: bigint, viewer?: any) => {
        expect(postId).toBe(999999999999991n)
        expect(viewer).toBeUndefined()
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const res = await app.request('/posts/999999999999991', {
      method: 'GET',
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Post not found')
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

    const userPost1: PostResponse = { ...samplePost, isPinned: true }
    delete userPost1.author
    const userPost2: PostResponse = { ...samplePost, id: 999999999999992n, isPinned: false }
    delete userPost2.author

    mock.module('../service', () => ({
      getUserPosts: async () => ({
        posts: [userPost1, userPost2],
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
    expect(body.posts[0].author).toBeUndefined()
    expect(body.posts[1].author).toBeUndefined()
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
      savePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        expect(viewer.profileId).toBe(maleProfile.id)
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
      unsavePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        expect(viewer.profileId).toBe(maleProfile.id)
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

  it('POST /posts/:id/like likes a post and returns likesCount for author', async () => {
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
      likePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        expect(viewer.profileId).toBe(maleProfile.id)
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
      likesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(true)
    expect(body.likesCount).toBe(1)
    expect(body.message).toBe('Post liked successfully')
  })

  it('POST /posts/:id/like likes a post and omits likesCount for non-author', async () => {
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
      likePost: async () => {
        return {
          liked: true,
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
      likesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(true)
    expect(body.likesCount).toBeUndefined()
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

  it('POST /posts/:id/unlike unlikes a post and returns likesCount for author', async () => {
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
      unlikePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        expect(viewer.profileId).toBe(maleProfile.id)
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
      likesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(false)
    expect(body.likesCount).toBe(0)
    expect(body.message).toBe('Post unliked successfully')
  })

  it('POST /posts/:id/unlike unlikes a post and omits likesCount for non-author', async () => {
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
      unlikePost: async () => {
        return {
          liked: false,
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
      likesCount?: number
      message: string
    }
    expect(body.success).toBe(true)
    expect(body.liked).toBe(false)
    expect(body.likesCount).toBeUndefined()
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
        viewer: { profileId: bigint; isMale: boolean },
        query: { limit?: number; offset?: number }
      ) => {
        expect(viewer.profileId).toBe(maleProfile.id)
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

  it('GET /posts/:id/comments returns all post comments including replies with pagination', async () => {
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
      replyToCommentId: sampleComment.id,
      replyToProfile: {
        id: sampleComment.authorId,
        name: sampleComment.author!.name,
        identity: sampleComment.author!.identity,
      },
      content: 'Reply comment on post',
      repliesCount: 0,
    }

    mock.module('../service', () => ({
      getPostComments: async () => ({
        comments: [sampleComment, sampleReply],
        total: 2,
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
    expect(body.comments.length).toBe(2)
    expect(body.comments[0].content).toBe('First comment on post')
    expect(body.comments[0].parentId).toBeNull()
    expect(body.comments[1].content).toBe('Reply comment on post')
    expect(String(body.comments[1].parentId)).toBe(sampleComment.id.toString())
    expect(body.total).toBe(2)
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

  it('POST /posts/:id/comments rejects media comment with more than 1 image with 400', async () => {
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
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.png',
              width: 500,
              height: 500,
            },
            {
              fileKey: 'media/2026-08-30/723491823749128302.png',
              width: 500,
              height: 500,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(400)
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
      deleteComment: async (authorProfileId: bigint, commentId: bigint) => {
        expect(authorProfileId).toBe(maleProfile.id)
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

  it('POST /posts/:id/comments rejects replying to blocked user with 400', async () => {
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
    }))

    const res = await app.request('/posts/999999999999991/comments', {
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

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Cannot reply to a blocked user')
  })

  it('GET /posts/:id, POST /posts/:id/save, POST /posts/:id/unsave, POST /posts/:id/like, POST /posts/:id/unlike return 404 for blocked or restricted post access', async () => {
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
      likePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
      unlikePost: async () => {
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

    const resLike = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resLike.status).toBe(404)

    const resUnlike = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resUnlike.status).toBe(404)
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
      updateComment: async (authorProfileId: bigint, commentId: bigint, input: any) => {
        expect(authorProfileId).toBe(maleProfile.id)
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

  it('PATCH /posts/comments/:id rejects comment update with more than 1 image in payload with 400', async () => {
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

    const res = await app.request('/posts/comments/888888888888881', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_male_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload: {
          media: [
            {
              fileKey: 'media/2026-08-30/723491823749128301.png',
              width: 500,
              height: 500,
            },
            {
              fileKey: 'media/2026-08-30/723491823749128302.png',
              width: 500,
              height: 500,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(400)
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

  it('GET /posts/:id includes author.isReading for viewer', async () => {
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
        isReading: true,
      },
    }

    mock.module('../service', () => ({
      getPostById: async () => postWithFollowingAuthor,
    }))

    const resPost = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_male_token' },
    })
    expect(resPost.status).toBe(200)
    const bodyPost = (await resPost.json()) as { success: boolean; post: PostResponse }
    expect(bodyPost.success).toBe(true)
    expect(bodyPost.post.author?.isReading).toBe(true)
  })

  it('GET /posts/user/:identity returns posts without author object', async () => {
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

    const postWithoutAuthor: PostResponse = {
      ...samplePost,
    }
    delete postWithoutAuthor.author

    mock.module('../service', () => ({
      getUserPosts: async () => ({
        posts: [postWithoutAuthor],
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
    expect(bodyUser.posts[0].author).toBeUndefined()
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

      let capturedViewer: any = null
      let capturedIds: bigint[] = []
      mock.module('../service', () => ({
        recordPostViews: async (viewer: any, postIds: bigint[]) => {
          capturedViewer = viewer
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
      expect(capturedViewer.profileId).toBe(maleProfile.id)
      expect(capturedIds).toEqual([999999999999991n, 999999999999992n])
    })
  })
})

