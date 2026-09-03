import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { SafeProfile } from '../../../lib/profile'

describe('Auth Feature Route Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession: Session = {
    id: 222222222222222n,
    accountId: mockAccount.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockProfile: SafeProfile = {
    id: 333333333333333n,
    name: 'Wisal User',
    isMale: true,
    avatarKey: null,
    description: 'Test description',
    contacts: null,
    identity: 'wisaluser',
  }

  it('POST /auth/register registers a new user with valid invite code and returns session token', async () => {
    mock.module('../service', () => ({
      registerUser: async () => ({
        account: mockAccount,
        token: 'user_session_token_123',
        profile: null,
        isOnboardingCompleted: false,
      }),
    }))

    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'ValidUserPassword123!',
        inviteCode: 'WISAL-A1B2-C3D4',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      success: boolean
      token: string
      account: SafeAccount
      isOnboardingCompleted: boolean
    }
    expect(body.success).toBe(true)
    expect(body.token).toBe('user_session_token_123')
    expect(body.account.email).toBe('user@wisal.dev')
    expect(body.isOnboardingCompleted).toBe(false)
    expect((body as any).session).toBeUndefined()
  })

  it('POST /auth/register rejects short password with 400', async () => {
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'short',
        inviteCode: 'WISAL-A1B2-C3D4',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('POST /auth/register handles duplicate email with 409', async () => {
    mock.module('../service', () => ({
      registerUser: async () => {
        throw new HTTPException(409, { message: 'Account with this email already exists' })
      },
    }))

    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'ValidUserPassword123!',
        inviteCode: 'WISAL-A1B2-C3D4',
      }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Account with this email already exists')
  })

  it('POST /auth/register handles invalid or expired invite code with 400', async () => {
    mock.module('../service', () => ({
      registerUser: async () => {
        throw new HTTPException(400, { message: 'Invalid or expired invite code' })
      },
    }))

    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'ValidUserPassword123!',
        inviteCode: 'INVALID-CODE-1234',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid or expired invite code')
  })

  it('POST /auth/login successfully logs in user and returns session and profile', async () => {
    mock.module('../service', () => ({
      loginUser: async () => ({
        account: mockAccount,
        token: 'user_session_token_123',
        profile: mockProfile,
        isOnboardingCompleted: true,
      }),
    }))

    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'ValidUserPassword123!',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      token: string
      account: SafeAccount
      profile: SafeProfile
      isOnboardingCompleted: boolean
    }
    expect(body.success).toBe(true)
    expect(body.token).toBe('user_session_token_123')
    expect(body.account.email).toBe('user@wisal.dev')
    expect(body.isOnboardingCompleted).toBe(true)
    expect(body.profile.name).toBe('Wisal User')
    expect(body.profile.identity).toBe('wisaluser')
    expect((body.profile as any).identityId).toBeUndefined()
    expect((body as any).session).toBeUndefined()
  })

  it('POST /auth/login returns 401 for invalid credentials', async () => {
    mock.module('../service', () => ({
      loginUser: async () => {
        throw new HTTPException(401, { message: 'Invalid email or password' })
      },
    }))

    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@wisal.dev',
        password: 'WrongPassword123!',
      }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid email or password')
  })

  it('POST /auth/logout invalidates current session', async () => {
    let logoutCalled = false

    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      logoutUser: async (sessionId: bigint) => {
        if (sessionId === mockSession.id) {
          logoutCalled = true
        }
      },
    }))

    const res = await app.request('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(body.message).toBe('Logged out successfully')
    expect(logoutCalled).toBe(true)
  })

  it('POST /auth/logout-all invalidates all account sessions', async () => {
    let logoutAllCalled = false

    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      logoutAllSessions: async (accountId: bigint) => {
        if (accountId === mockAccount.id) {
          logoutAllCalled = true
        }
      },
    }))

    const res = await app.request('/auth/logout-all', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(body.message).toBe('All sessions logged out successfully')
    expect(logoutAllCalled).toBe(true)
  })

  it('GET /auth/me returns current account and profile', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getAuthMe: async () => ({
        account: mockAccount,
        profile: mockProfile,
        isOnboardingCompleted: true,
      }),
    }))

    const res = await app.request('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
       success: boolean
       account: SafeAccount
       profile: SafeProfile
       isOnboardingCompleted: boolean
     }
    expect(body.success).toBe(true)
    expect(body.account.email).toBe('user@wisal.dev')
    expect(body.profile.identity).toBe('wisaluser')
    expect((body.profile as any).identityId).toBeUndefined()
    expect(body.isOnboardingCompleted).toBe(true)
  })

  it('GET /auth/me returns 401 when token is missing', async () => {
    const res = await app.request('/auth/me', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })
})
