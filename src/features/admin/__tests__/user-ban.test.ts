import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'

describe('Admin User Ban and Moderation Tests', () => {
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

  it('POST /admin/users/:id/ban bans a user successfully', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      banUserAccount: async () => ({
        success: true,
        message: 'User banned successfully',
      }),
      unbanUserAccount: async () => ({
        success: true,
        message: 'User unbanned successfully',
      }),
      revokeUserSessions: async () => ({
        success: true,
        count: 2,
      }),
    }))

    const res = await app.request('/admin/users/444444444444444/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token',
      },
      body: JSON.stringify({
        reason: 'Violating community standards repeatedly',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.message).toBe('User banned successfully')
  })

  it('POST /admin/users/:id/unban unbans a user successfully', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      unbanUserAccount: async () => ({
        success: true,
        message: 'User unbanned successfully',
      }),
    }))

    const res = await app.request('/admin/users/444444444444444/unban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token',
      },
      body: JSON.stringify({
        reason: 'Appeal accepted by moderation board',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.message).toBe('User unbanned successfully')
  })

  it('DELETE /admin/users/:id/sessions revokes all sessions of user', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      revokeUserSessions: async () => ({
        success: true,
        count: 3,
      }),
    }))

    const res = await app.request('/admin/users/444444444444444/sessions', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.count).toBe(3)
  })

  it('POST /admin/users/:id/ban rejects empty reason', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    const res = await app.request('/admin/users/444444444444444/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token',
      },
      body: JSON.stringify({
        reason: '   ',
      }),
    })

    expect(res.status).toBe(400)
  })
})
