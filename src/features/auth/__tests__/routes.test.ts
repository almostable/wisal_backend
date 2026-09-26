import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import * as actualAuthService from '../service'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import { hashPassword } from '../../../lib/password'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { SafeProfile } from '../../../lib/profile'

describe('deleteAccount Service Tests', () => {
  const accountId = 111111111111111n
  const rawPassword = 'ValidPassword123!'

  it('throws 404 when account does not exist or already deleted', async () => {
    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            accounts: {
              findFirst: async () => null,
            },
          },
        }
        return await cb(mockTx)
      },
    }

    await expect(
      actualAuthService.deleteAccount(accountId, { password: rawPassword }, mockDb)
    ).rejects.toThrow(new HTTPException(404, { message: 'Account not found' }))
  })

  it('throws 401 when password is wrong', async () => {
    const hashedPassword = await hashPassword(rawPassword)

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            accounts: {
              findFirst: async () => ({
                id: accountId,
                email: 'test@wisal.dev',
                passwordHash: hashedPassword,
                deletedAt: null,
              }),
            },
          },
        }
        return await cb(mockTx)
      },
    }

    await expect(
      actualAuthService.deleteAccount(accountId, { password: 'WrongPassword123!' }, mockDb)
    ).rejects.toThrow(new HTTPException(401, { message: 'Invalid password' }))
  })

  it('successfully executes soft delete and PII scrubbing', async () => {
    const hashedPassword = await hashPassword(rawPassword)
    let accountUpdatedSet: any = null
    let profileUpdatedSet: any = null
    let postsUpdatedSet: any = null
    let postMediaMarked = false
    let commentMediaMarked = false
    let readersDecremented = false

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            accounts: {
              findFirst: async () => ({
                id: accountId,
                email: 'user@wisal.dev',
                passwordHash: hashedPassword,
                deletedAt: null,
              }),
            },
            profiles: {
              findFirst: async () => ({
                id: 222222222222222n,
                accountId,
                name: 'John Doe',
                identity: 'johndoe',
                identityId: 333333333333333n,
                avatarKey: 'media/avatars/user.jpg',
                isMale: true,
              }),
            },
          },
          update: (_table: any) => ({
            set: (setData: any) => {
              if (setData.email !== undefined) {
                accountUpdatedSet = setData
              } else if (setData.name === null) {
                profileUpdatedSet = setData
              } else if (setData.isPinned !== undefined) {
                postsUpdatedSet = setData
              } else if (setData.status === 'deleted') {
                postMediaMarked = true
              } else if (setData.readersCount !== undefined) {
                readersDecremented = true
              }
              return {
                where: () => ({
                  returning: async () => [],
                }),
              }
            },
          }),
          select: (_fields: any) => ({
            from: (_table: any) => ({
              where: () => [{ id: 999999999999991n, authorProfileId: 555555555555555n }],
            }),
          }),
          delete: (_table: any) => ({
            where: () => ({
              returning: async () => [{ postId: 999999999999991n }],
            }),
          }),
          execute: async () => {
            commentMediaMarked = true
          },
        }

        return await cb(mockTx)
      },
    }

    const result = await actualAuthService.deleteAccount(accountId, { password: rawPassword }, mockDb)

    expect(result.success).toBe(true)
    expect(result.message).toBe('Account deleted successfully')

    expect(accountUpdatedSet).toBeDefined()
    expect(accountUpdatedSet.deletedAt).toBeInstanceOf(Date)
    expect(accountUpdatedSet.email).toBe(`${accountId}@deleted.invalid`)
    expect(accountUpdatedSet.passwordHash).toBe('!ACCOUNT_DELETED!')

    expect(profileUpdatedSet).toBeDefined()
    expect(profileUpdatedSet.name).toBeNull()
    expect(profileUpdatedSet.identity).toBeNull()
    expect(profileUpdatedSet.identityId).toBeNull()
    expect(profileUpdatedSet.isMale).toBeNull()
    expect(profileUpdatedSet.avatarKey).toBeNull()

    expect(postsUpdatedSet).toBeDefined()
    expect(postsUpdatedSet.deletedAt).toBeInstanceOf(Date)
    expect(postsUpdatedSet.isPinned).toBe(false)
    expect(postMediaMarked).toBe(true)
    expect(commentMediaMarked).toBe(true)
    expect(readersDecremented).toBe(true)
  })
})

describe('Auth Feature Route Tests', () => {

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
    links: null,
    identity: 'wisaluser',
    isVerified: false,
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
      logoutAllUserSessions: async (accountId: bigint) => {
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

  it('GET /auth/me returns current account and onboarding status', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getMe: async () => ({
        account: mockAccount,
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
       isOnboardingCompleted: boolean
     }
    expect(body.success).toBe(true)
    expect(body.account.email).toBe('user@wisal.dev')
    expect((body as any).profile).toBeUndefined()
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

  it('DELETE /auth/me deletes account with valid password', async () => {
    let deleteCalled = false
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      deleteAccount: async (_accountId: bigint, input: { password: string }) => {
        if (input.password !== 'ValidPassword123!') {
          throw new HTTPException(401, { message: 'Invalid password' })
        }
        deleteCalled = true
        return {
          success: true,
          message: 'Account deleted successfully',
        }
      },
    }))

    const res = await app.request('/auth/me', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: 'ValidPassword123!',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }
    expect(body.success).toBe(true)
    expect(body.message).toBe('Account deleted successfully')
    expect(deleteCalled).toBe(true)
  })

  it('DELETE /auth/me rejects invalid password', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      deleteAccount: async () => {
        throw new HTTPException(401, { message: 'Invalid password' })
      },
    }))

    const res = await app.request('/auth/me', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: 'WrongPassword',
      }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid password')
  })

  it('DELETE /auth/me returns 400 when password is empty', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    const res = await app.request('/auth/me', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: '',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('DELETE /auth/me returns 401 when token is missing', async () => {
    const res = await app.request('/auth/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: 'SomePassword123!',
      }),
    })

    expect(res.status).toBe(401)
  })
})
