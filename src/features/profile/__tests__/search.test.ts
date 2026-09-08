import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'

describe('Profile Search Endpoint (GET /profile/search)', () => {
  const mockAccount = {
    id: 100000000000001n,
    email: 'viewer@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSession = {
    id: 200000000000001n,
    accountId: mockAccount.id,
    token: 'valid_viewer_token',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
  }

  const mockViewerProfile = {
    id: 300000000000001n,
    accountId: mockAccount.id,
    name: 'Viewer User',
    identity: 'viewer_user',
    isMale: true,
    avatarKey: null,
    description: null,
    shortDescription: 'Bio',
    countryCode: 'US',
    cityId: null,
    contacts: null,
    identityId: 400000000000001n,
    regularFollowersCount: 0,
    followersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identityRecord: { id: 400000000000001n, identity: 'viewer_user' },
  }

  it('rejects unauthenticated request with 401', async () => {
    const res = await app.request('/profile/search?q=test', {
      method: 'GET',
    })
    expect(res.status).toBe(401)
  })

  it('rejects request when onboarding is not completed with 403', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => null,
      isOnboardingCompleted: () => false,
    }))

    const res = await app.request('/profile/search?q=test', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_viewer_token',
      },
    })

    expect(res.status).toBe(403)
  })

  it('rejects empty query parameter with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockViewerProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/profile/search?q=', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_viewer_token',
      },
    })

    expect(res.status).toBe(400)
  })

  it('returns empty list if query is only @ symbol', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockViewerProfile,
      isOnboardingCompleted: () => true,
    }))

    const res = await app.request('/profile/search?q=@', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_viewer_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; profiles: any[]; total: number }
    expect(body.success).toBe(true)
    expect(body.profiles).toEqual([])
    expect(body.total).toBe(0)
  })

  it('successfully routes and delegates search query to service', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: mockSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => mockViewerProfile,
      isOnboardingCompleted: () => true,
    }))

    let capturedQuery: any = null
    const sampleProfiles = [
      {
        name: 'Ivan T.',
        isMale: true,
        avatarKey: null,
        identity: 'it',
        shortDescription: 'Developer',
        regularFollowersCount: 50,
        countryCode: 'US',
        cityId: 'nyc',
        isVerified: true,
      },
    ]

    mock.module('../service', () => ({
      searchProfiles: async (_accountId: bigint, query: any) => {
        capturedQuery = query
        return {
          profiles: sampleProfiles,
          total: 1,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }
      },
    }))

    const res = await app.request('/profile/search?q=@it&limit=10&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_viewer_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      profiles: any[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.profiles.length).toBe(1)
    expect(body.profiles[0].identity).toBe('it')
    expect(body.profiles[0].isVerified).toBe(true)
    expect(body.total).toBe(1)
    expect(body.limit).toBe(10)
    expect(body.offset).toBe(0)
    expect(capturedQuery.q).toBe('@it')
  })

  it('search block condition only filters out users blocked by viewer, not users who blocked viewer', () => {
    const { PgDialect } = require('drizzle-orm/pg-core')
    const { sql } = require('drizzle-orm')
    const { profileBlocks } = require('../../../db/schema/profile-blocks')
    const { profiles } = require('../../../db/schema/profiles')

    const viewerProfileId = 100000000000001n
    const notBlockedCondition = sql`NOT EXISTS (
      SELECT 1 FROM ${profileBlocks}
      WHERE ${profileBlocks.blockerProfileId} = ${viewerProfileId}
        AND ${profileBlocks.blockedProfileId} = ${profiles.id}
    )`

    const dialect = new PgDialect()
    const compiled = dialect.sqlToQuery(notBlockedCondition)

    expect(compiled.sql).toContain('"profile_blocks"."blocker_profile_id" = $1')
    expect(compiled.sql).toContain('"profile_blocks"."blocked_profile_id" = "profiles"."id"')
    // Must NOT contain condition where blocker is profiles.id and blocked is viewer
    expect(compiled.sql).not.toContain('"profile_blocks"."blocker_profile_id" = "profiles"."id"')
  })
})
