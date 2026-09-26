import { describe, it, expect, mock, afterEach } from 'bun:test'
import '../../../lib/snowflake'
import { submitInviteApplication } from '../service'
import { HTTPException } from 'hono/http-exception'
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
    await expect(
      submitInviteApplication(
        {
          ...validInput,
          website: 'http://spam.org',
        },
        metadata
      )
    ).rejects.toThrow(new HTTPException(400, { message: 'Invalid submission' }))
  })

  it('rejects when turnstile captcha verification fails', async () => {
    await expect(
      submitInviteApplication(
        {
          ...validInput,
          turnstileToken: '',
        },
        metadata
      )
    ).rejects.toThrow(new HTTPException(400, { message: 'Captcha verification failed' }))
  })
})
