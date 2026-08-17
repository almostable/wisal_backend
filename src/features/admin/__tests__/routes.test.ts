import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import * as adminService from '../service'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { InviteItem } from '../types'

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

  const mockInvite: InviteItem = {
    id: 333333333333333n,
    code: 'WISAL-A1B2-C3D4',
    expiresAt: new Date(Date.now() + 86400000),
    createdBy: {
      id: mockAdmin.id,
      email: mockAdmin.email,
      role: mockAdmin.role,
    },
    created_by: {
      id: mockAdmin.id,
      email: mockAdmin.email,
      role: mockAdmin.role,
    },
    usedById: null,
    usedBy: null,
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
        throw new HTTPException(401, { message: 'Invalid email or password' })
      },
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
    expect(body.error).toBe('Invalid email or password')
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

  it('GET /admin/admins returns paginated list of admins', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listAdmins: async () => ({
        admins: [mockAdmin],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/admin/admins', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; admins: SafeAdmin[]; total: number }
    expect(body.success).toBe(true)
    expect(body.admins.length).toBe(1)
    expect(body.admins[0].email).toBe('admin@wisal.dev')
    expect(body.total).toBe(1)
  })

  it('POST /admin/admins creates a new admin account', async () => {
    const createdAdmin: SafeAdmin = {
      id: 444444444444444n,
      email: 'newmod@wisal.dev',
      role: 'moderator',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      createAdmin: async (input: any) => ({
        ...createdAdmin,
        email: input.email,
        role: input.role ?? 'moderator',
      }),
    }))

    const res = await app.request('/admin/admins', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'newmod@wisal.dev',
        password: 'ValidPassword16Chars!',
        role: 'moderator',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; admin: SafeAdmin }
    expect(body.success).toBe(true)
    expect(body.admin.email).toBe('newmod@wisal.dev')
    expect(body.admin.role).toBe('moderator')
  })

  it('DELETE /admin/admins/:id deletes an admin account', async () => {
    let deletedAdminId: bigint | null = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      deleteAdmin: async (targetAdminId: bigint) => {
        deletedAdminId = targetAdminId
      },
    }))

    const res = await app.request('/admin/admins/555555555555555', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(deletedAdminId as bigint | null).toBe(555555555555555n)
  })

  it('POST /admin/invites creates an invite with auth and returns created_by with email and id', async () => {
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
    const body = (await res.json()) as { success: boolean; invite: InviteItem }
    expect(body.success).toBe(true)
    expect(body.invite.code).toBe('CUSTOM-INVITE-2026')
    expect(body.invite.createdBy.email).toBe(mockAdmin.email)
    expect(body.invite.created_by.email).toBe(mockAdmin.email)
    expect(body.invite.created_by.id.toString()).toBe(mockAdmin.id.toString())
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
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('GET /admin/invites returns list of invites with creator info', async () => {
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
    }))

    const res = await app.request('/admin/invites', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; invites: InviteItem[]; total: number }
    expect(body.success).toBe(true)
    expect(body.invites.length).toBe(1)
    expect(body.invites[0].created_by.email).toBe(mockAdmin.email)
    expect(body.invites[0].created_by.id.toString()).toBe(mockAdmin.id.toString())
    expect(body.total).toBe(1)
  })

  it('DELETE /admin/invites/:id deletes an invite', async () => {
    let deletedInviteId: bigint | null = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      deleteInvite: async (inviteId: bigint) => {
        deletedInviteId = inviteId
      },
    }))

    const res = await app.request('/admin/invites/333333333333333', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(deletedInviteId as bigint | null).toBe(333333333333333n)
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
