import { describe, it, expect, mock } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authMiddleware, extractBearerToken } from '../auth'
import type { SafeAccount } from '../../db/schema/accounts'
import type { Session } from '../../db/schema/sessions'

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

describe('Auth Middleware Unit Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    bannedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession: Session = {
    id: 222222222222222n,
    accountId: mockAccount.id,
    tokenHash: 'c'.repeat(64),
    expiresAt: new Date(Date.now() + 100000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('extracts bearer token correctly from header', () => {
    expect(extractBearerToken('Bearer secret-token-123')).toBe('secret-token-123')
    expect(extractBearerToken('bearer secret-token-123')).toBe('secret-token-123')
    expect(extractBearerToken('secret-token-123')).toBe('secret-token-123')
    expect(extractBearerToken('')).toBeNull()
    expect(extractBearerToken(null)).toBeNull()
  })

  it('authMiddleware returns 401 when Authorization header is missing', async () => {
    const app = createTestApp()
    app.use('/profile', authMiddleware)
    app.get('/profile', (c) => c.json({ ok: true }))

    const res = await app.request('/profile')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })

  it('authMiddleware returns 401 on invalid token', async () => {
    const app = createTestApp()
    app.use('/profile', authMiddleware)
    app.get('/profile', (c) => c.json({ ok: true }))

    mock.module('../../lib/session', () => ({
      validateSessionToken: async () => null,
    }))

    const res = await app.request('/profile', {
      headers: { Authorization: 'Bearer invalid_user_token' },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid or expired session token')
  })

  it('authMiddleware sets account and session in context for valid token', async () => {
    const app = createTestApp()
    app.use('/profile', authMiddleware)
    app.get('/profile', (c) => {
      const account = c.get('account')
      const session = c.get('session')
      return c.json({ email: account.email, sessionId: session.id.toString() })
    })

    mock.module('../../lib/session', () => ({
      validateSessionToken: async (token: string) => {
        if (token === 'valid_user_token') {
          return { account: mockAccount, session: mockSession }
        }
        return null
      },
    }))

    const res = await app.request('/profile', {
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { email: string; sessionId: string }
    expect(body.email).toBe('user@wisal.dev')
    expect(body.sessionId).toBe('222222222222222')
  })
})
