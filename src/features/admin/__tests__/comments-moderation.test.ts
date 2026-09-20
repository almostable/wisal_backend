import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { AdminCommentItem } from '../types'

describe('Admin Comments Moderation Tests', () => {
  const mockAdmin: SafeAdmin = {
    id: 111111111111111n,
    email: 'admin@wisal.dev',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockAdminSession: AdminSession = {
    id: 222222222222222n,
    adminId: mockAdmin.id,
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockComment: AdminCommentItem = {
    id: 777777777777771n,
    postId: 888888888888881n,
    authorId: 333333333333333n,
    parentId: null,
    replyToCommentId: null,
    replyToProfileId: null,
    type: 'text',
    payload: {},
    content: 'Admin visible comment content',
    repliesCount: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    editedAt: null,
    author: {
      id: 333333333333333n,
      accountId: 444444444444444n,
      email: 'author@wisal.dev',
      name: 'Author Name',
      identity: 'author_handle',
      avatarKey: null,
      isMale: true,
      isVerified: true,
    },
  }

  it('GET /admin/comments returns list of comments with search and filter', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      listCommentsByAdmin: async () => ({
        comments: [mockComment],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      getPostCommentsByAdmin: async () => [mockComment],
      deleteCommentByAdmin: async () => ({ success: true, message: 'Comment deleted successfully by admin' }),
      restoreCommentByAdmin: async () => ({ success: true, message: 'Comment restored successfully' }),
    }))

    const res = await app.request('/admin/comments?status=active', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0].id).toBe('777777777777771')
  })

  it('GET /admin/posts/:id/comments returns thread comments for admin', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      getPostCommentsByAdmin: async () => [mockComment],
    }))

    const res = await app.request('/admin/posts/888888888888881/comments', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.comments).toHaveLength(1)
  })

  it('DELETE /admin/comments/:id soft-deletes a comment', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      deleteCommentByAdmin: async () => ({ success: true, message: 'Comment deleted successfully by admin' }),
    }))

    const res = await app.request('/admin/comments/777777777777771', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
  })

  it('POST /admin/comments/:id/restore restores a deleted comment', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      restoreCommentByAdmin: async () => ({ success: true, message: 'Comment restored successfully' }),
    }))

    const res = await app.request('/admin/comments/777777777777771/restore', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
  })
})
