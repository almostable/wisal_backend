import { describe, it, expect } from 'bun:test'
import { app } from '../index'

app.get('/test-email-conflict', () => {
  const err: any = new Error('duplicate key value')
  err.code = '23505'
  err.constraint = 'accounts_email_unique'
  throw err
})

app.get('/test-identity-conflict', () => {
  const err: any = new Error('duplicate key value')
  err.cause = {
    code: '23505',
    constraint: 'identities_identity_unique',
  }
  throw err
})

app.get('/test-generic-conflict', () => {
  const err: any = new Error('duplicate key value')
  err.code = '23505'
  throw err
})

app.get('/test-numeric-overflow', () => {
  const err: any = new Error('numeric value out of range')
  err.code = '22003'
  throw err
})

app.get('/test-invalid-text-representation', () => {
  const err: any = new Error('invalid input syntax for type bigint')
  err.cause = {
    code: '22P02',
  }
  throw err
})

import { AppException } from '../lib/errors'

app.get('/test-syntax-error', () => {
  throw new SyntaxError('Unexpected token in JSON at position 5')
})

app.get('/test-app-exception', () => {
  throw new AppException(409, {
    message: 'Test message',
    code: 'TEST_CODE',
    details: { foo: 'bar', retryAfterSeconds: 120 },
  })
})

describe('Global Error Handler Tests', () => {
  it('maps accounts_email_unique constraint to 409 Email is already registered', async () => {
    const res = await app.request('/test-email-conflict')
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Email is already registered')
  })

  it('maps identities_identity_unique constraint to 409 Identity handle is already taken', async () => {
    const res = await app.request('/test-identity-conflict')
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Identity handle is already taken')
  })

  it('maps generic 23505 error to 409 Conflict', async () => {
    const res = await app.request('/test-generic-conflict')
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Conflict: A resource with this identifier already exists')
  })

  it('maps Postgres 22003 numeric overflow to 400 with INVALID_PARAMETER_FORMAT code', async () => {
    const res = await app.request('/test-numeric-overflow')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('Invalid parameter format')
    expect(body.code).toBe('INVALID_PARAMETER_FORMAT')
  })

  it('maps Postgres 22P02 invalid text to 400 with INVALID_PARAMETER_FORMAT code', async () => {
    const res = await app.request('/test-invalid-text-representation')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('Invalid parameter format')
    expect(body.code).toBe('INVALID_PARAMETER_FORMAT')
  })

  it('maps SyntaxError to 400 with MALFORMED_JSON code', async () => {
    const res = await app.request('/test-syntax-error')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('Malformed JSON payload')
    expect(body.code).toBe('MALFORMED_JSON')
  })

  it('returns 503 and closes connection when shutting down', async () => {
    const { setShuttingDownForTest } = await import('../index')
    setShuttingDownForTest(true)

    try {
      const res = await app.request('/db-health')
      expect(res.status).toBe(503)
      expect(res.headers.get('Connection')).toBe('close')
      const body = (await res.json()) as { error: string; code: string }
      expect(body.error).toBe('Service is shutting down')
      expect(body.code).toBe('SERVICE_UNAVAILABLE')
    } finally {
      setShuttingDownForTest(false)
    }
  })

  it('formats AppException with code, details and Retry-After header', async () => {
    const res = await app.request('/test-app-exception')
    expect(res.status).toBe(409)
    expect(res.headers.get('Retry-After')).toBe('120')
    const body = (await res.json()) as any
    expect(body.error).toBe('Test message')
    expect(body.code).toBe('TEST_CODE')
    expect(body.details).toEqual({ foo: 'bar', retryAfterSeconds: 120 })
  })
})
