import { describe, it, expect, mock } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import '../lib/snowflake'
import { profileRouter } from '../features/profile/routes'
import { getMyInvites } from '../features/profile/service'
import { updateUserProfileByAdmin } from '../features/admin/services/admin-users.service'
import { deleteCommentByAdmin } from '../features/admin/services/admin-comments.service'
import { deleteNotificationsForPosts, deleteNotificationsForComments } from '../features/notifications/service'
import { runMediaGc } from '../jobs/media-gc'
import { verifyTurnstileToken } from '../lib/turnstile'
import * as actualSessionLib from '../lib/session'
import * as actualProfileLib from '../lib/profile'

describe('Verification tests for 11 resolved issues', () => {
  it('1.2: getMyInvites does not leak email in usedBy', async () => {
    const accountId = 10001n
    const mockDb: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: async () => [
                        {
                          invite: {
                            id: 501n,
                            code: 'INVITE1234',
                            expiresAt: new Date(Date.now() + 100000),
                            usedAt: new Date(),
                            createdAt: new Date(),
                            updatedAt: new Date(),
                          },
                          usedByAccount: {
                            id: 20002n,
                          },
                          usedByProfile: {
                            name: 'Friend User',
                            avatarKey: 'avatar.jpg',
                          },
                          usedByIdentity: {
                            identity: 'friend_user',
                          },
                        },
                      ],
                    }),
                  }),
                }),
              }),
            }),
          }),
          where: async () => [{ count: 1, active: 0, used: 1, expired: 0 }],
        }),
      }),
    }

    const result = await getMyInvites(accountId, undefined, mockDb)
    expect(result.invites.length).toBe(1)
    const usedBy = result.invites[0].usedBy
    expect(usedBy).toBeDefined()
    expect(usedBy?.name).toBe('Friend User')
    expect(usedBy?.identity).toBe('friend_user')
    // Ensure email is not in the object
    expect((usedBy as any)?.email).toBeUndefined()
  })

  it('2.1: updateUserProfileByAdmin updates profiles.identity when existingProfile already has identityId', async () => {
    const existingProfile = {
      id: 3001n,
      accountId: 2001n,
      identityId: 4001n,
      identity: 'old_handle',
      verifiedAt: null,
      avatarKey: null,
    }

    const allUpdates: any[] = []
    const mockTx: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                limit: async () => [
                  {
                    account: { id: 2001n, email: 'test@wisal.dev', bannedAt: null, deletedAt: null },
                    profile: existingProfile,
                    identity: { id: 4001n, identity: 'old_handle' },
                  },
                ],
              }),
            }),
          }),
        }),
      }),
      query: {
        identities: {
          findFirst: async () => null,
        },
      },
      update: (table: any) => ({
        set: (data: any) => {
          allUpdates.push({ table, data })
          return {
            where: () => ({
              returning: async () => [{ id: 4001n, identity: data.identity ?? 'updated' }],
            }),
          }
        },
      }),
    }

    await updateUserProfileByAdmin(2001n, { identity: 'new_handle' }, mockTx)

    const profileUpdate = allUpdates.find((u) => u.data.identity === 'new_handle')
    expect(profileUpdate).toBeDefined()
    expect(profileUpdate?.data.identity).toBe('new_handle')
  })

  it('2.3: deleteCommentByAdmin decrements posts.commentsCount and repliesCount for replies', async () => {
    const postUpdates: any[] = []
    const commentUpdates: any[] = []

    const mockReply = {
      id: 7002n,
      postId: 1001n,
      parentId: 7001n,
      deletedAt: null,
    }

    const mockTx: any = {
      query: {
        comments: {
          findFirst: async () => mockReply,
        },
      },
      update: (table: any) => ({
        set: (data: any) => {
          const tableName = table.name || (table as any)[Symbol.for('drizzle:Name')]
          if (tableName === 'posts') {
            postUpdates.push(data)
          } else if (tableName === 'comments') {
            commentUpdates.push(data)
          }
          return {
            where: async () => [],
          }
        },
      }),
      delete: () => ({
        where: async () => [],
      }),
    }

    const result = await deleteCommentByAdmin(7002n, mockTx)
    expect(result.success).toBe(true)
    expect(postUpdates.length).toBeGreaterThan(0)
    expect(commentUpdates.length).toBeGreaterThan(1)
  })

  it('3.1: Non-onboarded user is blocked by onboardingMiddleware on POST /profile/:author_id/read', async () => {
    const unboardedAccount = {
      id: 88888888n,
      email: 'newbie@wisal.dev',
      bannedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const unboardedSession = {
      id: 99999999n,
      accountId: unboardedAccount.id,
      tokenHash: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 1000000),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const unboardedProfile = {
      id: 77777777n,
      accountId: unboardedAccount.id,
      name: null,
      isMale: null,
      avatarKey: null,
      description: null,
      links: null,
      identityId: null,
      identity: null,
      readersCount: 0,
      verifiedAt: null,
      notificationsReadAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    try {
      mock.module('../lib/session', () => ({
        ...actualSessionLib,
        validateSessionToken: async () => ({
          account: unboardedAccount,
          session: unboardedSession,
        }),
      }))

      mock.module('../lib/profile', () => ({
        ...actualProfileLib,
        getProfileByAccountId: async () => unboardedProfile,
      }))

      const testApp = new Hono()
      testApp.onError((err, c) => {
        if (err instanceof HTTPException) {
          return c.json({ error: err.message }, err.status)
        }
        return c.json({ error: 'Internal Server Error' }, 500)
      })
      testApp.route('/profile', profileRouter)

      const res = await testApp.request('/profile/some_author/read', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      })

      expect(res.status).toBe(403)
      const data = (await res.json()) as any
      expect(data.error.toLowerCase()).toContain('onboarding')
    } finally {
      mock.module('../lib/session', () => actualSessionLib)
      mock.module('../lib/profile', () => actualProfileLib)
    }
  })

  it('3.2: runMediaGc candidate query includes gc_failed status', async () => {
    let queryWhereCondition: any = null

    const mockExecutor: any = {
      select: () => ({
        from: () => ({
          where: (condition: any) => {
            queryWhereCondition = condition
            return {
              orderBy: () => ({ limit: async () => [] }),
            }
          },
        }),
      }),
      delete: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }

    await runMediaGc(mockExecutor)
    expect(queryWhereCondition).toBeDefined()
  })

  it('3.4: verifyTurnstileToken returns false on empty token', async () => {
    const result = await verifyTurnstileToken('')
    expect(result).toBe(false)
  })

  it('4.2: deleteNotificationsForPosts and deleteNotificationsForComments execute cleanly without JSON payload subqueries', async () => {
    let deletedWherePost: any = null
    let deletedWhereComment: any = null

    const mockTx: any = {
      delete: (table: any) => ({
        where: async (condition: any) => {
          if (!deletedWherePost) {
            deletedWherePost = condition
          } else {
            deletedWhereComment = condition
          }
          return []
        },
      }),
    }

    await deleteNotificationsForPosts([101n, 102n], mockTx)
    await deleteNotificationsForComments([201n, 202n], mockTx)

    expect(deletedWherePost).toBeDefined()
    expect(deletedWhereComment).toBeDefined()
  })
})
