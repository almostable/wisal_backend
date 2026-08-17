import { describe, it, expect } from 'bun:test'
import {
  insertAccountSchema,
  rawPasswordSchema,
  emailSchema,
  safeAccountSchema,
} from '../accounts'

describe('Accounts Schema Tests', () => {
  it('validates account insertion with valid data and lowercases email', () => {
    const parsed = insertAccountSchema.parse({
      email: '  User.Account@Wisal.DEV  ',
      password: 'UserSecurePass12!',
    })

    expect(parsed.email).toBe('user.account@wisal.dev')
    expect(parsed.password).toBe('UserSecurePass12!')
  })

  it('rejects account passwords shorter than 12 characters', () => {
    expect(() => rawPasswordSchema.parse('12345678901')).toThrow()
    expect(rawPasswordSchema.parse('123456789012')).toBe('123456789012')
  })

  it('rejects invalid email formats', () => {
    expect(() => emailSchema.parse('invalid-email-address')).toThrow()
  })

  it('safeAccountSchema removes password field', () => {
    const safe = safeAccountSchema.parse({
      id: 1000n,
      email: 'user@wisal.dev',
      createdAt: new Date(),
      updatedAt: new Date(),
      password: 'ShouldBeStrippedOrIgnored',
    })

    expect((safe as any).password).toBeUndefined()
    expect(safe.email).toBe('user@wisal.dev')
  })
})
