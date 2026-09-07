import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { readers, insertReaderSchema, selectReaderSchema } from '../readers'

describe('Readers Schema Tests', () => {
  it('validates a valid reader insertion payload', () => {
    const validData = {
      readerProfileId: 100000000000001n,
      authorProfileId: 200000000000002n,
    }

    const parsed = insertReaderSchema.parse(validData)
    expect(parsed.readerProfileId).toBe(100000000000001n)
    expect(parsed.authorProfileId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('rejects self-read in insertReaderSchema', () => {
    const selfReadData = {
      readerProfileId: 100000000000001n,
      authorProfileId: 100000000000001n,
    }

    expect(() => insertReaderSchema.parse(selfReadData)).toThrow('Profiles cannot read themselves')
  })

  it('validates selectReaderSchema with all fields', () => {
    const now = new Date()
    const record = {
      readerProfileId: 100000000000001n,
      authorProfileId: 200000000000002n,
      createdAt: now,
      lastReadAt: now,
    }

    const parsed = selectReaderSchema.parse(record)
    expect(parsed.readerProfileId).toBe(100000000000001n)
    expect(parsed.authorProfileId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
    expect(parsed.lastReadAt).toEqual(now)
  })

  it('validates selectReaderSchema with null lastReadAt', () => {
    const now = new Date()
    const record = {
      readerProfileId: 100000000000001n,
      authorProfileId: 200000000000002n,
      createdAt: now,
      lastReadAt: null,
    }

    const parsed = selectReaderSchema.parse(record)
    expect(parsed.lastReadAt).toBeNull()
  })

  it('has composite primary key on reader_profile_id and author_profile_id', () => {
    const config = getTableConfig(readers)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['reader_profile_id', 'author_profile_id'])
  })

  it('has check constraint to prevent self-read in table definition', () => {
    const config = getTableConfig(readers)
    expect(config.checks.length).toBeGreaterThanOrEqual(1)
    const checkConstraint = config.checks.find(
      (c) => c.name === 'readers_prevent_self_read_check'
    )
    expect(checkConstraint).toBeDefined()
  })

  it('has indexes on author_profile_id, created_at, and regular_readers', () => {
    const config = getTableConfig(readers)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('readers_author_profile_id_idx')
    expect(indexNames).toContain('readers_created_at_idx')
    expect(indexNames).toContain('idx_readers_regular_readers')
  })
})
