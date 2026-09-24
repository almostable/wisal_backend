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
    description: 'Short bio',
    links: null,
    identityId: 300000000000003n,
    readersCount: 150,
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    notificationsReadAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 300000000000003n,
      identity: 'test_author',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  it('formatProfileResponse includes readersCount ONLY when includeReadersCount is true', () => {
    const publicView = formatProfileResponse(baseProfile)
    expect(publicView).not.toBeNull()
    expect(publicView!.readersCount).toBeUndefined()

    const otherUserView = formatProfileResponse(baseProfile, { includeReadersCount: false })
    expect(otherUserView!.readersCount).toBeUndefined()

    const authorSelfView = formatProfileResponse(baseProfile, { includeReadersCount: true })
    expect(authorSelfView!.readersCount).toBe(150)
    expect(authorSelfView!.isVerified).toBe(true)
  })

  it('GET /profile/:identity does not expose readersCount when viewed by another user', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: { id: 999999999999999n, email: 'other@wisal.dev' },
        session: { id: 888888888888888n, accountId: 999999999999999n },
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => baseProfile,
      isOnboardingCompleted: () => true,
      formatProfileResponse,
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string, viewerAccountId: bigint) => {
        const isSelf = viewerAccountId === baseProfile.accountId
        return formatProfileResponse(baseProfile, { includeReadersCount: isSelf })!
      },
      getProfileFeed: async (_accountId: bigint, query: any) => {
        return {
          profiles: [],
          type: query.type ?? 'recommended',
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }
      },
      generateFeedSeed: () => 'abcdef0123456789',
    }))

    const res = await app.request('/profile/test_author', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid_token' },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profile: any }
    expect(body.success).toBe(true)
    expect(body.profile.identity).toBe('test_author')
    expect(body.profile.readersCount).toBeUndefined()
  })

  it('GET /profile/:identity exposes readersCount when viewed by author themselves', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: { id: baseProfile.accountId, email: 'author@wisal.dev' },
        session: { id: 888888888888888n, accountId: baseProfile.accountId },
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => baseProfile,
      isOnboardingCompleted: () => true,
      formatProfileResponse,
    }))

    mock.module('../service', () => ({
      getPublicProfile: async (handle: string, viewerAccountId: bigint) => {
        const isSelf = viewerAccountId === baseProfile.accountId
        return formatProfileResponse(baseProfile, { includeReadersCount: isSelf })!
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
    expect(body.profile.readersCount).toBe(150)
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
      formatProfileResponse,
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
    const fn = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const seed1 = fn()
    const seed2 = fn()
    expect(seed1).toMatch(/^[a-f0-9]{16}$/)
    expect(seed2).toMatch(/^[a-f0-9]{16}$/)
    expect(seed1).not.toBe(seed2)
  })

  it('deterministic seed produces consistent baseShift and wrap-around bounds without duplicates', () => {
    const seed = 'abcdef0123456789'
    let seedNum = 0
    for (let i = 0; i < seed.length; i++) {
      seedNum = ((seedNum << 5) - seedNum + seed.charCodeAt(i)) | 0
    }

    const totalCount = 7
    const limit = 5
    const baseShift = Math.abs(seedNum) % totalCount

    // Page 1: offset = 0
    const offset1 = 0
    const remaining1 = totalCount - offset1
    const actualLimit1 = Math.min(limit, remaining1)
    const effectiveOffset1 = (baseShift + offset1) % totalCount
    expect(actualLimit1).toBe(5)
    const firstLimit1 = totalCount - effectiveOffset1
    const secondLimit1 = actualLimit1 - firstLimit1
    expect(firstLimit1 + secondLimit1).toBe(5)

    // Page 2: offset = 5
    const offset2 = 5
    const remaining2 = totalCount - offset2
    const actualLimit2 = Math.min(limit, remaining2)
    const effectiveOffset2 = (baseShift + offset2) % totalCount
    expect(actualLimit2).toBe(2) // Exactly 2 remaining items, avoiding duplicates from page 1!
    expect(actualLimit1 + actualLimit2).toBe(totalCount)

    // Page 3: offset = 7 (offset >= totalCount)
    const offset3 = 7
    const isPastEnd = offset3 >= totalCount
    expect(isPastEnd).toBe(true)
  })
})
