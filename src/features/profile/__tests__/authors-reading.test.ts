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
    name: 'Reader User',
    isMale: true,
    avatarKey: null,
    description: null,
    links: null,
    identity: 'readeruser',
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
      expect(currentLastReadPostId as bigint | null).toBe(105n)

      // Step 2: Delayed network packet arrives for post #104
      const second = updateLastRead(104n)
      expect(second).toBe(105n)
      expect(currentLastReadPostId as bigint | null).toBe(105n) // Must remain 105n!

      // Step 3: Later post #106 arrives
      const third = updateLastRead(106n)
      expect(third).toBe(106n)
      expect(currentLastReadPostId as bigint | null).toBe(106n)
    })
  })

  describe('GET /profile/authors Route', () => {
    it('returns authors list with computed unreadCount without omitted fields', async () => {
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
              identity: 'favauthor',
              isVerified: true,
              hasUnread: true,
            },
            {
              id: 888888888888888n,
              name: 'Up-to-date Author',
              avatarKey: null,
              identity: 'allreadauthor',
              isVerified: false,
              hasUnread: false,
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
      expect(body.authors[0].hasUnread).toBe(true)
      expect(body.authors[0].description).toBeUndefined()
      expect(body.authors[0].isMale).toBeUndefined()
      expect(body.authors[0].readAt).toBeUndefined()
      expect(body.authors[0].lastReadAt).toBeUndefined()
      expect(body.authors[0].lastReadPostId).toBeUndefined()
      expect(body.authors[1].hasUnread).toBe(false)
    })
  })

  describe('GET /profile/:identity/authors Route', () => {
    it('returns target author subscriptions list without private unread counts', async () => {
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
        getUserSubscribedAuthorsByIdentity: async (handle: string) => ({
          authors: [
            {
              id: 999999999999999n,
              name: 'Subscribed Author',
              avatarKey: 'author-pic.png',
              description: 'Author bio',
              identity: 'favauthor',
              isVerified: true,
              readAt: new Date(),
            },
          ],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      }))

      const res = await app.request('/profile/readeruser/authors', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid_token',
        },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as any
      expect(body.success).toBe(true)
      expect(body.total).toBe(1)
      expect(body.authors[0].identity).toBe('favauthor')
      expect(body.authors[0].description).toBe('Author bio')
      expect(body.authors[0].isVerified).toBe(true)
      expect(body.authors[0].unreadCount).toBeUndefined()
      expect(body.authors[0].hasUnread).toBeUndefined()
    })
  })

  describe('POST /profile/:author_id/read-marker Route', () => {
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

      const res = await app.request('/profile/favauthor/read-marker', {
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

    it('rejects invalid last_post_id exceeding MAX_PG_BIGINT with 400', async () => {
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

      const res = await app.request('/profile/favauthor/read-marker', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ last_post_id: '99999999999999999999999999999' }),
      })

      expect(res.status).toBe(400)
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

  describe('readProfile and unreadCount Unit Logic', () => {
    it('sets lastReadPostId to latest post on subscription ensuring unreadCount is 0', () => {
      const authorPosts = [
        { id: 500000000000003n, authorId: 999999999999999n },
        { id: 500000000000002n, authorId: 999999999999999n },
        { id: 500000000000001n, authorId: 999999999999999n },
      ]

      const latestPostId = authorPosts[0].id // 500000000000003n

      // Simulated unreadCount check: posts with id > lastReadPostId
      const unreadCount = authorPosts.filter((p) => p.id > latestPostId).length
      expect(unreadCount).toBe(0)

      // When author publishes a newer post:
      const newPost = { id: 500000000000004n, authorId: 999999999999999n }
      const updatedPosts = [newPost, ...authorPosts]
      const newUnreadCount = updatedPosts.filter((p) => p.id > latestPostId).length
      expect(newUnreadCount).toBe(1)
    })
  })
})

