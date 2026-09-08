import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { PublicProfile, SafeProfile } from '../types'

describe('Profile Feature Route Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    deletedAt: null,
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
    shortDescription: 'Coffee & Code',
    countryCode: 'US',
    cityId: 'city_nyc',
    contacts: {
      telegram: 'wisal_user',
      youtube: null,
      website: null,
      email: null,
    },
    identity: 'wisaluser',
    regularReadersCount: 0,
    isVerified: false,
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
        profile: { ...mockProfile, readersCount: 10 },
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
    expect(body.profile.readersCount).toBe(10)
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

  it('POST /profile/onboarding accepts and returns shortDescription, countryCode, and cityId', async () => {
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
        shortDescription: input.shortDescription,
        countryCode: input.countryCode,
        cityId: input.cityId,
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
        shortDescription: 'Coffee & Code',
        countryCode: 'US',
        cityId: 'city_nyc',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: SafeProfile }
    expect(body.success).toBe(true)
    expect(body.profile.shortDescription).toBe('Coffee & Code')
    expect(body.profile.countryCode).toBe('US')
    expect(body.profile.cityId).toBe('city_nyc')
  })

  it('POST /profile/onboarding rejects invalid shortDescription, countryCode, or cityId with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    // Invalid shortDescription (> 110 chars)
    const res1 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        shortDescription: 'a'.repeat(111),
      }),
    })
    expect(res1.status).toBe(400)

    // Invalid countryCode (lowercase)
    const res2 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        countryCode: 'us',
      }),
    })
    expect(res2.status).toBe(400)

    // Invalid cityId (> 64 chars)
    const res3 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        cityId: 'c'.repeat(65),
      }),
    })
    expect(res3.status).toBe(400)

    // Invalid description (empty string)
    const res4 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        description: '   ',
      }),
    })
    expect(res4.status).toBe(400)

    // Invalid description (> 2000 chars)
    const res5 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        description: 'a'.repeat(2001),
      }),
    })
    expect(res5.status).toBe(400)

    // Invalid telegram username (starts with @)
    const resTg1 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        contacts: { telegram: '@durov' },
      }),
    })
    expect(resTg1.status).toBe(400)

    // Invalid telegram username (is a link)
    const resTg2 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        contacts: { telegram: 'https://t.me/durov' },
      }),
    })
    expect(resTg2.status).toBe(400)

    // Invalid telegram username (< 4 chars)
    const resTg3 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: 'johndoe',
        contacts: { telegram: 'abc' },
      }),
    })
    expect(resTg3.status).toBe(400)
  })

  it('PATCH /profile/me updates and clears shortDescription, countryCode, and cityId', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async (_accountId: bigint, input: any) => ({
        ...mockProfile,
        shortDescription: input.shortDescription !== undefined ? input.shortDescription : mockProfile.shortDescription,
        countryCode: input.countryCode !== undefined ? input.countryCode : mockProfile.countryCode,
        cityId: input.cityId !== undefined ? input.cityId : mockProfile.cityId,
      }),
    }))

    // Update with values
    const resUpdate = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shortDescription: 'Solo Dev',
        countryCode: 'KZ',
        cityId: 'almaty_01',
      }),
    })
    expect(resUpdate.status).toBe(200)
    const bodyUpdate = (await resUpdate.json()) as { success: boolean; profile: SafeProfile }
    expect(bodyUpdate.profile.shortDescription).toBe('Solo Dev')
    expect(bodyUpdate.profile.countryCode).toBe('KZ')
    expect(bodyUpdate.profile.cityId).toBe('almaty_01')

    // Update with nulls to clear
    const resClear = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shortDescription: null,
        countryCode: null,
        cityId: null,
      }),
    })
    expect(resClear.status).toBe(200)
    const bodyClear = (await resClear.json()) as { success: boolean; profile: SafeProfile }
    expect(bodyClear.profile.shortDescription).toBeNull()
    expect(bodyClear.profile.countryCode).toBeNull()
    expect(bodyClear.profile.cityId).toBeNull()
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
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      checkHandleAvailability: async (handle: string) => {
        if (handle === 'available_user') {
          return { available: true, identity: 'available_user' }
        }
        return { available: false, identity: handle, reason: 'Identity is already taken' }
      },
    }))

    const res1 = await app.request('/profile/check/available_user', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as { success: boolean; available: boolean }
    expect(body1.success).toBe(true)
    expect(body1.available).toBe(true)

    const res2 = await app.request('/profile/check/taken_user', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as { success: boolean; available: boolean; reason: string }
    expect(body2.success).toBe(true)
    expect(body2.available).toBe(false)
    expect(body2.reason).toBe('Identity is already taken')
  })

  it('GET /profile/:identity returns public profile of another user with isReading', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string) => {
        if (handle === 'wisaluser') {
          return {
            ...mockPublicProfile,
            isReading: true,
          }
        }
        if (handle === 'notfollowed') {
          return {
            ...mockPublicProfile,
            identity: 'notfollowed',
            isReading: false,
          }
        }
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const resFollowed = await app.request('/profile/wisaluser', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resFollowed.status).toBe(200)
    const bodyFollowed = (await resFollowed.json()) as { success: boolean; profile: PublicProfile }
    expect(bodyFollowed.success).toBe(true)
    expect(bodyFollowed.profile.name).toBe('Wisal User')
    expect(bodyFollowed.profile.identity).toBe('wisaluser')
    expect(bodyFollowed.profile.isReading).toBe(true)
    expect((bodyFollowed.profile as any).readersCount).toBeUndefined()
    expect((bodyFollowed.profile as any).identityId).toBeUndefined()

    const resNotFollowed = await app.request('/profile/notfollowed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resNotFollowed.status).toBe(200)
    const bodyNotFollowed = (await resNotFollowed.json()) as { success: boolean; profile: PublicProfile }
    expect(bodyNotFollowed.success).toBe(true)
    expect(bodyNotFollowed.profile.isReading).toBe(false)
  })

  it('GET /profile/:identity returns 401 when token is missing', async () => {
    const res = await app.request('/profile/wisaluser', { method: 'GET' })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })

  it('GET /profile/:identity returns 404 when profile does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getPublicProfile: async () => {
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const res = await app.request('/profile/unknown_user', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
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
  })

  it('GET /profile/invites returns 401 when token is missing', async () => {
    const res = await app.request('/profile/invites', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Missing or malformed Authorization header')
  })

  it('GET /profile/readers returns list of user readers', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getReaders: async () => ({
        users: [
          {
            id: 999999999999999n,
            name: 'Follower One',
            avatarKey: null,
            description: 'Fan of Wisal',
            identity: 'follower1',
            readAt: new Date(),
            lastReadAt: new Date(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/readers', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      users: any[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.total).toBe(1)
    expect(body.users[0].identity).toBe('follower1')
  })

  it('GET /profile/authors returns list of subscribed authors with unreadCount', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getSubscribedAuthors: async () => ({
        authors: [
          {
            id: 888888888888888n,
            name: 'Author One',
            avatarKey: 'avatar.png',
            identity: 'author1',
            isVerified: true,
            unreadCount: 5,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/authors', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      authors: any[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.total).toBe(1)
    expect(body.authors[0].identity).toBe('author1')
    expect(body.authors[0].unreadCount).toBe(5)
    expect(body.authors[0].shortDescription).toBeUndefined()
    expect(body.authors[0].description).toBeUndefined()
    expect(body.authors[0].isMale).toBeUndefined()
    expect(body.authors[0].readAt).toBeUndefined()
    expect(body.authors[0].lastReadAt).toBeUndefined()
    expect(body.authors[0].lastReadPostId).toBeUndefined()
  })

  it('GET /profile/:identity/readers returns public list', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserReadersByIdentity: async (handle: string) => {
        if (handle === 'targetuser') {
          return {
            profiles: [
              {
                id: 11111n,
                name: 'Public Fan',
                avatarKey: null,
                description: null,
                identity: 'publicfan',
                readAt: new Date(),
                lastReadAt: new Date(),
              },
            ],
            total: 1,
            limit: 50,
            offset: 0,
          }
        }
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const resFollowers = await app.request('/profile/targetuser/readers', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resFollowers.status).toBe(200)
    const bodyFollowers = (await resFollowers.json()) as { success: boolean; profiles: any[]; total: number }
    expect(bodyFollowers.success).toBe(true)
    expect(bodyFollowers.profiles.length).toBe(1)
    expect(bodyFollowers.profiles[0].identity).toBe('publicfan')

    const res404 = await app.request('/profile/nonexistent/readers', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(res404.status).toBe(404)
  })

  it('POST /profile/:author_id/read marks author posts read when last_post_id is provided', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      markAuthorPostsRead: async (_viewerId: bigint, authorId: string, lastPostId: bigint) => {
        if (authorId === 'nonexistent') {
          throw new HTTPException(404, { message: 'Subscription not found' })
        }
        if (authorId === 'myself') {
          throw new HTTPException(400, { message: 'Profiles cannot mark own posts as read' })
        }
        return {
          lastReadPostId: lastPostId,
          lastReadAt: new Date(),
          message: 'Author posts marked as read',
        }
      },
    }))

    // snake_case last_post_id
    const resSnake = await app.request('/profile/author123/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ last_post_id: '105' }),
    })
    expect(resSnake.status).toBe(200)
    const bodySnake = (await resSnake.json()) as { success: boolean; lastReadPostId: string }
    expect(bodySnake.success).toBe(true)
    expect(bodySnake.lastReadPostId).toBe('105')

    // camelCase lastPostId
    const resCamel = await app.request('/profile/author123/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lastPostId: 105 }),
    })
    expect(resCamel.status).toBe(200)
    const bodyCamel = (await resCamel.json()) as { success: boolean; lastReadPostId: string }
    expect(bodyCamel.success).toBe(true)
    expect(bodyCamel.lastReadPostId).toBe('105')

    // invalid post id
    const resInvalid = await app.request('/profile/author123/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ last_post_id: 'invalid_id' }),
    })
    expect(resInvalid.status).toBe(400)

    // not found
    const resNotFound = await app.request('/profile/nonexistent/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ last_post_id: 105 }),
    })
    expect(resNotFound.status).toBe(404)
  })

  it('POST /profile/:identity/read reads user and handles self-read error', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      readProfile: async (_readerProfileId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Profiles cannot read themselves' })
        }
        if (handle === 'nonexistent') {
          throw new HTTPException(404, { message: 'Profile not found' })
        }
        return {
          reading: true,
          message: 'Successfully reading profile',
        }
      },
    }))

    const resValid = await app.request('/profile/otheruser/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resValid.status).toBe(200)
    const bodyValid = (await resValid.json()) as { success: boolean; reading: boolean }
    expect(bodyValid.success).toBe(true)
    expect(bodyValid.reading).toBe(true)

    const resSelf = await app.request('/profile/myself/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resSelf.status).toBe(400)
    const bodySelf = (await resSelf.json()) as { error: string }
    expect(bodySelf.error).toBe('Profiles cannot read themselves')

    const resNotFound = await app.request('/profile/nonexistent/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resNotFound.status).toBe(404)
  })

  it('DELETE /profile/:identity/read unreads user successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      unreadProfile: async (_readerProfileId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Profiles cannot unread themselves' })
        }
        if (handle === 'nonexistent') {
          throw new HTTPException(404, { message: 'Profile not found' })
        }
        return {
          reading: false,
          message: 'Successfully unread profile',
        }
      },
    }))

    const resValid = await app.request('/profile/otheruser/read', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resValid.status).toBe(200)
    const bodyValid = (await resValid.json()) as { success: boolean; reading: boolean }
    expect(bodyValid.success).toBe(true)
    expect(bodyValid.reading).toBe(false)

    const resSelf = await app.request('/profile/myself/read', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resSelf.status).toBe(400)
    const bodySelf = (await resSelf.json()) as { error: string }
    expect(bodySelf.error).toBe('Profiles cannot unread themselves')
  })

  it('GET /profile/blocks returns list of blocked users', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getBlockedProfiles: async (_profileId: bigint, _options: any) => ({
        profiles: [
          {
            id: 999999999999999n,
            name: 'Blocked User',
            identity: 'blockeduser',
            isMale: false,
            blockedAt: new Date(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/blocks', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profiles: any[]; total: number }
    expect(body.success).toBe(true)
    expect(body.profiles.length).toBe(1)
    expect(body.profiles[0].identity).toBe('blockeduser')
    expect(body.profiles[0].avatarKey).toBeUndefined()
  })

  it('POST /profile/:identity/block blocks a user and rejects self block', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      blockProfile: async (_blockerProfileId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Profiles cannot block themselves' })
        }
        return {
          blocked: true,
          message: 'Successfully blocked user',
        }
      },
    }))

    const res = await app.request('/profile/targetuser/block', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; blocked: boolean }
    expect(body.success).toBe(true)
    expect(body.blocked).toBe(true)

    const resSelf = await app.request('/profile/myself/block', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resSelf.status).toBe(400)
  })

  it('DELETE /profile/:identity/block unblocks a user', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      unblockProfile: async (_blockerProfileId: bigint, _handle: string) => ({
        blocked: false,
        message: 'Successfully unblocked user',
      }),
    }))

    const res = await app.request('/profile/targetuser/block', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; blocked: boolean }
    expect(body.success).toBe(true)
    expect(body.blocked).toBe(false)
  })

  it('GET /profile/:identity returns restricted profile with isBlocked/isHidden when block exists', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string, viewerId?: bigint) => {
        expect(viewerId).toBe(mockAccount.id)
        if (handle === 'blocked_by_me') {
          return {
            id: 888888888888888n,
            name: 'Blocked User',
            isMale: true,
            avatarKey: null,
            description: null,
            contacts: null,
            identity: 'blocked_by_me',
            isBlocked: true,
          }
        }
        return {
          id: 777777777777777n,
          name: 'Hidden User',
          isMale: false,
          avatarKey: null,
          description: null,
          contacts: null,
          identity: 'hidden_user',
          isHidden: true,
        }
      },
    }))

    const resBlocked = await app.request('/profile/blocked_by_me', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(resBlocked.status).toBe(200)
    const bodyBlocked = (await resBlocked.json()) as { success: boolean; profile: any }
    expect(bodyBlocked.profile.isBlocked).toBe(true)
    expect(bodyBlocked.profile.is_blocked).toBeUndefined()
    expect(bodyBlocked.profile.avatarKey).toBeNull()
    expect(bodyBlocked.profile.description).toBeNull()
    expect(bodyBlocked.profile.createdAt).toBeUndefined()
    expect(bodyBlocked.profile.updatedAt).toBeUndefined()

    const resHidden = await app.request('/profile/hidden_user', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(resHidden.status).toBe(200)
    const bodyHidden = (await resHidden.json()) as { success: boolean; profile: any }
    expect(bodyHidden.profile.isHidden).toBe(true)
    expect(bodyHidden.profile.is_hidden).toBeUndefined()
    expect(bodyHidden.profile.avatarKey).toBeNull()
    expect(bodyHidden.profile.createdAt).toBeUndefined()
    expect(bodyHidden.profile.updatedAt).toBeUndefined()
  })

  it('GET /profile/:identity/readers and reading return empty list when blocked', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserReadersByIdentity: async () => ({
        profiles: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
    }))

    const resFollowers = await app.request('/profile/blockeduser/readers', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resFollowers.status).toBe(200)
    const bodyFollowers = (await resFollowers.json()) as { success: boolean; profiles: any[]; total: number }
    expect(bodyFollowers.profiles).toEqual([])
    expect(bodyFollowers.total).toBe(0)
  })

  it('POST /profile/onboarding rejects identity starting with digits or underscores', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    const res1 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: '12345',
      }),
    })
    expect(res1.status).toBe(400)

    const res2 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: '1user',
      }),
    })
    expect(res2.status).toBe(400)

    const res3 = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
        identity: '_user',
      }),
    })
    expect(res3.status).toBe(400)
  })

  it('PATCH /profile/me rejects identity starting with digits or length < 5 for unverified user', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async (_accountId: bigint, input: any) => {
        if (input.identity && input.identity.length < 5) {
          throw new HTTPException(400, { message: 'Identity must be at least 5 characters long' })
        }
        return {
          ...mockProfile,
          identity: input.identity,
        }
      },
    }))

    // Starts with digit
    const resDigit = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        identity: '1user',
      }),
    })
    expect(resDigit.status).toBe(400)

    // Length 3 for unverified user
    const resShort = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        identity: 'cat',
      }),
    })
    expect(resShort.status).toBe(400)
    const bodyShort = (await resShort.json()) as { error: string }
    expect(bodyShort.error).toBe('Identity must be at least 5 characters long')
  })

  it('PATCH /profile/me does not allow user to set verifiedAt or isVerified', async () => {
    let capturedData: any = null

    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      updateUserProfile: async (_accountId: bigint, input: any) => {
        capturedData = input
        return mockProfile
      },
    }))

    const res = await app.request('/profile/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_user_token',
      },
      body: JSON.stringify({
        name: 'Hacker Name',
        verifiedAt: new Date().toISOString(),
        isVerified: true,
      }),
    })

    expect(res.status).toBe(200)
    // Zod strips un-declared fields; verifiedAt and isVerified must not reach the service
    expect(capturedData.verifiedAt).toBeUndefined()
    expect(capturedData.isVerified).toBeUndefined()
  })

  it('GET /profile/feed rejects unauthenticated request with 401', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => null,
    }))

    const res = await app.request('/profile/feed', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
  })

  it('GET /profile/feed rejects request when onboarding is not completed with 403', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        name: '',
      }),
      isOnboardingCompleted: () => false,
    }))

    const res = await app.request('/profile/feed', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Profile onboarding required')
  })

  it('GET /profile/feed returns recommended profiles (verified only, sorted by regularFollowersCount)', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const sampleFeedItem = {
      name: 'Verified Star',
      isMale: true,
      avatarKey: 'avatar_star.jpg',
      identity: 'verified_star',
      shortDescription: 'I am verified',
      regularFollowersCount: 100,
      countryCode: 'US',
      cityId: 'nyc',
      isVerified: true,
    }

    mock.module('../service', () => ({
      getProfileFeed: async (_accountId: bigint, query: any) => {
        expect(query.type).toBe('recommended')
        expect(query.limit).toBe(20)
        expect(query.offset).toBe(0)
        return {
          profiles: [sampleFeedItem],
          type: 'recommended',
          limit: 20,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/profile/feed?type=recommended&limit=20&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      profiles: any[]
      type: string
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.type).toBe('recommended')
    expect(body.profiles.length).toBe(1)
    expect(body.profiles[0].name).toBe('Verified Star')
    expect(body.profiles[0].isVerified).toBe(true)
    expect(body.profiles[0].regularFollowersCount).toBe(100)
    expect(body.profiles[0].followersCount).toBeUndefined()
  })

  it('GET /profile/feed returns random profiles without seed on initial request (offset=0)', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const sampleRandomItem = {
      name: 'Random User',
      isMale: false,
      avatarKey: null,
      identity: 'random_user',
      shortDescription: 'Hello world',
      regularFollowersCount: 5,
      countryCode: 'CA',
      cityId: null,
      isVerified: false,
    }

    mock.module('../service', () => ({
      getProfileFeed: async (_accountId: bigint, query: any) => {
        expect(query.type).toBe('random')
        expect(query.seed).toBeUndefined()
        return {
          profiles: [sampleRandomItem],
          type: 'random',
          seed: '0123456789abcdef',
          limit: 20,
          offset: 0,
        }
      },
    }))

    const res = await app.request('/profile/feed?type=random', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      profiles: any[]
      type: string
      seed: string
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.type).toBe('random')
    expect(body.seed).toBe('0123456789abcdef')
    expect(body.profiles[0].isVerified).toBe(false)
    expect(body.profiles[0].followersCount).toBeUndefined()
  })

  it('GET /profile/feed accepts valid seed for pagination in random mode (offset > 0)', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getProfileFeed: async (_accountId: bigint, query: any) => {
        expect(query.type).toBe('random')
        expect(query.offset).toBe(20)
        expect(query.seed).toBe('0123456789abcdef')
        return {
          profiles: [],
          type: 'random',
          seed: '0123456789abcdef',
          limit: 20,
          offset: 20,
        }
      },
    }))

    const res = await app.request(
      '/profile/feed?type=random&offset=20&seed=0123456789abcdef',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_user_token',
        },
      }
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; seed: string }
    expect(body.success).toBe(true)
    expect(body.seed).toBe('0123456789abcdef')
  })

  it('GET /profile/feed rejects seed on initial request (offset=0) in random mode', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request(
      '/profile/feed?type=random&seed=0123456789abcdef',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_user_token',
        },
      }
    )

    expect(res.status).toBe(400)
  })

  it('GET /profile/feed rejects missing seed on pagination (offset > 0) in random mode', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/profile/feed?type=random&offset=20', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })

    expect(res.status).toBe(400)
  })

  it('GET /profile/feed rejects seed in recommended mode', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request(
      '/profile/feed?type=recommended&seed=0123456789abcdef',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_user_token',
        },
      }
    )

    expect(res.status).toBe(400)
  })

  it('GET /profile/feed rejects invalid seed format', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...mockProfile,
        accountId: mockAccount.id,
        identity: { id: 10n, identity: 'wisaluser' },
      }),
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request(
      '/profile/feed?type=random&offset=20&seed=invalid-seed',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_user_token',
        },
      }
    )

    expect(res.status).toBe(400)
  })
})


