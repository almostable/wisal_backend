import { describe, it, expect, mock } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { adminAuthMiddleware, requireAdminRole, optionalAdminAuthMiddleware } from '../admin'
import type { SafeAdmin } from '../../db/schema/admins'
import type { AdminSession } from '../../db/schema/admin-sessions'

function createTestApp() {
  const app = new Hono()
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    return c.json({ error: 'Internal Server Error' }, 500)
  })
  return app
}

describe('Admin Middleware Unit Tests', () => {
  const mockAdmin: SafeAdmin = {
    id: 123456789012345n,
    email: 'admin@wisal.dev',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockModerator: SafeAdmin = {
    id: 987654321098765n,
    email: 'mod@wisal.dev',
    role: 'moderator',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession: AdminSession = {
    id: 555555555555555n,
    adminId: mockAdmin.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 100000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('adminAuthMiddleware returns 401 when Authorization header is missing', async () => {
    const app = createTestApp()
    app.use('/admin/*', adminAuthMiddleware)
    app.get('/admin/dashboard', (c) => c.json({ ok: true }))

    const res = await app.request('/admin/dashboard')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing admin session token')
  })

  it('adminAuthMiddleware returns 401 on invalid token', async () => {
    const app = createTestApp()
    app.use('/admin/*', adminAuthMiddleware)
    app.get('/admin/dashboard', (c) => c.json({ ok: true }))

    mock.module('../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => null,
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/dashboard', {
      headers: { Authorization: 'Bearer invalid_token' },
    })
    expect(res.status).toBe(401)
  })

  it('adminAuthMiddleware sets admin and adminSession in context for valid token', async () => {
    const app = createTestApp()
    app.use('/admin/*', adminAuthMiddleware)
    app.get('/admin/dashboard', (c) => {
      const admin = c.get('admin')
      const session = c.get('adminSession')
      return c.json({ adminEmail: admin.email, role: admin.role, sessionId: session.id.toString() })
    })

    mock.module('../../lib/admin-session', () => ({
      validateAdminSessionToken: async (token: string) => {
        if (token === 'valid_admin_token') {
          return { admin: mockAdmin, session: mockSession }
        }
        return null
      },
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const res = await app.request('/admin/dashboard', {
      headers: { Authorization: 'Bearer valid_admin_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { adminEmail: string; role: string; sessionId: string }
    expect(body.adminEmail).toBe('admin@wisal.dev')
    expect(body.role).toBe('admin')
  })

  it('requireAdminRole allows authorized role and blocks unauthorized role with 403', async () => {
    const app = createTestApp()
    app.use('/admin/super/*', adminAuthMiddleware, requireAdminRole('admin'))
    app.get('/admin/super/settings', (c) => c.json({ secret: 'super_secret' }))

    // 1. Moderator trying to access super settings -> 403
    mock.module('../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockModerator,
        session: { ...mockSession, adminId: mockModerator.id },
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const resForbidden = await app.request('/admin/super/settings', {
      headers: { Authorization: 'Bearer mod_token' },
    })
    expect(resForbidden.status).toBe(403)
    const forbidBody = (await resForbidden.json()) as { error: string }
    expect(forbidBody.error).toBe('Insufficient permissions')

    // 2. Admin accessing super settings -> 200
    mock.module('../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const resOk = await app.request('/admin/super/settings', {
      headers: { Authorization: 'Bearer admin_token' },
    })
    expect(resOk.status).toBe(200)
    const okBody = (await resOk.json()) as { secret: string }
    expect(okBody.secret).toBe('super_secret')
  })

  it('optionalAdminAuthMiddleware works with and without token', async () => {
    const app = createTestApp()
    app.use('/test', optionalAdminAuthMiddleware)
    app.get('/test', (c) => {
      const admin = c.get('admin')
      return c.json({ isAuthenticated: Boolean(admin) })
    })

    const resNoToken = await app.request('/test')
    expect(resNoToken.status).toBe(200)
    const noTokenBody = (await resNoToken.json()) as { isAuthenticated: boolean }
    expect(noTokenBody.isAuthenticated).toBe(false)

    mock.module('../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockSession,
      }),
      ADMIN_COOKIE_NAME: 'admin_session',
    }))

    const resWithToken = await app.request('/test', {
      headers: { Authorization: 'Bearer some_token' },
    })
    expect(resWithToken.status).toBe(200)
    const tokenBody = (await resWithToken.json()) as { isAuthenticated: boolean }
    expect(tokenBody.isAuthenticated).toBe(true)
  })
})
