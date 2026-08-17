import { describe, it, expect } from 'bun:test'
import {
  generateAdminSessionToken,
  hashAdminSessionToken,
  ADMIN_COOKIE_NAME,
} from '../admin-session'
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_TTL_DAYS,
} from '../session'

describe('Session Utilities Unit Tests', () => {
  it('generateAdminSessionToken generates unique url-safe tokens', () => {
    const t1 = generateAdminSessionToken()
    const t2 = generateAdminSessionToken()
    expect(t1).not.toBe(t2)
    expect(t1.length).toBeGreaterThanOrEqual(32)
    expect(ADMIN_COOKIE_NAME).toBe('admin_session')
  })

  it('hashAdminSessionToken deterministically produces sha256 hex string', () => {
    const token = 'my-secret-admin-session-token'
    const hash1 = hashAdminSessionToken(token)
    const hash2 = hashAdminSessionToken(token)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true)
  })

  it('generateSessionToken and hashSessionToken for regular accounts', () => {
    const t1 = generateSessionToken()
    const t2 = generateSessionToken()
    expect(t1).not.toBe(t2)
    expect(SESSION_TTL_DAYS).toBe(360)

    const hash = hashSessionToken(t1)
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
  })
})
