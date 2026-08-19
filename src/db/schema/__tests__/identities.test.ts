import { describe, it, expect } from 'bun:test'
import { identityFormatSchema, RESERVED_IDENTITIES, insertIdentitySchema, selectIdentitySchema } from '../identities'

describe('Identities Schema Tests', () => {
  it('validates a valid identity format and normalizes to lowercase', () => {
    expect(identityFormatSchema.parse('Alice_123')).toBe('alice_123')
    expect(identityFormatSchema.parse('  super_user  ')).toBe('super_user')
  })

  it('rejects identities shorter than 3 characters', () => {
    expect(() => identityFormatSchema.parse('ab')).toThrow()
  })

  it('rejects identities longer than 32 characters', () => {
    expect(() => identityFormatSchema.parse('a'.repeat(33))).toThrow()
  })

  it('rejects identities with invalid characters', () => {
    expect(() => identityFormatSchema.parse('user@name')).toThrow()
    expect(() => identityFormatSchema.parse('user-name')).toThrow()
    expect(() => identityFormatSchema.parse('user.name')).toThrow()
    expect(() => identityFormatSchema.parse('user name')).toThrow()
  })

  it('rejects reserved system identities', () => {
    for (const reserved of RESERVED_IDENTITIES) {
      expect(() => identityFormatSchema.parse(reserved)).toThrow()
      expect(() => identityFormatSchema.parse(`  ${reserved.toUpperCase()}  `)).toThrow()
    }
  })

  it('validates insertIdentitySchema and selectIdentitySchema', () => {
    const insertPayload = insertIdentitySchema.parse({
      identity: 'my_unique_nick',
    })
    expect(insertPayload.identity).toBe('my_unique_nick')

    const now = new Date()
    const selectPayload = selectIdentitySchema.parse({
      id: 123456789n,
      identity: 'my_unique_nick',
      createdAt: now,
      updatedAt: now,
    })
    expect(selectPayload.id).toBe(123456789n)
    expect(selectPayload.identity).toBe('my_unique_nick')
  })
})
