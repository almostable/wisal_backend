import { describe, it, expect, spyOn } from 'bun:test'
import { app } from '../index'
import {
  sanitizeData,
  sanitizeQueryString,
  sanitizeEvent,
  captureAppException,
  Sentry,
} from '../lib/sentry'
import { z } from 'zod'

describe('Sentry Integration Tests', () => {
  describe('Environment DSN Validation', () => {
    const dsnSchema = z.preprocess(
      (val) => (val === '' ? undefined : val),
      z.string().url().optional()
    )

    it('accepts valid Sentry DSN URLs', () => {
      const validDsn = 'https://public_key@o0.ingest.sentry.io/123456'
      const result = dsnSchema.safeParse(validDsn)
      expect(result.success).toBe(true)
      expect(result.data).toBe(validDsn)
    })

    it('handles undefined and empty string gracefully as optional', () => {
      expect(dsnSchema.safeParse(undefined).data).toBeUndefined()
      expect(dsnSchema.safeParse('').data).toBeUndefined()
    })

    it('rejects invalid URL strings', () => {
      const invalidDsn = 'not-a-valid-url'
      const result = dsnSchema.safeParse(invalidDsn)
      expect(result.success).toBe(false)
    })
  })

  describe('PII Sanitization (beforeSend)', () => {
    it('sanitizes sensitive fields in nested objects, arrays, and JSON strings', () => {
      const payload = {
        id: '123456',
        name: 'Test User',
        email: 'user@wisal.dev',
        avatarKey: 'media/2026-09-01/123.jpg',
        fileKey: 'media/2026-09-01/avatar.png',
        password: 'superSecretPassword123!',
        adminPassword: 'adminSuperPassword123!',
        token: 'session-token-xyz',
        accessToken: 'access-token-abc',
        refreshToken: 'refresh-token-def',
        secret: 'r2-secret-key-123',
        inviteCode: 'WISAL-A1B2-C3D4',
        nested: {
          sessionToken: 'nested-session-token',
          safeField: 'all good',
          nestedArr: [{ passwordHash: 'hash-value' }, { description: 'public bio' }],
        },
        rawJsonString: JSON.stringify({
          password: 'in-json-password',
          safe: 'value',
        }),
      }

      const sanitized = sanitizeData(payload) as any

      expect(sanitized.id).toBe('123456')
      expect(sanitized.name).toBe('Test User')
      expect(sanitized.email).toBe('[REDACTED]')
      expect(sanitized.avatarKey).toBe('media/2026-09-01/123.jpg')
      expect(sanitized.fileKey).toBe('media/2026-09-01/avatar.png')

      expect(sanitized.password).toBe('[REDACTED]')
      expect(sanitized.adminPassword).toBe('[REDACTED]')
      expect(sanitized.token).toBe('[REDACTED]')
      expect(sanitized.accessToken).toBe('[REDACTED]')
      expect(sanitized.refreshToken).toBe('[REDACTED]')
      expect(sanitized.secret).toBe('[REDACTED]')
      expect(sanitized.inviteCode).toBe('[REDACTED]')

      expect(sanitized.nested.sessionToken).toBe('[REDACTED]')
      expect(sanitized.nested.safeField).toBe('all good')
      expect(sanitized.nested.nestedArr[0].passwordHash).toBe('[REDACTED]')
      expect(sanitized.nested.nestedArr[1].description).toBe('public bio')

      const parsedJson = JSON.parse(sanitized.rawJsonString)
      expect(parsedJson.password).toBe('[REDACTED]')
      expect(parsedJson.safe).toBe('value')
    })

    it('sanitizes sensitive query strings', () => {
      const queryString = 'q=search&token=secret-token-123&password=pass&limit=20'
      const sanitized = sanitizeQueryString(queryString)
      expect(sanitized).toContain('q=search')
      expect(sanitized).toContain('token=%5BREDACTED%5D')
      expect(sanitized).toContain('password=%5BREDACTED%5D')
      expect(sanitized).toContain('limit=20')
    })

    it('sanitizes full Sentry error events including headers, breadcrumbs, and request body', () => {
      const mockEvent: any = {
        request: {
          headers: {
            Authorization: 'Bearer super-secret-jwt-token',
            cookie: 'admin_session=abc123session',
            'x-api-key': 'secret-api-key',
            'Content-Type': 'application/json',
            'User-Agent': 'WisalClient/1.0',
          },
          data: {
            email: 'user@wisal.dev',
            password: 'mySecretPassword',
          },
          query_string: 'token=xyz123&author=456',
        },
        breadcrumbs: [
          {
            category: 'http',
            data: {
              url: 'https://api.wisal.dev/auth/login',
              authorization: 'Bearer token123',
            },
          },
        ],
        extra: {
          inviteCode: 'SECRET-CODE',
          details: 'some details',
        },
      }

      const result = sanitizeEvent(mockEvent)

      expect(result.request?.headers?.Authorization).toBe('[REDACTED]')
      expect(result.request?.headers?.cookie).toBe('[REDACTED]')
      expect(result.request?.headers?.['x-api-key']).toBe('[REDACTED]')
      expect(result.request?.headers?.['Content-Type']).toBe('application/json')
      expect(result.request?.headers?.['User-Agent']).toBe('WisalClient/1.0')

      expect((result.request?.data as any)?.email).toBe('[REDACTED]')
      expect((result.request?.data as any)?.password).toBe('[REDACTED]')

      expect(result.request?.query_string).toContain('token=%5BREDACTED%5D')
      expect(result.request?.query_string).toContain('author=456')

      expect(result.breadcrumbs?.[0]?.data?.authorization).toBe('[REDACTED]')
      expect(result.breadcrumbs?.[0]?.data?.url).toBe('https://api.wisal.dev/auth/login')

      expect(result.extra?.inviteCode).toBe('[REDACTED]')
      expect(result.extra?.details).toBe('some details')
    })
  })

  describe('Debug Sentry Endpoints', () => {
    it('GET /debug-sentry throws error, captures to Sentry, and returns 500', async () => {
      const captureSpy = spyOn(Sentry, 'captureException')

      const res = await app.request('/debug-sentry')
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Internal Server Error')
      expect(captureSpy).toHaveBeenCalled()

      captureSpy.mockRestore()
    })

    it('GET /api/debug-sentry throws error, captures to Sentry, and returns 500', async () => {
      const captureSpy = spyOn(Sentry, 'captureException')

      const res = await app.request('/api/debug-sentry')
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Internal Server Error')
      expect(captureSpy).toHaveBeenCalled()

      captureSpy.mockRestore()
    })
  })

  describe('captureAppException helper', () => {
    it('captures exception with Hono context data when provided', () => {
      const captureSpy = spyOn(Sentry, 'captureException')

      const mockContext: any = {
        req: {
          method: 'POST',
          path: '/posts',
          url: 'http://localhost:3000/posts',
        },
        get: (key: string) => {
          if (key === 'account') return { id: '111222', email: 'author@wisal.dev' }
          if (key === 'profile') return { id: '333444', identity: 'authorhandle' }
          return undefined
        },
      }

      captureAppException(new Error('Test captureAppException'), mockContext)
      expect(captureSpy).toHaveBeenCalled()

      captureSpy.mockRestore()
    })
  })
})
