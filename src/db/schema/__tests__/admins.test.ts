import { describe, it, expect } from 'bun:test'
import {
  insertAdminSchema,
  safeAdminSchema,
  adminRoleSchema,
  adminRawPasswordSchema,
  ADMIN_ROLES,
} from '../admins'

describe('Admin & Admin Sessions Schema Tests', () => {
  it('validates admin insertion with valid data and lowercases email', () => {
    const parsed = insertAdminSchema.parse({
      email: '  Admin.User@Wisal.DEV  ',
      password: 'StrongPassword12345!',
      role: 'admin',
    })

    expect(parsed.email).toBe('admin.user@wisal.dev')
    expect(parsed.password).toBe('StrongPassword12345!')
    expect(parsed.role).toBe('admin')
  })

  it('rejects invalid email formats', () => {
    expect(() =>
      insertAdminSchema.parse({
        email: 'invalid-email',
        password: 'StrongPassword12345!',
      })
    ).toThrow()
  })

  it('rejects admin passwords shorter than 16 characters', () => {
    expect(() => adminRawPasswordSchema.parse('123456789012345')).toThrow()
    expect(adminRawPasswordSchema.parse('1234567890123456')).toBe('1234567890123456')
  })

  it('validates allowed roles and rejects invalid roles', () => {
    expect(adminRoleSchema.parse('admin')).toBe('admin')
    expect(adminRoleSchema.parse('moderator')).toBe('moderator')
    expect(() => adminRoleSchema.parse('superhero')).toThrow()
  })

  it('safeAdminSchema removes password field', () => {
    const safe = safeAdminSchema.parse({
      id: 1000n,
      email: 'admin@wisal.dev',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      password: 'ShouldBeStrippedOrIgnored',
    })

    expect((safe as any).password).toBeUndefined()
    expect(safe.email).toBe('admin@wisal.dev')
    expect(safe.role).toBe('admin')
  })
})
