import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  userRestrictions,
  insertUserRestrictionSchema,
  selectUserRestrictionSchema,
  RESTRICTION_TYPES,
} from '../user-restrictions'

describe('User Restrictions Schema Tests', () => {
  it('validates user restriction insertion with minimal valid data', () => {
    const parsed = insertUserRestrictionSchema.parse({
      accountId: 1001n,
      adminId: 9001n,
      reason: 'Spamming inappropriate comments',
    })

    expect(parsed.accountId).toBe(1001n)
    expect(parsed.adminId).toBe(9001n)
    expect(parsed.reason).toBe('Spamming inappropriate comments')
    expect(parsed.type).toBe('ban')
  })

  it('validates user restriction insertion with temporary expiration date', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const parsed = insertUserRestrictionSchema.parse({
      accountId: 1001n,
      adminId: 9001n,
      type: 'ban',
      reason: 'Temporary violation',
      expiresAt: futureDate,
    })

    expect(parsed.expiresAt).toEqual(futureDate)
  })

  it('rejects empty reason in insertUserRestrictionSchema', () => {
    expect(() =>
      insertUserRestrictionSchema.parse({
        accountId: 1001n,
        adminId: 9001n,
        reason: '   ',
      })
    ).toThrow()
  })

  it('validates selectUserRestrictionSchema with all fields including revoked ones', () => {
    const now = new Date()
    const selected = selectUserRestrictionSchema.parse({
      id: 5001n,
      accountId: 1001n,
      adminId: 9001n,
      type: 'ban',
      reason: 'Rule violation',
      expiresAt: null,
      isActive: false,
      revokedAt: now,
      revokedById: 9002n,
      revokeReason: 'Appeal accepted',
      createdAt: now,
    })

    expect(selected.id).toBe(5001n)
    expect(selected.isActive).toBe(false)
    expect(selected.revokedById).toBe(9002n)
    expect(selected.revokeReason).toBe('Appeal accepted')
  })

  it('has correct indexes configured on user_restrictions table', () => {
    const config = getTableConfig(userRestrictions)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('user_restrictions_account_active_idx')
    expect(indexNames).toContain('user_restrictions_is_active_expires_idx')
    expect(indexNames).toContain('user_restrictions_created_at_idx')
  })

  it('has expected enum constants defined', () => {
    expect(RESTRICTION_TYPES).toContain('ban')
  })
})
