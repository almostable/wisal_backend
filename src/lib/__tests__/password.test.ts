import { describe, it, expect } from 'bun:test'
import { hashPassword, verifyPassword } from '../password'

describe('Password Utility Tests', () => {
  it('hashes a plaintext password using Argon2id', async () => {
    const raw = 'SuperSecretPassword123!'
    const hash = await hashPassword(raw)

    expect(typeof hash).toBe('string')
    expect(hash.startsWith('$argon2id$')).toBe(true)
  })

  it('verifies a valid password against hash successfully', async () => {
    const raw = 'MySecurePassphrase#2026'
    const hash = await hashPassword(raw)

    const isValid = await verifyPassword(hash, raw)
    expect(isValid).toBe(true)
  })

  it('rejects an incorrect password against hash', async () => {
    const raw = 'CorrectPassword123'
    const hash = await hashPassword(raw)

    const isValid = await verifyPassword(hash, 'WrongPassword456')
    expect(isValid).toBe(false)
  })

  it('returns false when verifying an invalid hash format', async () => {
    const isValid = await verifyPassword('not-a-valid-argon2-hash', 'password')
    expect(isValid).toBe(false)
  })
})
