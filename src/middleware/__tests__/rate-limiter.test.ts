import { describe, it, expect } from 'bun:test'
import { createRateLimiter } from '../rate-limiter'
import { Hono } from 'hono'

describe('Rate Limiter Capacity & O(1) FIFO Eviction', () => {
  it('evicts oldest keys in FIFO order when max store size is reached', async () => {
    const app = new Hono()
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 5,
      maxStoreSize: 3, // Small test pool
    })

    app.use('/test', limiter)
    app.get('/test', (c) => c.text('OK'))

    // Send requests from 3 distinct IPs
    await app.request('/test', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    await app.request('/test', { headers: { 'x-forwarded-for': '2.2.2.2' } })
    await app.request('/test', { headers: { 'x-forwarded-for': '3.3.3.3' } })

    // 4th IP triggers FIFO eviction of the oldest (1.1.1.1)
    await app.request('/test', { headers: { 'x-forwarded-for': '4.4.4.4' } })

    // If 1.1.1.1 was evicted, its counter was reset.
    // Making 5 requests from 1.1.1.1 should now start fresh and succeed
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/test', { headers: { 'x-forwarded-for': '1.1.1.1' } })
      expect(res.status).toBe(200)
    }

    // 6th request from 1.1.1.1 should now be rate limited (429)
    const blockedRes = await app.request('/test', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    expect(blockedRes.status).toBe(429)
    expect(await blockedRes.text()).toContain('Too many requests')
  })
})
