import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { postLikes, insertPostLikeSchema, selectPostLikeSchema } from '../post-likes'

describe('Post Likes Schema Tests', () => {
  it('validates a valid post like insertion payload', () => {
    const validData = {
      postId: 100000000000001n,
      profileId: 200000000000002n,
    }

    const parsed = insertPostLikeSchema.parse(validData)
    expect(parsed.postId).toBe(100000000000001n)
    expect(parsed.profileId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('validates selectPostLikeSchema with all fields', () => {
    const now = new Date()
    const record = {
      postId: 100000000000001n,
      profileId: 200000000000002n,
      createdAt: now,
    }

    const parsed = selectPostLikeSchema.parse(record)
    expect(parsed.postId).toBe(100000000000001n)
    expect(parsed.profileId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
  })

  it('has composite primary key on post_id and profile_id', () => {
    const config = getTableConfig(postLikes)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['post_id', 'profile_id'])
  })

  it('has indexes on profile_id and created_at', () => {
    const config = getTableConfig(postLikes)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('post_likes_profile_id_idx')
    expect(indexNames).toContain('post_likes_created_at_idx')
  })
})
