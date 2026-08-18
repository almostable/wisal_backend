import { describe, it, expect } from 'bun:test'
import { generateToken, hashToken } from '../token'

describe('Token Utility Tests', () => {
  it('generates unique random tokens with base64url encoding', () => {
    const t1 = generateToken()
    const t2 = generateToken()

    expect(t1).not.toBe(t2)
    expect(typeof t1).toBe('string')
    expect(t1.length).toBeGreaterThan(20)

    const customLen = generateToken(16)
    expect(customLen.length).toBeGreaterThan(10)
  })

  it('deterministically hashes tokens with sha256', () => {
    const token = 'sample-auth-token-12345'
    const h1 = hashToken(token)
    const h2 = hashToken(token)

    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(h1)).toBe(true)
  })
})
