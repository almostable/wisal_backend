import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  feedCycles,
  insertFeedCycleSchema,
  selectFeedCycleSchema,
} from '../feed-cycles'

describe('Feed Cycles Schema Tests', () => {
  it('validates a valid feed cycle insertion payload', () => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const validData = {
      profileId: 100000000000001n,
      startedAt: now,
      expiresAt,
      usedBatches: 1,
      servedPostIds: ['900000000000001', '900000000000002'],
    }

    const parsed = insertFeedCycleSchema.parse(validData)
    expect(parsed.profileId).toBe(100000000000001n)
    expect(parsed.startedAt).toEqual(now)
    expect(parsed.expiresAt).toEqual(expiresAt)
    expect(parsed.usedBatches).toBe(1)
    expect(parsed.servedPostIds).toEqual(['900000000000001', '900000000000002'])
  })

  it('validates selectFeedCycleSchema with all fields', () => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const record = {
      id: 800000000000001n,
      profileId: 100000000000001n,
      startedAt: now,
      expiresAt,
      usedBatches: 3,
      servedPostIds: ['900000000000001', '900000000000002', '900000000000003'],
      createdAt: now,
      updatedAt: now,
    }

    const parsed = selectFeedCycleSchema.parse(record)
    expect(parsed.id).toBe(800000000000001n)
    expect(parsed.profileId).toBe(100000000000001n)
    expect(parsed.usedBatches).toBe(3)
    expect(parsed.servedPostIds).toHaveLength(3)
  })

  it('has correct indexes configured on feed_cycles table', () => {
    const config = getTableConfig(feedCycles)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('feed_cycles_profile_expires_idx')
    expect(indexNames).toContain('feed_cycles_created_at_idx')
  })
})
