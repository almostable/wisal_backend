import { describe, it, expect, mock } from 'bun:test'
import { app } from '../../../index'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import { HTTPException } from 'hono/http-exception'

describe('Post Deletion Route and Service Cascade Tests', () => {
  const authorAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'author@wisal.dev',
    bannedAt: null,
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
    links: null,
    identityId: 444444444444444n,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: null,
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

  it('DELETE /posts/:id calls deletePost and returns success', async () => {
    setupAuth()

    let deletedPostId: bigint | null = null
    let deletedAuthorProfileId: bigint | null = null

    mock.module('../service', () => ({
      deletePost: async (authorProfileId: bigint, postId: bigint) => {
        deletedAuthorProfileId = authorProfileId
        deletedPostId = postId
        return {
          success: true,
          message: 'Post deleted successfully',
        }
      },
    }))

    const res = await app.request('/posts/555555555555555', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(deletedPostId!).toBe(555555555555555n)
    expect(deletedAuthorProfileId!).toBe(authorProfile.id)
  })

  it('DELETE /posts/:id returns 403 when trying to delete another author post', async () => {
    setupAuth()

    mock.module('../service', () => ({
      deletePost: async () => {
        throw new HTTPException(403, { message: 'You can only delete your own posts' })
      },
    }))

    const res = await app.request('/posts/999999999999999', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as any
    expect(body.error).toBe('You can only delete your own posts')
  })
})
