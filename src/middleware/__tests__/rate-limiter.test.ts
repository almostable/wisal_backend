import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  rateLimiter,
  getClientIp,
  resetRateLimitsForTesting,
} from '../rate-limiter'

describe('Rate Limiter Middleware Tests', () => {
  beforeEach(() => {
    resetRateLimitsForTesting()
  })

  it('allows requests within limit and blocks requests exceeding limit', async () => {
    const testApp = new Hono()
    testApp.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
      }
      return c.json({ error: 'Error' }, 500)
    })
    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      max: 3,
    })

    testApp.use('/test-route', limiter)
    testApp.get('/test-route', (c) => c.json({ ok: true }))

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await testApp.request('/test-route', {
        headers: { 'x-forwarded-for': '1.2.3.4' },
      })
      expect(res.status).toBe(200)
    }

    // 4th request exceeds limit -> 429
    const blockedRes = await testApp.request('/test-route', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(blockedRes.status).toBe(429)
    const body = (await blockedRes.json()) as { error: string }
    expect(body.error).toContain('Too many requests')
  })

  it('tracks distinct IP addresses independently', async () => {
    const testApp = new Hono()
    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      max: 2,
    })

    testApp.use('/test-ip', limiter)
    testApp.get('/test-ip', (c) => c.json({ ok: true }))

    // IP 1 uses all 2 tokens
    await testApp.request('/test-ip', { headers: { 'x-forwarded-for': '10.0.0.1' } })
    await testApp.request('/test-ip', { headers: { 'x-forwarded-for': '10.0.0.1' } })
    const blockedIp1 = await testApp.request('/test-ip', { headers: { 'x-forwarded-for': '10.0.0.1' } })
    expect(blockedIp1.status).toBe(429)

    // IP 2 is not blocked
    const allowedIp2 = await testApp.request('/test-ip', { headers: { 'x-forwarded-for': '10.0.0.2' } })
    expect(allowedIp2.status).toBe(200)
  })

  it('getClientIp extracts first IP from comma-separated x-forwarded-for', () => {
    const mockContext: any = {
      req: {
        header: (name: string) => {
          if (name === 'x-forwarded-for') return '203.0.113.195, 70.41.3.18, 150.172.238.178'
          return undefined
        },
      },
    }
    expect(getClientIp(mockContext)).toBe('203.0.113.195')
  })

  it('resetRateLimitsForTesting clears all hit counts', async () => {
    const testApp = new Hono()
    const limiter = rateLimiter({
      windowMs: 60 * 1000,
      max: 1,
    })

    testApp.use('/test-reset', limiter)
    testApp.get('/test-reset', (c) => c.json({ ok: true }))

    const res1 = await testApp.request('/test-reset', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(res1.status).toBe(200)

    const res2 = await testApp.request('/test-reset', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(res2.status).toBe(429)

    resetRateLimitsForTesting()

    const res3 = await testApp.request('/test-reset', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(res3.status).toBe(200)
  })
})
