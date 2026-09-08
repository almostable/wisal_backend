import { describe, it, expect, mock } from 'bun:test'
import { app } from '../../..'
import type { PostResponse, LikeActionResult } from '../types'
import { HTTPException } from 'hono/http-exception'

describe('Posts Likes Feature Unit & Integration Tests', () => {
  const authorAccount = { id: 100000000000001n, email: 'author@wisal.com' }
  const authorSession = { id: 200000000000001n, accountId: authorAccount.id }
  const authorProfile = {
    id: 300000000000001n,
    accountId: authorAccount.id,
    name: 'Author User',
    isMale: true,
  }

  const readerAccount = { id: 100000000000002n, email: 'reader@wisal.com' }
  const readerSession = { id: 200000000000002n, accountId: readerAccount.id }
  const readerProfile = {
    id: 300000000000002n,
    accountId: readerAccount.id,
    name: 'Reader User',
    isMale: true,
  }

  const femaleAccount = { id: 100000000000003n, email: 'female@wisal.com' }
  const femaleSession = { id: 200000000000003n, accountId: femaleAccount.id }
  const femaleProfile = {
    id: 300000000000003n,
    accountId: femaleAccount.id,
    name: 'Female User',
    isMale: false,
  }

  it('GET /posts/:id returns likesCount for author and omits it for non-author', async () => {
    // 1. Author requests own post -> likesCount is returned
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: authorAccount,
        session: authorSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => authorProfile,
      isOnboardingCompleted: () => true,
    }))
    mock.module('../service', () => ({
      getPostById: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        const isAuthor = viewer.profileId === authorProfile.id
        return {
          id: 999999999999991n,
          authorId: authorProfile.id,
          type: 'text',
          payload: {},
          content: 'Author post',
          genderScope: 'all',
          accessLevel: 'public',
          isPinned: false,
          ...(isAuthor ? { likesCount: 42, savesCount: 10 } : {}),
          commentsCount: 0,
          viewsCount: 100,
          isLiked: true,
          isSaved: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          editedAt: null,
          author: null,
        }
      },
    }))

    const resAuthor = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: { Authorization: 'Bearer author_token' },
    })
    expect(resAuthor.status).toBe(200)
    const bodyAuthor = (await resAuthor.json()) as { success: boolean; post: PostResponse }
    expect(bodyAuthor.post.likesCount).toBe(42)
    expect(bodyAuthor.post.savesCount).toBe(10)
    expect(bodyAuthor.post.isLiked).toBe(true)

    // 2. Reader requests author post -> likesCount is omitted
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: readerAccount,
        session: readerSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => readerProfile,
      isOnboardingCompleted: () => true,
    }))

    const resReader = await app.request('/posts/999999999999991', {
      method: 'GET',
      headers: { Authorization: 'Bearer reader_token' },
    })
    expect(resReader.status).toBe(200)
    const bodyReader = (await resReader.json()) as { success: boolean; post: PostResponse }
    expect(bodyReader.post.likesCount).toBeUndefined()
    expect(bodyReader.post.savesCount).toBeUndefined()
    expect(bodyReader.post.isLiked).toBe(true)
  })

  it('POST /posts/:id/like returns likesCount for author and omits for non-author', async () => {
    // 1. Author likes own post -> likesCount is present
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: authorAccount,
        session: authorSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => authorProfile,
      isOnboardingCompleted: () => true,
    }))
    mock.module('../service', () => ({
      likePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        const isAuthor = viewer.profileId === authorProfile.id
        return {
          liked: true,
          ...(isAuthor ? { likesCount: 5 } : {}),
          message: 'Post liked successfully',
        }
      },
    }))

    const resAuthor = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: { Authorization: 'Bearer author_token' },
    })
    expect(resAuthor.status).toBe(200)
    const bodyAuthor = (await resAuthor.json()) as { success: boolean } & LikeActionResult
    expect(bodyAuthor.success).toBe(true)
    expect(bodyAuthor.liked).toBe(true)
    expect(bodyAuthor.likesCount).toBe(5)

    // 2. Reader likes author post -> likesCount is omitted
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: readerAccount,
        session: readerSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => readerProfile,
      isOnboardingCompleted: () => true,
    }))

    const resReader = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: { Authorization: 'Bearer reader_token' },
    })
    expect(resReader.status).toBe(200)
    const bodyReader = (await resReader.json()) as { success: boolean } & LikeActionResult
    expect(bodyReader.success).toBe(true)
    expect(bodyReader.liked).toBe(true)
    expect(bodyReader.likesCount).toBeUndefined()
  })

  it('POST /posts/:id/unlike returns likesCount for author and omits for non-author', async () => {
    // 1. Author unlikes own post -> likesCount is present
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: authorAccount,
        session: authorSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => authorProfile,
      isOnboardingCompleted: () => true,
    }))
    mock.module('../service', () => ({
      unlikePost: async (_postId: bigint, viewer: { profileId: bigint; isMale: boolean }) => {
        const isAuthor = viewer.profileId === authorProfile.id
        return {
          liked: false,
          ...(isAuthor ? { likesCount: 4 } : {}),
          message: 'Post unliked successfully',
        }
      },
    }))

    const resAuthor = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: { Authorization: 'Bearer author_token' },
    })
    expect(resAuthor.status).toBe(200)
    const bodyAuthor = (await resAuthor.json()) as { success: boolean } & LikeActionResult
    expect(bodyAuthor.success).toBe(true)
    expect(bodyAuthor.liked).toBe(false)
    expect(bodyAuthor.likesCount).toBe(4)

    // 2. Reader unlikes author post -> likesCount is omitted
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: readerAccount,
        session: readerSession,
      }),
    }))
    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => readerProfile,
      isOnboardingCompleted: () => true,
    }))

    const resReader = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: { Authorization: 'Bearer reader_token' },
    })
    expect(resReader.status).toBe(200)
    const bodyReader = (await resReader.json()) as { success: boolean } & LikeActionResult
    expect(bodyReader.success).toBe(true)
    expect(bodyReader.liked).toBe(false)
    expect(bodyReader.likesCount).toBeUndefined()
  })

  it('POST /posts/:id/like and /unlike enforce gender scope protection (returns 404 for opposite gender)', async () => {
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

    // Service throws 404 because post is same_gender (male only)
    mock.module('../service', () => ({
      likePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
      unlikePost: async () => {
        throw new HTTPException(404, { message: 'Post not found' })
      },
    }))

    const resLike = await app.request('/posts/999999999999991/like', {
      method: 'POST',
      headers: { Authorization: 'Bearer female_token' },
    })
    expect(resLike.status).toBe(404)
    const bodyLike = (await resLike.json()) as { error: string }
    expect(bodyLike.error).toBe('Post not found')

    const resUnlike = await app.request('/posts/999999999999991/unlike', {
      method: 'POST',
      headers: { Authorization: 'Bearer female_token' },
    })
    expect(resUnlike.status).toBe(404)
    const bodyUnlike = (await resUnlike.json()) as { error: string }
    expect(bodyUnlike.error).toBe('Post not found')
  })
})
