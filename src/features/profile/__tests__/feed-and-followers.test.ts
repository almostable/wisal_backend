import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { formatProfileResponse } from '../../../lib/profile'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'

describe('Profile Feed and Followers Denormalization Unit Tests', () => {
  const baseProfile: ProfileWithIdentity = {
    id: 100000000000001n,
    accountId: 200000000000002n,
    name: 'Test Author',
    isMale: true,
    avatarKey: 'avatar.png',
    description: 'Long description',
    shortDescription: 'Short bio',
    countryCode: 'US',
    cityId: 'nyc',
    contacts: null,
    identityId: 300000000000003n,
    regularFollowersCount: 25,
    followersCount: 150,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 300000000000003n,
      identity: 'test_author',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  it('formatProfileResponse includes followersCount ONLY when includeFollowersCount is true', () => {
    const publicView = formatProfileResponse(baseProfile)
    expect(publicView).not.toBeNull()
    expect(publicView!.followersCount).toBeUndefined()

    const otherUserView = formatProfileResponse(baseProfile, { includeFollowersCount: false })
    expect(otherUserView!.followersCount).toBeUndefined()

    const authorSelfView = formatProfileResponse(baseProfile, { includeFollowersCount: true })
    expect(authorSelfView!.followersCount).toBe(150)
    expect(authorSelfView!.regularFollowersCount).toBe(25)
    expect(authorSelfView!.isVerified).toBe(true)
  })

  it('GET /profile/:identity does not expose followersCount when viewed by another user', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: { id: 999999999999999n, email: 'other@wisal.dev' },
        session: { id: 888888888888888n, accountId: 999999999999999n },
      }),
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string, viewerAccountId: bigint) => {
        const isSelf = viewerAccountId === baseProfile.accountId
        return formatProfileResponse(baseProfile, { includeFollowersCount: isSelf })!
      },
    }))

    const res = await app.request('/profile/test_author', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: any }
    expect(body.success).toBe(true)
    expect(body.profile.identity).toBe('test_author')
    expect(body.profile.followersCount).toBeUndefined()
  })

  it('GET /profile/:identity exposes followersCount when viewed by author themselves', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: { id: baseProfile.accountId, email: 'author@wisal.dev' },
        session: { id: 888888888888888n, accountId: baseProfile.accountId },
      }),
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string, viewerAccountId: bigint) => {
        const isSelf = viewerAccountId === baseProfile.accountId
        return formatProfileResponse(baseProfile, { includeFollowersCount: isSelf })!
      },
    }))

    const res = await app.request('/profile/test_author', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: any }
    expect(body.success).toBe(true)
    expect(body.profile.identity).toBe('test_author')
    expect(body.profile.followersCount).toBe(150)
  })

  it('GET /profile/feed default type is recommended', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: { id: 999999999999999n, email: 'viewer@wisal.dev' },
        session: { id: 888888888888888n, accountId: 999999999999999n },
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => ({
        ...baseProfile,
        accountId: 999999999999999n,
      }),
      isOnboardingCompleted: () => true,
    }))

    let capturedQuery: any = null
    mock.module('../service', () => ({
      getProfileFeed: async (_accountId: bigint, query: any) => {
        capturedQuery = query
        return {
          profiles: [],
          type: query.type ?? 'recommended',
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }
      },
    }))

    const res = await app.request('/profile/feed', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(200)
    expect(capturedQuery).not.toBeNull()
    expect(capturedQuery.type).toBe('recommended')
    expect(capturedQuery.limit).toBe(20)
    expect(capturedQuery.offset).toBe(0)
  })

  it('generateFeedSeed produces 16-hex characters string', () => {
    const { generateFeedSeed } = require('../service')
    const seed1 = generateFeedSeed()
    const seed2 = generateFeedSeed()
    expect(seed1).toMatch(/^[a-f0-9]{16}$/)
    expect(seed2).toMatch(/^[a-f0-9]{16}$/)
    expect(seed1).not.toBe(seed2)
  })
})
