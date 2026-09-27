import { describe, it, expect, mock, afterEach } from 'bun:test'
import '../../../lib/snowflake'
import { submitInviteApplication } from '../service'
import { HTTPException } from 'hono/http-exception'
import { AppException } from '../../../lib/errors'
import { ERROR_CODES } from '../../../config/error-codes'
import { db } from '../../../db'

describe('Invite Applications Service Unit Tests', () => {
  const metadata = {
    ip: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
  }

  const validInput = {
    name: 'Jane Doe',
    about: 'I have been programming in TypeScript for five years.',
    reason: 'I want to engage with top engineers in the Wisal network.',
    contact: '@janedoe',
    turnstileToken: 'test-turnstile-token',
  }

  it('rejects when honeypot website field is present', async () => {
    try {
      await submitInviteApplication(
        {
          ...validInput,
          website: 'http://spam.org',
        },
        metadata
      )
      expect.unreachable()
    } catch (err: any) {
      expect(err).toBeInstanceOf(HTTPException)
      expect(err.status).toBe(400)
      expect(err.code).toBe(ERROR_CODES.INVALID_SUBMISSION)
    }
  })

  it('rejects when turnstile captcha verification fails', async () => {
    try {
      await submitInviteApplication(
        {
          ...validInput,
          turnstileToken: '',
        },
        metadata
      )
      expect.unreachable()
    } catch (err: any) {
      expect(err).toBeInstanceOf(HTTPException)
      expect(err.status).toBe(400)
      expect(err.code).toBe(ERROR_CODES.CAPTCHA_FAILED)
    }
  })

  it('rejects when there is an application from the same IP already pending review (409)', async () => {
    const mockExecutor: any = {
      query: {
        accounts: {
          findFirst: async () => null,
        },
        inviteApplications: {
          findFirst: async () => ({
            id: 111111111111111n,
            ip: '127.0.0.1',
            status: 'pending',
            createdAt: new Date(),
          }),
        },
      },
    }

    try {
      await submitInviteApplication(validInput, metadata, mockExecutor)
      expect.unreachable()
    } catch (err: any) {
      expect(err).toBeInstanceOf(HTTPException)
      expect(err.status).toBe(409)
      expect(err.code).toBe(ERROR_CODES.IP_PENDING_APPLICATION)
      expect(err.details).toEqual({ status: 'pending' })
    }
  })

  it('rejects when an application from the same IP was submitted within the last 24 hours (429)', async () => {
    let callCount = 0
    const mockExecutor: any = {
      query: {
        accounts: {
          findFirst: async () => null,
        },
        inviteApplications: {
          findFirst: async () => {
            callCount++
            // First call is pending check -> returns null (not pending)
            if (callCount === 1) return null
            // Second call is 24h cooldown check -> returns recent application
            if (callCount === 2) {
              return {
                id: 111111111111111n,
                ip: '127.0.0.1',
                status: 'rejected',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
              }
            }
            return null
          },
        },
      },
    }

    try {
      await submitInviteApplication(validInput, metadata, mockExecutor)
      expect.unreachable()
    } catch (err: any) {
      expect(err).toBeInstanceOf(HTTPException)
      expect(err.status).toBe(429)
      expect(err.code).toBe(ERROR_CODES.IP_COOLDOWN_ACTIVE)
      expect(err.details.cooldownHours).toBe(24)
      expect(typeof err.details.retryAfterSeconds).toBe('number')
      expect(err.details.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it('allows application when previous submission from same IP was more than 24 hours ago and resolved', async () => {
    let insertedData: any = null
    const mockExecutor: any = {
      query: {
        accounts: {
          findFirst: async () => null,
        },
        inviteApplications: {
          findFirst: async () => null, // No pending, no recent within 24h, no pending contact
        },
      },
      insert: () => ({
        values: (val: any) => ({
          returning: async () => {
            insertedData = val
            return [{ id: 999999999999999n, ...val }]
          },
        }),
      }),
    }

    const result = await submitInviteApplication(validInput, metadata, mockExecutor)
    expect(result.success).toBe(true)
    expect(result.id).toBe(999999999999999n)
    expect(insertedData.ip).toBe('127.0.0.1')
    expect(insertedData.contactNormalized).toBe('janedoe')
  })

  it('skips IP checks if metadata.ip is anonymous', async () => {
    let findFirstCalled = 0
    const mockExecutor: any = {
      query: {
        accounts: {
          findFirst: async () => null,
        },
        inviteApplications: {
          findFirst: async () => {
            findFirstCalled++
            return null
          },
        },
      },
      insert: () => ({
        values: (val: any) => ({
          returning: async () => [{ id: 999999999999999n, ...val }],
        }),
      }),
    }

    const result = await submitInviteApplication(
      validInput,
      { ip: 'anonymous', userAgent: 'TestAgent' },
      mockExecutor
    )
    expect(result.success).toBe(true)
    // findFirst is only called once for contact deduplication, not for IP checks
    expect(findFirstCalled).toBe(1)
  })
})
