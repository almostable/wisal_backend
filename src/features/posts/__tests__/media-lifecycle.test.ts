import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'

describe('Posts & Comments Media Lifecycle Route Integration Tests', () => {
  const authorAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'author@wisal.dev',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const authorSession: Session = {
    id: 222222222222222n,
    accountId: authorAccount.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const authorProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: authorAccount.id,
    name: 'Author User',
    isMale: true,
    avatarKey: null,
    description: 'Bio',
    shortDescription: null,
    contacts: null,
    identityId: 444444444444444n,
    regularReadersCount: 0,
    readersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'author_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const setupAuth = () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async (token: string) => {
        if (token === 'valid_token') {
          return {
            account: authorAccount,
            session: authorSession,
          }
        }
        return null
      },
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => authorProfile,
      isOnboardingCompleted: () => true,
    }))
  }

  it('POST /posts returns 400 when createPost throws IDOR rejection for unowned media', async () => {
    setupAuth()

    mock.module('../service', () => ({
      createPost: async () => {
        throw new HTTPException(400, {
          message:
            'Invalid media files: one or more files are invalid, already attached, or do not belong to you',
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
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-09-04/999999999999999.jpg',
              width: 1920,
              height: 1080,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('Invalid media files')
  })

  it('POST /posts returns 201 when createPost succeeds for valid media files', async () => {
    setupAuth()

    mock.module('../service', () => ({
      createPost: async () => ({
        id: '333333333333333',
        authorId: '111111111111111',
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-09-04/111111111111111.jpg',
              width: 1920,
              height: 1080,
            },
          ],
        },
        content: '',
        genderScope: 'all',
        accessLevel: 'public',
        isPinned: false,
        savesCount: 0,
        commentsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: '111111111111111',
          name: 'Author User',
          identity: 'author_user',
          avatarKey: null,
        },
        isSaved: false,
        canEdit: true,
      }),
    }))

    const res = await app.request('/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media',
        payload: {
          media: [
            {
              fileKey: 'media/2026-09-04/111111111111111.jpg',
              width: 1920,
              height: 1080,
            },
          ],
        },
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; post: any }
    expect(body.success).toBe(true)
    expect(body.post.type).toBe('media')
  })

  it('DELETE /posts/:id calls deletePost and returns 200', async () => {
    setupAuth()
    let deletedPostId: bigint | null = null

    mock.module('../service', () => ({
      deletePost: async (_authorId: bigint, postId: bigint) => {
        deletedPostId = postId
        return { success: true, message: 'Post deleted successfully' }
      },
    }))

    const res = await app.request('/posts/333333333333333', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    expect(deletedPostId as any).toBe(333333333333333n)
  })

  it('DELETE /posts/comments/:id calls deleteComment and returns 200', async () => {
    setupAuth()
    let deletedCommentId: bigint | null = null

    mock.module('../service', () => ({
      deleteComment: async (_authorId: bigint, commentId: bigint) => {
        deletedCommentId = commentId
        return { success: true, message: 'Comment deleted successfully' }
      },
    }))

    const res = await app.request('/posts/comments/444444444444444', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    expect(deletedCommentId as any).toBe(444444444444444n)
  })
})
