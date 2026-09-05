import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  accounts,
  insertAccountSchema,
  selectAccountSchema,
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

  it('safeAccountSchema removes password field and parses deletedAt', () => {
    const deletedDate = new Date()
    const safe = safeAccountSchema.parse({
      id: 1000n,
      email: 'user@wisal.dev',
      deletedAt: deletedDate,
      createdAt: new Date(),
      updatedAt: new Date(),
      password: 'ShouldBeStrippedOrIgnored',
    })

    expect((safe as any).password).toBeUndefined()
    expect(safe.email).toBe('user@wisal.dev')
    expect(safe.deletedAt).toEqual(deletedDate)
  })

  it('validates selectAccountSchema with null and non-null deletedAt', () => {
    const now = new Date()
    const active = selectAccountSchema.parse({
      id: 1000n,
      email: 'user@wisal.dev',
      password: 'hash',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    expect(active.deletedAt).toBeNull()

    const deleted = selectAccountSchema.parse({
      id: 1000n,
      email: '1000@deleted.invalid',
      password: '!ACCOUNT_DELETED!',
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    expect(deleted.deletedAt).toEqual(now)
  })

  it('has correct indexes configured on accounts table', () => {
    const config = getTableConfig(accounts)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('accounts_email_unique_idx')
    expect(indexNames).toContain('accounts_created_at_idx')
    expect(indexNames).toContain('accounts_deleted_at_idx')
  })
})

