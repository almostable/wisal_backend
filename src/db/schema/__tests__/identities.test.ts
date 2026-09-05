import { describe, it, expect } from 'bun:test'
import {
  identityFormatSchema,
  standardIdentityFormatSchema,
  createIdentityFormatSchema,
  RESERVED_IDENTITIES,
  insertIdentitySchema,
  selectIdentitySchema,
} from '../identities'

describe('Identities Schema Tests', () => {
  it('validates a valid identity format and normalizes to lowercase', () => {
    expect(identityFormatSchema.parse('Alice_123')).toBe('alice_123')
    expect(identityFormatSchema.parse('  super_user  ')).toBe('super_user')
  })

  it('rejects identities starting with digits or underscores, or containing only digits', () => {
    expect(() => identityFormatSchema.parse('1user')).toThrow('Identity must start with a letter')
    expect(() => identityFormatSchema.parse('12345')).toThrow('Identity must start with a letter')
    expect(() => identityFormatSchema.parse('_user')).toThrow('Identity must start with a letter')
    expect(() => identityFormatSchema.parse('99999')).toThrow('Identity must start with a letter')
  })

  it('accepts identities starting with a letter and containing digits and underscores', () => {
    expect(identityFormatSchema.parse('user1')).toBe('user1')
    expect(identityFormatSchema.parse('u_123')).toBe('u_123')
    expect(identityFormatSchema.parse('a1b2c3')).toBe('a1b2c3')
  })

  it('rejects identities shorter than 3 characters for verified schema', () => {
    expect(() => identityFormatSchema.parse('ab')).toThrow()
    expect(identityFormatSchema.parse('cat')).toBe('cat')
    expect(identityFormatSchema.parse('alex')).toBe('alex')
  })

  it('enforces min 5 characters for standardIdentityFormatSchema and allows 3 for verified', () => {
    expect(() => standardIdentityFormatSchema.parse('cat')).toThrow(
      'Identity must be at least 5 characters long'
    )
    expect(() => standardIdentityFormatSchema.parse('alex')).toThrow(
      'Identity must be at least 5 characters long'
    )
    expect(standardIdentityFormatSchema.parse('alex1')).toBe('alex1')
    expect(standardIdentityFormatSchema.parse('super')).toBe('super')

    const verifiedSchema = createIdentityFormatSchema(true)
    expect(verifiedSchema.parse('cat')).toBe('cat')
    expect(() => verifiedSchema.parse('ca')).toThrow('Identity must be at least 3 characters long')
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
