import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { userBlocks, insertUserBlockSchema, selectUserBlockSchema } from '../user-blocks'

describe('User Blocks Schema Tests', () => {
  it('validates a valid user block insertion payload', () => {
    const validData = {
      blockerId: 100000000000001n,
      blockedId: 200000000000002n,
    }

    const parsed = insertUserBlockSchema.parse(validData)
    expect(parsed.blockerId).toBe(100000000000001n)
    expect(parsed.blockedId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('rejects self-block in insertUserBlockSchema', () => {
    const selfBlockData = {
      blockerId: 100000000000001n,
      blockedId: 100000000000001n,
    }

    expect(() => insertUserBlockSchema.parse(selfBlockData)).toThrow('Users cannot block themselves')
  })

  it('validates selectUserBlockSchema with all fields', () => {
    const now = new Date()
    const record = {
      blockerId: 100000000000001n,
      blockedId: 200000000000002n,
      createdAt: now,
    }

    const parsed = selectUserBlockSchema.parse(record)
    expect(parsed.blockerId).toBe(100000000000001n)
    expect(parsed.blockedId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
  })

  it('has composite primary key on blocker_id and blocked_id', () => {
    const config = getTableConfig(userBlocks)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['blocker_id', 'blocked_id'])
  })

  it('has check constraint to prevent self-block in table definition', () => {
    const config = getTableConfig(userBlocks)
    expect(config.checks.length).toBeGreaterThanOrEqual(1)
    const checkConstraint = config.checks.find(
      (c) => c.name === 'user_blocks_prevent_self_block_check'
    )
    expect(checkConstraint).toBeDefined()
  })

  it('has indexes on blocked_id and created_at', () => {
    const config = getTableConfig(userBlocks)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('user_blocks_blocked_id_idx')
    expect(indexNames).toContain('user_blocks_created_at_idx')
  })
})
