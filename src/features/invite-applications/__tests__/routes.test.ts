import { describe, it, expect, mock, beforeEach } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { normalizeContact } from '../schema'
import * as inviteAppService from '../service'
import { HTTPException } from 'hono/http-exception'

describe('Invite Applications Public Route Tests', () => {
  const validPayload = {
    name: 'John Doe',
    about: 'I am a software engineer with 6 years of experience.',
    reason: 'I want to join the Wisal community to share insights and discuss technology.',
    contact: '@johndoe',
    turnstileToken: 'test-turnstile-token',
  }

  it('normalizes contacts correctly (lowercasing, stripping @ and t.me prefixes)', () => {
    expect(normalizeContact('  @JohnDoe  ')).toBe('johndoe')
    expect(normalizeContact('https://t.me/JohnDoe')).toBe('johndoe')
    expect(normalizeContact('http://t.me/JohnDoe')).toBe('johndoe')
    expect(normalizeContact('t.me/JohnDoe')).toBe('johndoe')
    expect(normalizeContact('User@Example.COM')).toBe('user@example.com')
  })

  it('POST /invite-applications successfully submits a valid application', async () => {
    mock.module('../service', () => ({
      submitInviteApplication: async () => ({
        success: true,
        message: 'Application submitted successfully',
        id: 123456789012345n,
      }),
    }))

    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.message).toBe('Application submitted successfully')
  })

  it('POST /invite-applications rejects when validation fails (short fields)', async () => {
    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'J', // too short (< 2)
        about: 'Short', // too short (< 10)
        reason: 'Short', // too short (< 10)
        contact: 'x', // too short (< 3)
        turnstileToken: '', // empty
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /invite-applications rejects when honeypot field is filled', async () => {
    mock.module('../service', () => ({
      submitInviteApplication: async () => {
        throw new HTTPException(400, { message: 'Invalid submission' })
      },
    }))

    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPayload,
        website: 'http://spam-bot.site',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as any
    expect(body.error).toBe('Invalid submission')
  })

  it('POST /invite-applications returns 409 when contact is already pending review', async () => {
    mock.module('../service', () => ({
      submitInviteApplication: async () => {
        throw new HTTPException(409, {
          message: 'Application with this contact is already pending review',
        })
      },
    }))

    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as any
    expect(body.error).toBe('Application with this contact is already pending review')
  })

  it('POST /invite-applications returns 400 when captcha verification fails', async () => {
    mock.module('../service', () => ({
      submitInviteApplication: async () => {
        throw new HTTPException(400, { message: 'Captcha verification failed' })
      },
    }))

    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPayload,
        turnstileToken: 'invalid-token',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as any
    expect(body.error).toBe('Captcha verification failed')
  })

  it('POST /invite-applications returns 400 when contact is an existing account email', async () => {
    mock.module('../service', () => ({
      submitInviteApplication: async () => {
        throw new HTTPException(400, {
          message: 'Invalid contact information or application cannot be accepted',
        })
      },
    }))

    const res = await app.request('/invite-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPayload,
        contact: 'existing-user@wisal.dev',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as any
    expect(body.error).toBe('Invalid contact information or application cannot be accepted')
  })
})
