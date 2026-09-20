import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { AdminPostItem } from '../types'

describe('Admin Posts Moderation Tests', () => {
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

  const mockPost: AdminPostItem = {
    id: 888888888888881n,
    authorId: 333333333333333n,
    type: 'text',
    payload: {},
    content: 'Admin visible post content',
    genderScope: 'same_gender',
    accessLevel: 'registered',
    isFeed: true,
    isPinned: false,
    savesCount: 5,
    likesCount: 12,
    commentsCount: 3,
    viewsCount: 40,
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

  it('GET /admin/posts returns list of posts with filters', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      listPostsByAdmin: async () => ({
        posts: [mockPost],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      getPostByIdByAdmin: async () => mockPost,
      deletePostByAdmin: async () => ({ success: true, message: 'Post deleted successfully by admin' }),
      restorePostByAdmin: async () => ({ success: true, message: 'Post restored successfully' }),
      updatePostByAdmin: async () => ({ ...mockPost, isFeed: false }),
    }))

    const res = await app.request('/admin/posts?status=active&type=text', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].id).toBe('888888888888881')
    expect(body.posts[0].author.email).toBe('author@wisal.dev')
  })

  it('GET /admin/posts/:id returns full post details for admin', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      getPostByIdByAdmin: async () => mockPost,
    }))

    const res = await app.request('/admin/posts/888888888888881', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.post.id).toBe('888888888888881')
  })

  it('DELETE /admin/posts/:id soft-deletes a post', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      deletePostByAdmin: async () => ({ success: true, message: 'Post deleted successfully by admin' }),
    }))

    const res = await app.request('/admin/posts/888888888888881', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
  })

  it('POST /admin/posts/:id/restore restores a deleted post', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      restorePostByAdmin: async () => ({ success: true, message: 'Post restored successfully' }),
    }))

    const res = await app.request('/admin/posts/888888888888881/restore', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
  })

  it('PATCH /admin/posts/:id updates post properties', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      updatePostByAdmin: async () => ({ ...mockPost, isFeed: false }),
    }))

    const res = await app.request('/admin/posts/888888888888881', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token',
      },
      body: JSON.stringify({
        isFeed: false,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.post.isFeed).toBe(false)
  })
})
