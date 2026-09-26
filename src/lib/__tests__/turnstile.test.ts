import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { verifyTurnstileToken, TURNSTILE_VERIFY_URL } from '../turnstile'

describe('Turnstile Verification Utility', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('immediately returns true for test-turnstile-token in test environment', async () => {
    const result = await verifyTurnstileToken('test-turnstile-token')
    expect(result).toBe(true)
  })

  it('returns false for empty, whitespace, or nullish token', async () => {
    expect(await verifyTurnstileToken('')).toBe(false)
    expect(await verifyTurnstileToken('   ')).toBe(false)
    expect(await verifyTurnstileToken(null as any)).toBe(false)
    expect(await verifyTurnstileToken(undefined as any)).toBe(false)
  })

  it('calls Cloudflare siteverify endpoint and returns true on success', async () => {
    let capturedUrl = ''
    let capturedBody = ''

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedBody = String(init?.body ?? '')
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as any

    const result = await verifyTurnstileToken('valid-cf-token', '1.2.3.4')

    expect(result).toBe(true)
    expect(capturedUrl).toBe(TURNSTILE_VERIFY_URL)
    expect(capturedBody).toContain('response=valid-cf-token')
    expect(capturedBody).toContain('remoteip=1.2.3.4')
  })

  it('returns false when Cloudflare siteverify returns success: false', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as any

    const result = await verifyTurnstileToken('invalid-token')
    expect(result).toBe(false)
  })

  it('returns false when Cloudflare siteverify responds with HTTP error status', async () => {
    globalThis.fetch = (async () => {
      return new Response('Internal error', { status: 500 })
    }) as any

    const result = await verifyTurnstileToken('some-token')
    expect(result).toBe(false)
  })

  it('handles network failure gracefully and returns false', async () => {
    globalThis.fetch = (async () => {
      throw new Error('Network timeout')
    }) as any

    const result = await verifyTurnstileToken('some-token')
    expect(result).toBe(false)
  })
})
