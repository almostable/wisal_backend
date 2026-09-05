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

describe('Global Error Handler Tests (23505 unique_violation mapping)', () => {
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
})
