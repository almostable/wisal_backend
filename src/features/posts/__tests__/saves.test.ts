import { describe, it, expect } from 'bun:test'
import { app } from '../../..'
import { mock } from 'bun:test'
import type { PostResponse } from '../types'
import { HTTPException } from 'hono/http-exception'

describe('Posts Saves Feature Unit & Integration Tests', () => {
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

  it('GET /posts/:id returns savesCount for author and omits it for non-author', async () => {
    // 1. Author requests own post -> savesCount is returned
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
          authorGender: true,
          type: 'text',
          payload: {},
          content: 'Author post',
          genderScope: 'all',
          accessLevel: 'public',
          isPinned: false,
          ...(isAuthor ? { savesCount: 42 } : {}),
          commentsCount: 0,
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
    expect(bodyAuthor.post.savesCount).toBe(42)
    expect(bodyAuthor.post.isSaved).toBe(true)

    // 2. Reader requests author post -> savesCount is omitted
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
    expect(bodyReader.post.savesCount).toBeUndefined()
    expect(bodyReader.post.isSaved).toBe(true)
  })

  it('GET /posts/saves validates pagination query parameters', async () => {
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
      getSavedPosts: async () => ({
        posts: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    }))

    // Negative limit or offset rejects
    const resInvalid = await app.request('/posts/saves?limit=-1', {
      method: 'GET',
      headers: { Authorization: 'Bearer author_token' },
    })
    expect(resInvalid.status).toBe(400)

    const resValid = await app.request('/posts/saves?limit=25&offset=50', {
      method: 'GET',
      headers: { Authorization: 'Bearer author_token' },
    })
    expect(resValid.status).toBe(200)
  })
})
