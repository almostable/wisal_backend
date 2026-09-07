import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { profileBlocks, insertProfileBlockSchema, selectProfileBlockSchema } from '../profile-blocks'

describe('Profile Blocks Schema Tests', () => {
  it('validates a valid profile block insertion payload', () => {
    const validData = {
      blockerProfileId: 100000000000001n,
      blockedProfileId: 200000000000002n,
    }

    const parsed = insertProfileBlockSchema.parse(validData)
    expect(parsed.blockerProfileId).toBe(100000000000001n)
    expect(parsed.blockedProfileId).toBe(200000000000002n)
    expect(parsed.createdAt).toBeUndefined()
  })

  it('rejects self-block in insertProfileBlockSchema', () => {
    const selfBlockData = {
      blockerProfileId: 100000000000001n,
      blockedProfileId: 100000000000001n,
    }

    expect(() => insertProfileBlockSchema.parse(selfBlockData)).toThrow('Profiles cannot block themselves')
  })

  it('validates selectProfileBlockSchema with all fields', () => {
    const now = new Date()
    const record = {
      blockerProfileId: 100000000000001n,
      blockedProfileId: 200000000000002n,
      createdAt: now,
    }

    const parsed = selectProfileBlockSchema.parse(record)
    expect(parsed.blockerProfileId).toBe(100000000000001n)
    expect(parsed.blockedProfileId).toBe(200000000000002n)
    expect(parsed.createdAt).toEqual(now)
  })

  it('has composite primary key on blocker_profile_id and blocked_profile_id', () => {
    const config = getTableConfig(profileBlocks)
    expect(config.primaryKeys.length).toBe(1)
    const pk = config.primaryKeys[0]
    expect(pk.columns.map((c) => c.name)).toEqual(['blocker_profile_id', 'blocked_profile_id'])
  })

  it('has check constraint to prevent self-block in table definition', () => {
    const config = getTableConfig(profileBlocks)
    expect(config.checks.length).toBeGreaterThanOrEqual(1)
    const checkConstraint = config.checks.find(
      (c) => c.name === 'profile_blocks_prevent_self_block_check'
    )
    expect(checkConstraint).toBeDefined()
  })

  it('has indexes on blocked_profile_id and created_at', () => {
    const config = getTableConfig(profileBlocks)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('profile_blocks_blocked_profile_id_idx')
    expect(indexNames).toContain('profile_blocks_created_at_idx')
  })
})
