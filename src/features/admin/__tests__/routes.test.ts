import { describe, it, expect, mock, beforeEach } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
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

  const mockModerator: SafeAdmin = {
    id: 999999999999999n,
    email: 'mod@wisal.dev',
    role: 'moderator',
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
    inviter: null,
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

  it('GET /admin/me returns current authenticated admin', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/me', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; admin: SafeAdmin }
    expect(body.success).toBe(true)
    expect(body.admin.email).toBe(mockAdmin.email)
    expect(body.admin.id.toString()).toBe(mockAdmin.id.toString())
  })

  it('GET /admin/me returns 401 when token is missing', async () => {
    const res = await app.request('/admin/me', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing admin session token')
  })

  it('GET /admin/admins returns paginated list of admins for admin role', async () => {
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

  it('GET /admin/admins rejects moderator with 403', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockModerator,
        session: { ...mockSession, adminId: mockModerator.id },
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/admins', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer mod_token',
      },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Insufficient permissions')
  })

  it('GET /admin/admins parses role and search/q query parameters correctly', async () => {
    let capturedOptions: any = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listAdmins: async (options: any) => {
        capturedOptions = options
        return {
          admins: [],
          total: 0,
          limit: options.limit ?? 50,
          offset: options.offset ?? 0,
        }
      },
    }))

    const res = await app.request('/admin/admins?role=moderator&q=mod@wisal.dev&limit=10&offset=5', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(200)
    expect(capturedOptions.role).toBe('moderator')
    expect(capturedOptions.q).toBe('mod@wisal.dev')
    expect(capturedOptions.limit).toBe(10)
    expect(capturedOptions.offset).toBe(5)
  })

  it('GET /admin/admins rejects invalid role with 400', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/admins?role=superadmin', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(400)
  })

  it('POST /admin/admins creates a new admin account when called by admin', async () => {
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

  it('POST /admin/admins rejects moderator with 403', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockModerator,
        session: { ...mockSession, adminId: mockModerator.id },
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/admins', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mod_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'newmod@wisal.dev',
        password: 'ValidPassword16Chars!',
        role: 'moderator',
      }),
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Insufficient permissions')
  })

  it('DELETE /admin/admins/:id deletes an admin account when called by admin', async () => {
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

  it('DELETE /admin/admins/:id returns 400 when admin has created invites', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      deleteAdmin: async () => {
        throw new HTTPException(400, { message: 'Cannot delete admin who has created invites' })
      },
    }))

    const res = await app.request('/admin/admins/555555555555555', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Cannot delete admin who has created invites')
  })

  it('DELETE /admin/admins/:id rejects moderator with 403', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockModerator,
        session: { ...mockSession, adminId: mockModerator.id },
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/admins/555555555555555', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer mod_token',
      },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Insufficient permissions')
  })

  it('POST /admin/invites creates an invite with auth and returns createdBy with email and id', async () => {
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
    expect(body.invite.createdBy?.email).toBe(mockAdmin.email)
    expect(body.invite.createdBy?.id.toString()).toBe(mockAdmin.id.toString())
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

  it('POST /admin/invites rejects when expiration date is in the past with 400', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const pastDate = new Date(Date.now() - 3600000).toISOString()

    const res = await app.request('/admin/invites', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'CUSTOM-INVITE-2026',
        expiresAt: pastDate,
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('GET /admin/invites returns list of invites with creator info, total, and stats', async () => {
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
        stats: {
          active: 7,
          used: 2,
          expired: 1,
        },
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
    const body = (await res.json()) as {
      success: boolean
      invites: InviteItem[]
      total: number
      stats: { active: number; used: number; expired: number }
    }
    expect(body.success).toBe(true)
    expect(body.invites.length).toBe(1)
    expect(body.invites[0]?.createdBy?.email).toBe(mockAdmin.email)
    expect(body.invites[0]?.createdBy?.id.toString()).toBe(mockAdmin.id.toString())
    expect(body.total).toBe(1)
    expect(body.stats).toEqual({
      active: 7,
      used: 2,
      expired: 1,
    })
  })

  it('GET /admin/invites parses status and search/q query parameters correctly', async () => {
    let capturedOptions: any = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listInvites: async (options: any) => {
        capturedOptions = options
        return {
          invites: [],
          total: 0,
          stats: { active: 0, used: 0, expired: 0 },
          limit: options.limit ?? 50,
          offset: options.offset ?? 0,
        }
      },
    }))

    const res1 = await app.request('/admin/invites?status=active&q=WISAL&limit=10&offset=20', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res1.status).toBe(200)
    expect(capturedOptions.status).toBe('active')
    expect(capturedOptions.q).toBe('WISAL')
    expect(capturedOptions.limit).toBe(10)
    expect(capturedOptions.offset).toBe(20)

    const res2 = await app.request('/admin/invites?status=used&search=user@wisal.dev', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res2.status).toBe(200)
    expect(capturedOptions.status).toBe('used')
    expect(capturedOptions.search).toBe('user@wisal.dev')
  })

  it('GET /admin/invites rejects invalid status with 400', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/invites?status=invalid_status', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
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
              links: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              identity: 'johndoe',
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
    expect(body.users[0].profile.identity).toBe('johndoe')
    expect(body.users[0].profile.identityId).toBeUndefined()
  })

  it('GET /admin/users parses status and search/q query parameters correctly', async () => {
    let capturedOptions: any = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listUsers: async (options: any) => {
        capturedOptions = options
        return {
          users: [],
          total: 0,
          limit: options.limit ?? 50,
          offset: options.offset ?? 0,
        }
      },
    }))

    const res1 = await app.request('/admin/users?status=verified&q=johndoe&limit=25&offset=10', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res1.status).toBe(200)
    expect(capturedOptions.status).toBe('verified')
    expect(capturedOptions.q).toBe('johndoe')
    expect(capturedOptions.limit).toBe(25)
    expect(capturedOptions.offset).toBe(10)

    const res2 = await app.request('/admin/users?status=pending&search=user@wisal.dev', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res2.status).toBe(200)
    expect(capturedOptions.status).toBe('pending')
    expect(capturedOptions.search).toBe('user@wisal.dev')
  })

  it('GET /admin/users rejects invalid status with 400', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/users?status=banned', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(400)
  })

  it('GET /admin/reports returns list of reports with stats', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      listReports: async () => ({
        reports: [
          {
            id: 9990001n,
            targetType: 'post',
            targetId: 8880001n,
            reason: 'spam',
            details: 'Spam post details',
            status: 'pending',
            modNote: null,
            reporter: {
              id: 111111n,
              email: 'reporter@wisal.dev',
              name: 'Reporter',
              identity: 'reporter_guy',
              avatarKey: null,
            },
            reportedUser: {
              id: 222222n,
              email: 'spammer@wisal.dev',
              name: 'Spammer',
              identity: 'spammer_guy',
              avatarKey: null,
            },
            resolvedBy: null,
            resolvedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        stats: {
          pending: 1,
          resolved: 0,
          rejected: 0,
        },
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/admin/reports?status=pending&targetType=post', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      reports: any[]
      total: number
      stats: { pending: number; resolved: number; rejected: number }
    }
    expect(body.success).toBe(true)
    expect(body.reports.length).toBe(1)
    expect(body.reports[0].id).toBe('9990001')
    expect(body.stats.pending).toBe(1)
  })

  it('GET /admin/reports/:id returns single report by ID', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      getReportById: async () => ({
        id: 9990001n,
        targetType: 'comment',
        targetId: 7770001n,
        reason: 'toxicity',
        details: 'Toxic content',
        status: 'pending',
        modNote: null,
        reporter: {
          id: 111111n,
          email: 'reporter@wisal.dev',
          name: 'Reporter',
          identity: 'reporter_guy',
          avatarKey: null,
        },
        reportedUser: {
          id: 222222n,
          email: 'toxic@wisal.dev',
          name: 'Toxic User',
          identity: 'toxic_guy',
          avatarKey: null,
        },
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }))

    const res = await app.request('/admin/reports/9990001', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; report: any }
    expect(body.success).toBe(true)
    expect(body.report.id).toBe('9990001')
    expect(body.report.reason).toBe('toxicity')
  })

  it('PATCH /admin/reports/:id updates report status and modNote', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      updateReportResolution: async (_admin: any, _reportId: bigint, input: any) => ({
        id: 9990001n,
        targetType: 'post',
        targetId: 8880001n,
        reason: 'spam',
        details: 'Spam post details',
        status: input.status,
        modNote: input.modNote,
        reporter: null,
        reportedUser: null,
        resolvedBy: {
          id: mockAdmin.id,
          email: mockAdmin.email,
          role: mockAdmin.role,
        },
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }))

    const res = await app.request('/admin/reports/9990001', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        status: 'resolved',
        modNote: 'Post was removed and user warned',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; report: any }
    expect(body.success).toBe(true)
    expect(body.report.status).toBe('resolved')
    expect(body.report.modNote).toBe('Post was removed and user warned')
    expect(body.report.resolvedBy.email).toBe('admin@wisal.dev')
  })

  it('GET /admin/reports/:id returns 404 when report not found', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      getReportById: async () => {
        throw new HTTPException(404, { message: 'Report not found' })
      },
    }))

    const res = await app.request('/admin/reports/9999999', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Report not found')
  })

  it('GET /admin/users/:id returns user details', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      getUserById: async (id: bigint) => ({
        id,
        email: 'user@wisal.dev',
        createdAt: new Date(),
        updatedAt: new Date(),
        profile: {
          id: 888888n,
          name: 'John Doe',
          isMale: true,
          avatarKey: null,
          description: 'Hello world',
          links: null,
          identity: 'johndoe',
          isVerified: true,
        },
      }),
    }))

    const res = await app.request('/admin/users/123456789', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; user: any }
    expect(body.success).toBe(true)
    expect(body.user.email).toBe('user@wisal.dev')
    expect(body.user.profile.isVerified).toBe(true)
  })

  it('GET /admin/users/:id returns 404 when user not found', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      getUserById: async () => {
        throw new HTTPException(404, { message: 'User not found' })
      },
    }))

    const res = await app.request('/admin/users/999999999', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('User not found')
  })

  it('PATCH /admin/users/:id updates profile fields and sets isVerified to true', async () => {
    let capturedId: bigint | null = null
    let capturedData: any = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      updateUserProfileByAdmin: async (id: bigint, input: any) => {
        capturedId = id
        capturedData = input
        return {
          id,
          email: 'user@wisal.dev',
          createdAt: new Date(),
          updatedAt: new Date(),
          profile: {
            id: 888888n,
            name: input.name ?? 'John Doe',
            isMale: input.isMale ?? true,
            avatarKey: null,
            description: input.description ?? null,
            links: null,
            identity: input.identity ?? 'johndoe',
            isVerified: Boolean(input.isVerified),
          },
        }
      },
    }))

    const res = await app.request('/admin/users/123456789', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        name: 'Updated Name',
        isVerified: true,
        identity: 'alex_vip',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; user: any }
    expect(body.success).toBe(true)
    expect(body.user.profile.name).toBe('Updated Name')
    expect(body.user.profile.isVerified).toBe(true)
    expect(capturedId as bigint | null).toBe(123456789n)
    expect(capturedData.isVerified).toBe(true)
    expect(capturedData.name).toBe('Updated Name')
  })

  it('PATCH /admin/users/:id rejects identity starting with digits or invalid format', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res1 = await app.request('/admin/users/123456789', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        identity: '12345',
      }),
    })
    expect(res1.status).toBe(400)

    const res2 = await app.request('/admin/users/123456789', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        identity: '1user',
      }),
    })
    expect(res2.status).toBe(400)

    const res3 = await app.request('/admin/users/123456789', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        identity: '_user',
      }),
    })
    expect(res3.status).toBe(400)
  })

  it('PATCH /admin/users/:id resets verification when isVerified: false', async () => {
    let capturedData: any = null

    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    mock.module('../service', () => ({
      updateUserProfileByAdmin: async (id: bigint, input: any) => {
        capturedData = input
        return {
          id,
          email: 'user@wisal.dev',
          createdAt: new Date(),
          updatedAt: new Date(),
          profile: {
            id: 888888n,
            name: 'John Doe',
            isMale: true,
            avatarKey: null,
            description: null,
            links: null,
            identity: 'johndoe',
            isVerified: false,
          },
        }
      },
    }))

    const res = await app.request('/admin/users/123456789', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        isVerified: false,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; user: any }
    expect(body.success).toBe(true)
    expect(body.user.profile.isVerified).toBe(false)
    expect(capturedData.isVerified).toBe(false)
  })

  describe('Moderator Role RBAC Restrictions', () => {
    const mockModerator = {
      id: 999999999999999n,
      email: 'mod@wisal.dev',
      role: 'moderator' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    beforeEach(() => {
      mock.module('../../../lib/admin-session', () => ({
        validateAdminSessionToken: async () => ({
          admin: mockModerator,
          session: mockSession,
        }),
        ADMIN_COOKIE_NAME: 'admin_session',
      }))
    })

    it('allows moderator to browse users for targeted moderation', async () => {
      mock.module('../service', () => ({ listUsers: async () => ({ users: [], total: 0, limit: 50, offset: 0 }) }))
      const res = await app.request('/admin/users', {
        headers: { Authorization: 'Bearer mod_token' },
      })
      expect(res.status).toBe(200)
    })

    it('allows moderator to browse posts', async () => {
      mock.module('../service', () => ({ listPostsByAdmin: async () => ({ posts: [], total: 0, limit: 50, offset: 0 }) }))
      const res = await app.request('/admin/posts', {
        headers: { Authorization: 'Bearer mod_token' },
      })
      expect(res.status).toBe(200)
    })

    it('allows moderator to browse comments', async () => {
      mock.module('../service', () => ({ listCommentsByAdmin: async () => ({ comments: [], total: 0, limit: 50, offset: 0 }) }))
      const res = await app.request('/admin/comments', {
        headers: { Authorization: 'Bearer mod_token' },
      })
      expect(res.status).toBe(200)
    })

    it('allows moderator to ban a specific user', async () => {
      mock.module('../service', () => ({ banUserAccount: async () => ({ success: true }) }))
      const res = await app.request('/admin/users/12345/ban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mod_token',
        },
        body: JSON.stringify({ reason: 'Spamming' }),
      })
      expect(res.status).toBe(200)
    })

    it('allows moderator to remove a specific post', async () => {
      mock.module('../service', () => ({ deletePostByAdmin: async () => ({ success: true }) }))
      const res = await app.request('/admin/posts/12345', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer mod_token' },
      })
      expect(res.status).toBe(200)
    })

    it('blocks moderator from changing profile verification and editing posts', async () => {
      const headers = { Authorization: 'Bearer mod_token', 'Content-Type': 'application/json' }
      const profile = await app.request('/admin/users/12345', {
        method: 'PATCH', headers, body: JSON.stringify({ isVerified: true }),
      })
      expect(profile.status).toBe(403)
      const post = await app.request('/admin/posts/12345', {
        method: 'PATCH', headers, body: JSON.stringify({ content: 'Changed by moderator' }),
      })
      expect(post.status).toBe(403)
    })
  })
})
