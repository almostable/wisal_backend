import * as Sentry from '@sentry/bun'
import type { Context } from 'hono'
import { env } from '../config/env'

const SENSITIVE_KEY_REGEX =
  /(password|passwd|secret|authorization|cookie|bearer|token|invite_?code|credential|email|mail)/i

export function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data
  }

  if (typeof data === 'string') {
    if (
      (data.startsWith('{') && data.endsWith('}')) ||
      (data.startsWith('[') && data.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(data)
        return JSON.stringify(sanitizeData(parsed))
      } catch {
        // Not valid JSON
      }
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item))
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = sanitizeData(value)
      }
    }
    return sanitized
  }

  return data
}

export function sanitizeQueryString(queryString: string): string {
  try {
    const searchParams = new URLSearchParams(queryString)
    let modified = false
    for (const key of searchParams.keys()) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        searchParams.set(key, '[REDACTED]')
        modified = true
      }
    }
    return modified ? searchParams.toString() : queryString
  } catch {
    return queryString
  }
}

export function sanitizeEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        const lower = key.toLowerCase()
        if (
          lower === 'authorization' ||
          lower === 'cookie' ||
          lower === 'set-cookie' ||
          lower.includes('token') ||
          lower.includes('secret') ||
          lower.includes('auth') ||
          lower.includes('api-key')
        ) {
          event.request.headers[key] = '[REDACTED]'
        }
      }
    }

    if (event.request.data) {
      event.request.data = sanitizeData(event.request.data)
    }

    if (typeof event.request.query_string === 'string') {
      event.request.query_string = sanitizeQueryString(event.request.query_string)
    }
  }

  if (event.breadcrumbs && Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      if (bc.data && typeof bc.data === 'object') {
        bc.data = sanitizeData(bc.data) as Record<string, unknown>
      }
    }
  }

  if (event.extra && typeof event.extra === 'object') {
    event.extra = sanitizeData(event.extra) as Record<string, unknown>
  }

  return event
}

const isProduction = env.NODE_ENV === 'production'

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: Boolean(env.SENTRY_DSN),
  environment: env.NODE_ENV,
  tracesSampleRate: isProduction ? 0.2 : 1.0,
  beforeSend(event) {
    return sanitizeEvent(event)
  },
})

export function captureAppException(err: unknown, c?: Context): string | undefined {
  return Sentry.captureException(err, (scope) => {
    if (c) {
      scope.setTag('http.method', c.req.method)
      scope.setTag('http.path', c.req.path)
      scope.setTag('http.url', c.req.url)

      const account = c.get('account') as unknown as { id?: bigint | string } | undefined
      const admin = c.get('admin') as unknown as { id?: bigint | string; role?: string } | undefined
      const profile = c.get('profile') as unknown as { id?: bigint | string; identity?: string } | undefined

      if (account?.id) {
        scope.setUser({
          id: String(account.id),
        })
      } else if (admin?.id) {
        scope.setUser({
          id: String(admin.id),
          role: admin.role,
        })
      }

      if (profile?.id) {
        scope.setContext('profile', {
          id: String(profile.id),
          identity: profile.identity,
        })
      }
    }
    return scope
  })
}

export { Sentry }
