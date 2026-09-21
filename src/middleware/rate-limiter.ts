import type { MiddlewareHandler, Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { env } from '../config/env'

export interface RateLimiterOptions {
  windowMs?: number
  max?: number
  message?: string
  keyGenerator?: (c: Context) => string
}

interface RateLimitRecord {
  count: number
  resetAt: number
}

const stores = new Set<Map<string, RateLimitRecord>>()

export function resetRateLimiters(): void {
  for (const store of stores) {
    store.clear()
  }
}

export const resetRateLimitsForTesting = resetRateLimiters

export function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'anonymous'
  )
}

export function rateLimiter(options: RateLimiterOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60 * 1000
  const max = options.max ?? (env.NODE_ENV === 'test' ? 1000 : 60)
  const message = options.message ?? 'Too many requests, please try again later'
  const keyGenerator =
    options.keyGenerator ??
    ((c: Context) => {
      const clientIp = getClientIp(c)
      return `${c.req.path}:${clientIp}`
    })

  const store = new Map<string, RateLimitRecord>()
  stores.add(store)

  return async (c, next) => {
    const key = keyGenerator(c)
    const now = Date.now()
    let record = store.get(key)

    if (!record || now >= record.resetAt) {
      record = {
        count: 1,
        resetAt: now + windowMs,
      }
      store.set(key, record)
    } else {
      record.count += 1
    }

    // Periodically evict expired entries if store gets large
    if (store.size > 1000) {
      for (const [k, v] of store.entries()) {
        if (now >= v.resetAt) {
          store.delete(k)
        }
      }
    }

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfterSeconds))
      throw new HTTPException(429, { message })
    }

    await next()
  }
}

export const authLoginRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 15,
  message: 'Too many login attempts, please try again later',
})

export const authRegisterRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 10,
  message: 'Too many registration attempts, please try again later',
})

export const adminLoginRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 10,
  message: 'Too many admin login attempts, please try again later',
})

export const uploadPresignRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 60,
  message: 'Too many upload requests, please try again later',
})

export const createPostRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 30,
  message: 'Too many posts created, please try again later',
})
