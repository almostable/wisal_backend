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

  it('GET /profile/:identity returns public profile of another user with isFollowing', async () => {
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
            isFollowing: true,
          }
        }
        if (handle === 'notfollowed') {
          return {
            ...mockPublicProfile,
            identity: 'notfollowed',
            isFollowing: false,
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
    expect(bodyFollowed.profile.isFollowing).toBe(true)
    expect((bodyFollowed.profile as any).identityId).toBeUndefined()

    const resNotFollowed = await app.request('/profile/notfollowed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resNotFollowed.status).toBe(200)
    const bodyNotFollowed = (await resNotFollowed.json()) as { success: boolean; profile: PublicProfile }
    expect(bodyNotFollowed.success).toBe(true)
    expect(bodyNotFollowed.profile.isFollowing).toBe(false)
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

  it('GET /profile/followers returns list of user followers', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getFollowers: async () => ({
        users: [
          {
            id: 999999999999999n,
            name: 'Follower One',
            avatarKey: null,
            description: 'Fan of Wisal',
            identity: 'follower1',
            followedAt: new Date(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/followers', {
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

  it('GET /profile/following returns list of accounts user follows', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getFollowing: async () => ({
        users: [
          {
            id: 888888888888888n,
            name: 'Following One',
            avatarKey: 'avatar.png',
            description: 'Leader',
            identity: 'following1',
            followedAt: new Date(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/profile/following', {
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
    expect(body.users[0].identity).toBe('following1')
  })

  it('GET /profile/:identity/followers and GET /profile/:identity/following return public lists', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getUserFollowersByIdentity: async (handle: string) => {
        if (handle === 'targetuser') {
          return {
            users: [
              {
                id: 11111n,
                name: 'Public Fan',
                avatarKey: null,
                description: null,
                identity: 'publicfan',
                followedAt: new Date(),
              },
            ],
            total: 1,
            limit: 50,
            offset: 0,
          }
        }
        throw new HTTPException(404, { message: 'Profile not found' })
      },
      getUserFollowingByIdentity: async (handle: string) => {
        if (handle === 'targetuser') {
          return {
            users: [],
            total: 0,
            limit: 50,
            offset: 0,
          }
        }
        throw new HTTPException(404, { message: 'Profile not found' })
      },
    }))

    const resFollowers = await app.request('/profile/targetuser/followers', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resFollowers.status).toBe(200)
    const bodyFollowers = (await resFollowers.json()) as { success: boolean; users: any[]; total: number }
    expect(bodyFollowers.success).toBe(true)
    expect(bodyFollowers.users.length).toBe(1)
    expect(bodyFollowers.users[0].identity).toBe('publicfan')

    const resFollowing = await app.request('/profile/targetuser/following', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(resFollowing.status).toBe(200)
    const bodyFollowing = (await resFollowing.json()) as { success: boolean; total: number }
    expect(bodyFollowing.success).toBe(true)
    expect(bodyFollowing.total).toBe(0)

    const res404 = await app.request('/profile/nonexistent/followers', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_user_token' },
    })
    expect(res404.status).toBe(404)
  })

  it('POST /profile/:identity/follow follows user and handles self-follow error', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      followUser: async (_followerId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Users cannot follow themselves' })
        }
        if (handle === 'nonexistent') {
          throw new HTTPException(404, { message: 'Profile not found' })
        }
        return {
          following: true,
          message: 'Successfully followed user',
        }
      },
    }))

    const resValid = await app.request('/profile/otheruser/follow', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resValid.status).toBe(200)
    const bodyValid = (await resValid.json()) as { success: boolean; following: boolean }
    expect(bodyValid.success).toBe(true)
    expect(bodyValid.following).toBe(true)

    const resSelf = await app.request('/profile/myself/follow', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resSelf.status).toBe(400)
    const bodySelf = (await resSelf.json()) as { error: string }
    expect(bodySelf.error).toBe('Users cannot follow themselves')

    const resNotFound = await app.request('/profile/nonexistent/follow', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resNotFound.status).toBe(404)
  })

  it('DELETE /profile/:identity/follow unfollows user successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      unfollowUser: async (_followerId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Users cannot unfollow themselves' })
        }
        if (handle === 'nonexistent') {
          throw new HTTPException(404, { message: 'Profile not found' })
        }
        return {
          following: false,
          message: 'Successfully unfollowed user',
        }
      },
    }))

    const resValid = await app.request('/profile/otheruser/follow', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resValid.status).toBe(200)
    const bodyValid = (await resValid.json()) as { success: boolean; following: boolean }
    expect(bodyValid.success).toBe(true)
    expect(bodyValid.following).toBe(false)

    const resSelf = await app.request('/profile/myself/follow', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resSelf.status).toBe(400)
    const bodySelf = (await resSelf.json()) as { error: string }
    expect(bodySelf.error).toBe('Users cannot unfollow themselves')
  })

  it('GET /profile/blocks returns list of blocked users', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getBlockedUsers: async (_accountId: bigint, _options: any) => ({
        users: [
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
    const body = (await res.json()) as { success: boolean; users: any[]; total: number }
    expect(body.success).toBe(true)
    expect(body.users.length).toBe(1)
    expect(body.users[0].identity).toBe('blockeduser')
    expect(body.users[0].avatarKey).toBeUndefined()
  })

  it('POST /profile/:identity/block blocks a user and rejects self block', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      blockUser: async (_blockerId: bigint, handle: string) => {
        if (handle === 'myself') {
          throw new HTTPException(400, { message: 'Users cannot block themselves' })
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

    mock.module('../service', () => ({
      unblockUser: async (_blockerId: bigint, _handle: string) => ({
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

  it('GET /profile/:identity/followers and following return empty list when blocked', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../service', () => ({
      getUserFollowersByIdentity: async () => ({
        users: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
      getUserFollowingByIdentity: async () => ({
        users: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
    }))

    const resFollowers = await app.request('/profile/blockeduser/followers', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resFollowers.status).toBe(200)
    const bodyFollowers = (await resFollowers.json()) as { success: boolean; users: any[]; total: number }
    expect(bodyFollowers.users).toEqual([])
    expect(bodyFollowers.total).toBe(0)

    const resFollowing = await app.request('/profile/blockeduser/following', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_user_token',
      },
    })
    expect(resFollowing.status).toBe(200)
    const bodyFollowing = (await resFollowing.json()) as { success: boolean; users: any[]; total: number }
    expect(bodyFollowing.users).toEqual([])
    expect(bodyFollowing.total).toBe(0)
  })
})


