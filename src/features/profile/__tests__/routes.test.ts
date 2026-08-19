import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PublicProfile } from '../types'

describe('Profile Feature Route Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession: Session = {
    id: 222222222222222n,
    accountId: mockAccount.id,
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockProfile: SafeProfile = {
    id: 333333333333333n,
    name: 'Wisal User',
    isMale: true,
    avatarKey: null,
    description: 'Hello world bio',
    contacts: {
      telegram: 'https://t.me/wisal_user',
      youtube: null,
      instagram: null,
      website: null,
      email: null,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: 'wisaluser',
  }

  const mockPublicProfile: PublicProfile = {
    ...mockProfile,
  }

  it('GET /profile/me returns authenticated user profile', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getMyProfile: async () => ({
        profile: mockProfile,
        isOnboardingCompleted: true,
      }),
    }))

    const res = await app.request('/profile/me', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      profile: SafeProfile
      isOnboardingCompleted: boolean
    }
    expect(body.success).toBe(true)
    expect(body.profile.name).toBe('Wisal User')
    expect(body.profile.identity).toBe('wisaluser')
    expect((body.profile as any).identityId).toBeUndefined()
    expect(body.isOnboardingCompleted).toBe(true)
  })

  it('GET /profile/me returns 401 when token is missing', async () => {
    const res = await app.request('/profile/me', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })

  it('POST /profile/onboarding completes onboarding for user', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      completeUserOnboarding: async (_accountId: bigint, input: any) => ({
        ...mockProfile,
        name: input.name,
        isMale: input.isMale,
        identity: input.identity,
      }),
    }))

    const res = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Johnathan Doe',
        isMale: true,
        identity: 'johndoe2026',
        description: 'New to Wisal',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: SafeProfile }
    expect(body.success).toBe(true)
    expect(body.profile.name).toBe('Johnathan Doe')
    expect(body.profile.identity).toBe('johndoe2026')
    expect((body.profile as any).identityId).toBeUndefined()
  })

  it('POST /profile/onboarding rejects invalid payload missing required gender with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    const res = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Johnathan Doe',
        identity: 'johndoe2026',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('POST /profile/onboarding returns 409 when identity handle is taken', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      completeUserOnboarding: async () => {
        throw new HTTPException(409, { message: "Identity 'takenhandle' is already taken" })
      },
    }))

    const res = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Johnathan Doe',
        isMale: true,
        identity: 'takenhandle',
      }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Identity 'takenhandle' is already taken")
  })

  it('PATCH /profile/me updates profile fields and identity successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async (_accountId: bigint, input: any) => ({
        ...mockProfile,
        name: input.name ?? mockProfile.name,
        description: input.description ?? mockProfile.description,
        identity: input.identity ?? mockProfile.identity,
      }),
    }))

    const res = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated Name',
        identity: 'new_handle_2026',
        description: 'Updated bio',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: SafeProfile }
    expect(body.success).toBe(true)
    expect(body.profile.name).toBe('Updated Name')
    expect(body.profile.identity).toBe('new_handle_2026')
    expect(body.profile.description).toBe('Updated bio')
    expect((body.profile as any).identityId).toBeUndefined()
  })

  it('PATCH /profile/me returns 409 when new identity is already taken', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async () => {
        throw new HTTPException(409, { message: "Identity 'taken_identity' is already taken" })
      },
    }))

    const res = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identity: 'taken_identity',
      }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Identity 'taken_identity' is already taken")
  })

  it('PATCH /profile/me returns 400 when attempting to change immutable gender', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async () => {
        throw new HTTPException(400, { message: 'Gender (is_male) cannot be modified once set' })
      },
    }))

    const res = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isMale: false,
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Gender (is_male) cannot be modified once set')
  })

  it('GET /profile/check/:identity returns availability', async () => {
    mock.module('../service', () => ({
      checkHandleAvailability: async (handle: string) => {
        if (handle === 'available_user') {
          return { available: true, identity: 'available_user' }
        }
        return { available: false, identity: handle, reason: 'Identity is already taken' }
      },
    }))

    const res1 = await app.request('/profile/check/available_user', { method: 'GET' })
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as { success: boolean; available: boolean }
    expect(body1.success).toBe(true)
    expect(body1.available).toBe(true)

    const res2 = await app.request('/profile/check/taken_user', { method: 'GET' })
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as { success: boolean; available: boolean; reason: string }
    expect(body2.success).toBe(true)
    expect(body2.available).toBe(false)
    expect(body2.reason).toBe('Identity is already taken')
  })

  it('GET /profile/:identity returns public profile of another user', async () => {
    mock.module('../service', () => ({
      getPublicProfile: async (handle: string) => {
        if (handle === 'wisaluser') {
          return mockPublicProfile
        }
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const res = await app.request('/profile/wisaluser', { method: 'GET' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: PublicProfile }
    expect(body.success).toBe(true)
    expect(body.profile.name).toBe('Wisal User')
    expect(body.profile.identity).toBe('wisaluser')
    expect((body.profile as any).identityId).toBeUndefined()
  })

  it('GET /profile/:identity returns 404 when profile does not exist', async () => {
    mock.module('../service', () => ({
      getPublicProfile: async () => {
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const res = await app.request('/profile/unknown_user', { method: 'GET' })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Profile not found')
  })

  it('GET /profile/invites returns authenticated user invites list with stats and pagination', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getMyInvites: async () => ({
        invites: [
          {
            id: 888888888888888n,
            code: 'WISAL-1111-2222-3333-4444',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            usedBy: null,
            usedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        stats: {
          active: 1,
          used: 0,
          expired: 0,
        },
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/invites', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      invites: any[]
      total: number
      stats: { active: number; used: number; expired: number }
    }
    expect(body.success).toBe(true)
    expect(body.invites.length).toBe(1)
    expect(body.invites[0].code).toBe('WISAL-1111-2222-3333-4444')
    expect(body.stats.active).toBe(1)

    // Test alias /profile/me/invites as well
    const resAlias = await app.request('/profile/me/invites', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resAlias.status).toBe(200)
  })

  it('GET /profile/invites returns 401 when token is missing', async () => {
    const res = await app.request('/profile/invites', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })
})

