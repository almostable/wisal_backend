import { describe, it, expect } from 'bun:test'
import { generateRandomUserIdentity, SAFE_IDENTITY_ALPHABET } from '../identity'
import { standardIdentityFormatSchema } from '../../db/schema/identities'

describe('Identity Generator', () => {
  it('generates identities with user prefix and 6 safe characters', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRandomUserIdentity()
      expect(id).toMatch(/^user[23456789bcdfghjkmnpqrstvwxyz]{6}$/)
      expect(id.length).toBe(10)
      // Must pass identity schema validation
      expect(() => standardIdentityFormatSchema.parse(id)).not.toThrow()
    }
  })

  it('generates unique values', () => {
    const set = new Set<string>()
    for (let i = 0; i < 500; i++) {
      set.add(generateRandomUserIdentity())
    }
    expect(set.size).toBe(500)
  })

  it('alphabet contains 28 characters without vowels or homoglyphs', () => {
    expect(SAFE_IDENTITY_ALPHABET.length).toBe(28)
    const forbidden = ['0', '1', 'l', 'i', 'o', 'a', 'e', 'u']
    for (const char of forbidden) {
      expect(SAFE_IDENTITY_ALPHABET).not.toContain(char)
    }
  })
})
