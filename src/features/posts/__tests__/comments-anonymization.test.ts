import { describe, it, expect, mock, afterAll } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'

describe('Comments Anonymization Integration Tests', () => {
  afterAll(() => {
    mock.restore()
  })

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
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const viewerProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: viewerAccount.id,
    name: 'Viewer',
    isMale: true,
    avatarKey: null,
    description: null,
    contacts: null,
    identityId: 444444444444444n,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'viewer',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const setupAuth = () => {
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
  }

  it('GET /posts/:id/comments returns anonymized author with isDeleted: true for deleted user', async () => {
    setupAuth()

    mock.module('../service', () => ({
      getPostComments: async () => ({
        comments: [
          {
            id: 888888888888881n,
            postId: 999999999999991n,
            authorId: 555555555555555n,
            parentId: null,
            replyToCommentId: null,
            replyToUser: null,
            type: 'text',
            payload: {},
            content: 'Comment by deleted user',
            repliesCount: 0,
            createdAt: new Date('2026-08-20T00:00:00.000Z'),
            updatedAt: new Date('2026-08-20T00:00:00.000Z'),
            editedAt: null,
            author: {
              id: 555555555555555n,
              name: null,
              identity: null,
              avatarKey: null,
              isMale: null,
              isDeleted: true,
            },
          },
          {
            id: 888888888888882n,
            postId: 999999999999991n,
            authorId: 111111111111111n,
            parentId: null,
            replyToCommentId: null,
            replyToUser: null,
            type: 'text',
            payload: {},
            content: 'Comment by active user',
            repliesCount: 0,
            createdAt: new Date('2026-08-20T00:01:00.000Z'),
            updatedAt: new Date('2026-08-20T00:01:00.000Z'),
            editedAt: null,
            author: {
              id: 111111111111111n,
              name: 'Viewer',
              identity: 'viewer',
              avatarKey: null,
              isMale: true,
            },
          },
        ],
        total: 2,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/posts/999999999999991/comments', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(2)

    // Deleted author checks
    const deletedComment = body.comments[0]
    expect(deletedComment.author.isDeleted).toBe(true)
    expect(deletedComment.author.name).toBeNull()
    expect(deletedComment.author.identity).toBeNull()
    expect(deletedComment.author.avatarKey).toBeNull()
    expect(deletedComment.author.isMale).toBeNull()
    expect(deletedComment.content).toBe('Comment by deleted user')

    // Active author checks: isDeleted should be omitted
    const activeComment = body.comments[1]
    expect(activeComment.author.isDeleted).toBeUndefined()
    expect(activeComment.author.name).toBe('Viewer')
    expect(activeComment.author.identity).toBe('viewer')
  })

  it('GET /posts/:id/comments returns isDeleted: true for replyToProfile when target was deleted', async () => {
    setupAuth()

    mock.module('../service', () => ({
      getPostComments: async () => ({
        comments: [
          {
            id: 888888888888883n,
            postId: 999999999999991n,
            authorId: 111111111111111n,
            parentId: 888888888888881n,
            replyToCommentId: 888888888888881n,
            replyToProfile: {
              id: 555555555555555n,
              name: null,
              identity: null,
              isDeleted: true,
            },
            type: 'text',
            payload: {},
            content: 'Reply to deleted user comment',
            repliesCount: 0,
            createdAt: new Date('2026-08-20T00:02:00.000Z'),
            updatedAt: new Date('2026-08-20T00:02:00.000Z'),
            editedAt: null,
            author: {
              id: 111111111111111n,
              name: 'Viewer',
              identity: 'viewer',
              avatarKey: null,
              isMale: true,
            },
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
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.comments.length).toBe(1)

    const reply = body.comments[0]
    expect(reply.replyToProfile).toBeDefined()
    expect(reply.replyToProfile.isDeleted).toBe(true)
    expect(reply.replyToProfile.name).toBeNull()
    expect(reply.replyToProfile.identity).toBeNull()
    expect(reply.author.isDeleted).toBeUndefined()
  })
})
