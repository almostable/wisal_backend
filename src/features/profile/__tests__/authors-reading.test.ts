import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { markAuthorReadSchema } from '../schema'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { SafeProfile } from '../types'

describe('Authors and Monotonic Read Feature Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'reader@wisal.dev',
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
    name: 'Reader User',
    isMale: true,
    avatarKey: null,
    description: null,
    shortDescription: null,
    countryCode: 'US',
    cityId: null,
    contacts: null,
    identity: 'readeruser',
    regularReadersCount: 0,
    isVerified: false,
  }

  describe('markAuthorReadSchema Validation', () => {
    it('accepts valid snake_case last_post_id as number or string and transforms to BigInt', () => {
      const parsedNum = markAuthorReadSchema.parse({ last_post_id: 105 })
      expect(parsedNum.lastPostId).toBe(105n)

      const parsedStr = markAuthorReadSchema.parse({ last_post_id: '105' })
      expect(parsedStr.lastPostId).toBe(105n)
    })

    it('accepts valid camelCase lastPostId as number or string and transforms to BigInt', () => {
      const parsedNum = markAuthorReadSchema.parse({ lastPostId: 200 })
      expect(parsedNum.lastPostId).toBe(200n)

      const parsedStr = markAuthorReadSchema.parse({ lastPostId: '200' })
      expect(parsedStr.lastPostId).toBe(200n)
    })

    it('rejects empty payload without last_post_id or lastPostId', () => {
      const res = markAuthorReadSchema.safeParse({})
      expect(res.success).toBe(false)
    })

    it('rejects negative numbers or invalid snowflake formats', () => {
      expect(markAuthorReadSchema.safeParse({ last_post_id: -1 }).success).toBe(false)
      expect(markAuthorReadSchema.safeParse({ last_post_id: 'invalid_id' }).success).toBe(false)
      expect(markAuthorReadSchema.safeParse({ last_post_id: '' }).success).toBe(false)
    })
  })

  describe('Monotonic GREATEST Read Marker Behavior', () => {
    it('prevents ID regression when delayed older packet arrives (out-of-order delivery)', () => {
      let currentLastReadPostId: bigint | null = null

      const updateLastRead = (incomingPostId: bigint) => {
        const current = currentLastReadPostId ?? 0n
        currentLastReadPostId = incomingPostId > current ? incomingPostId : current
        return currentLastReadPostId
      }

      // Step 1: User reads post #105
      const first = updateLastRead(105n)
      expect(first).toBe(105n)
      expect(currentLastReadPostId).toBe(105n)

      // Step 2: Delayed network packet arrives for post #104
      const second = updateLastRead(104n)
      expect(second).toBe(105n)
      expect(currentLastReadPostId).toBe(105n) // Must remain 105n!

      // Step 3: Later post #106 arrives
      const third = updateLastRead(106n)
      expect(third).toBe(106n)
      expect(currentLastReadPostId).toBe(106n)
    })
  })

  describe('GET /profile/authors Route', () => {
    it('returns authors list with computed unreadCount', async () => {
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
              id: 999999999999999n,
              name: 'Favorite Author',
              avatarKey: 'author-pic.png',
              shortDescription: 'Tech Writer',
              description: 'Writing about distributed systems',
              identity: 'favauthor',
              isMale: true,
              isVerified: true,
              readAt: new Date('2026-01-01'),
              lastReadAt: new Date('2026-02-01'),
              lastReadPostId: 105n,
              unreadCount: 3,
            },
            {
              id: 888888888888888n,
              name: 'Up-to-date Author',
              avatarKey: null,
              shortDescription: null,
              description: null,
              identity: 'allreadauthor',
              isMale: false,
              isVerified: false,
              readAt: new Date('2026-01-01'),
              lastReadAt: new Date('2026-02-01'),
              lastReadPostId: 200n,
              unreadCount: 0,
            },
          ],
          total: 2,
          limit: 50,
          offset: 0,
        }),
      }))

      const res = await app.request('/profile/authors', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.success).toBe(true)
      expect(body.total).toBe(2)
      expect(body.authors[0].identity).toBe('favauthor')
      expect(body.authors[0].unreadCount).toBe(3)
      expect(body.authors[0].lastReadPostId).toBe('105')
      expect(body.authors[1].unreadCount).toBe(0)
    })
  })

  describe('POST /profile/:author_id/read Route', () => {
    it('updates read position when payload is passed', async () => {
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
        markAuthorPostsRead: async (_viewerId: bigint, _authorId: string, lastPostId: bigint) => ({
          lastReadPostId: lastPostId,
          lastReadAt: new Date(),
          message: 'Author posts marked as read',
        }),
      }))

      const res = await app.request('/profile/favauthor/read', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ last_post_id: '105' }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.success).toBe(true)
      expect(body.lastReadPostId).toBe('105')
    })

    it('subscribes to author when no body is passed', async () => {
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
        readProfile: async () => ({
          reading: true,
          message: 'Successfully reading profile',
        }),
      }))

      const res = await app.request('/profile/favauthor/read', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.success).toBe(true)
      expect(body.reading).toBe(true)
    })
  })
})
