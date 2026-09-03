import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { follows, insertFollowSchema, selectFollowSchema } from '../follows'

describe('Follows Schema Tests', () => {
  it('validates a valid follow insertion payload', () => {
    const validData = {
      followerId: 100000000000001n,
      followingId: 200000000000002n,
    }

    const parsed = insertFollowSchema.parse(validData)
    expect(parsed.followerId).toBe(100000000000001n)
    expect(parsed.followingId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('rejects self-follow in insertFollowSchema', () => {
    const selfFollowData = {
      followerId: 100000000000001n,
      followingId: 100000000000001n,
    }

    expect(() => insertFollowSchema.parse(selfFollowData)).toThrow('Users cannot follow themselves')
  })

  it('validates selectFollowSchema with all fields', () => {
    const now = new Date()
    const record = {
      followerId: 100000000000001n,
      followingId: 200000000000002n,
      createdAt: now,
      lastReadAt: now,
    }

    const parsed = selectFollowSchema.parse(record)
    expect(parsed.followerId).toBe(100000000000001n)
    expect(parsed.followingId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
    expect(parsed.lastReadAt).toEqual(now)
  })

  it('validates selectFollowSchema with null lastReadAt', () => {
    const now = new Date()
    const record = {
      followerId: 100000000000001n,
      followingId: 200000000000002n,
      createdAt: now,
      lastReadAt: null,
    }

    const parsed = selectFollowSchema.parse(record)
    expect(parsed.lastReadAt).toBeNull()
  })

  it('has composite primary key on follower_id and following_id', () => {
    const config = getTableConfig(follows)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['follower_id', 'following_id'])
  })

  it('has check constraint to prevent self-follow in table definition', () => {
    const config = getTableConfig(follows)
    expect(config.checks.length).toBeGreaterThanOrEqual(1)
    const checkConstraint = config.checks.find(
      (c) => c.name === 'follows_prevent_self_follow_check'
    )
    expect(checkConstraint).toBeDefined()
  })

  it('has indexes on following_id, created_at, and regular_readers', () => {
    const config = getTableConfig(follows)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('follows_following_id_idx')
    expect(indexNames).toContain('follows_created_at_idx')
    expect(indexNames).toContain('idx_follows_regular_readers')
  })
})
