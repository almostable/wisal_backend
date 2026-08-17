import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import * as adminService from '../service'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { Invite } from '../../../db/schema/invites'

describe('Admin Feature Route Tests', () => {
  const mockAdmin: SafeAdmin = {
    id: 111111111111111n,
    email: 'admin@wisal.dev',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession: AdminSession = {
    id: 222222222222222n,
    adminId: mockAdmin.id,
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockInvite: Invite = {
    id: 333333333333333n,
    code: 'WISAL-A1B2-C3D4',
    expiresAt: new Date(Date.now() + 86400000),
    createdById: mockAdmin.id,
    usedById: null,
    usedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('POST /admin/login handles valid login and sets cookie', async () => {
    mock.module('../service', () => ({
      loginAdmin: async () => ({
        admin: mockAdmin,
        session: mockSession,
        token: 'secret_token_123',
      }),
      generateRandomInviteCode: adminService.generateRandomInviteCode,
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@wisal.dev',
        password: 'AdminPassword16Chars!',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; token: string; admin: SafeAdmin }
    expect(body.success).toBe(true)
    expect(body.token).toBe('secret_token_123')
    expect(body.admin.email).toBe('admin@wisal.dev')

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain('admin_session=secret_token_123')
    expect(setCookie).toContain('HttpOnly')
  })

  it('POST /admin/login handles invalid credentials with 401', async () => {
    mock.module('../service', () => ({
      loginAdmin: async () => {
        throw new adminService.AdminServiceError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
      },
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@wisal.dev',
        password: 'WrongPassword!',
      }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('INVALID_CREDENTIALS')
  })

  it('POST /admin/logout invalidates session and clears cookie', async () => {
    let logoutCalled = false
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
      ADMIN_SESSION_TTL_DAYS: 30,
    }))

    mock.module('../service', () => ({
      logoutAdmin: async (sessionId: bigint) => {
        if (sessionId === mockSession.id) {
          logoutCalled = true
        }
      },
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/logout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(logoutCalled).toBe(true)

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain('admin_session=')
  })

  it('POST /admin/invites creates an invite with auth', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      createInvite: async (_adminId: bigint, input: any) => ({
        ...mockInvite,
        code: input.code ?? mockInvite.code,
      }),
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/invites', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'CUSTOM-INVITE-2026',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; invite: Invite }
    expect(body.success).toBe(true)
    expect(body.invite.code).toBe('CUSTOM-INVITE-2026')
  })

  it('POST /admin/invites rejects when expiration is missing with 400', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/invites', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'CUSTOM-INVITE-2026',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('VALIDATION_ERROR')
  })

  it('GET /admin/invites returns list of invites', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listInvites: async () => ({
        invites: [mockInvite],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/invites', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; invites: Invite[]; total: number }
    expect(body.success).toBe(true)
    expect(body.invites.length).toBe(1)
    expect(body.total).toBe(1)
  })

  it('GET /admin/users returns list of users with profiles', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listUsers: async () => ({
        users: [
          {
            id: 999999n,
            email: 'user@wisal.dev',
            createdAt: new Date(),
            updatedAt: new Date(),
            profile: {
              id: 888888n,
              accountId: 999999n,
              name: 'John Doe',
              isMale: true,
              avatarKey: null,
              description: 'Hello world',
              identityId: 777777n,
              createdAt: new Date(),
              updatedAt: new Date(),
              identity: {
                id: 777777n,
                identity: 'johndoe',
                type: 'user',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
      AdminServiceError: adminService.AdminServiceError,
    }))

    const res = await app.request('/admin/users', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; users: any[]; total: number }
    expect(body.success).toBe(true)
    expect(body.users.length).toBe(1)
    expect(body.users[0].email).toBe('user@wisal.dev')
    expect(body.users[0].profile.identity.identity).toBe('johndoe')
  })
})
