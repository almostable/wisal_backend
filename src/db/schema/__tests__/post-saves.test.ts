import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { postSaves, insertPostSaveSchema, selectPostSaveSchema } from '../post-saves'

describe('Post Saves Schema Tests', () => {
  it('validates a valid post save insertion payload', () => {
    const validData = {
      postId: 100000000000001n,
      userId: 200000000000002n,
    }

    const parsed = insertPostSaveSchema.parse(validData)
    expect(parsed.postId).toBe(100000000000001n)
    expect(parsed.userId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('validates selectPostSaveSchema with all fields', () => {
    const now = new Date()
    const record = {
      postId: 100000000000001n,
      userId: 200000000000002n,
      createdAt: now,
    }

    const parsed = selectPostSaveSchema.parse(record)
    expect(parsed.postId).toBe(100000000000001n)
    expect(parsed.userId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
  })

  it('has composite primary key on post_id and user_id', () => {
    const config = getTableConfig(postSaves)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['post_id', 'user_id'])
  })

  it('has indexes on user_id and created_at', () => {
    const config = getTableConfig(postSaves)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('post_saves_user_id_idx')
    expect(indexNames).toContain('post_saves_created_at_idx')
  })
})
