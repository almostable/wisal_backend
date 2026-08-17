import { createMiddleware } from 'hono/factory'
import { validateSessionToken } from '../lib/session'
import type { Session } from '../db/schema/sessions'
import type { SafeAccount } from '../db/schema/accounts'

/**
 * Variables injected into Hono context by authentication middlewares
 */
export type AuthVariables = {
  session: Session
  account: SafeAccount
}

export type OptionalAuthVariables = {
  session?: Session
  account?: SafeAccount
}

// Augment Hono ContextVariableMap for global type-safety across routes
declare module 'hono' {
  interface ContextVariableMap {
    session: Session
    account: SafeAccount
  }
}

/**
 * Extracts a bearer token from the Authorization header value
 * Supports both "Bearer <token>" and raw "<token>"
 */
export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null
  const trimmed = authHeader.trim()
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    const token = trimmed.slice(7).trim()
    return token.length > 0 ? token : null
  }
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Strict authentication middleware.
 * Verifies session token from Authorization header and injects session + safe account into context.
 * Returns 401 Unauthorized if token is missing, invalid or expired.
 */
export const authMiddleware = createMiddleware<{
  Variables: AuthVariables
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (!token) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header',
      },
      401
    )
  }

  const result = await validateSessionToken(token)

  if (!result) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired session token',
      },
      401
    )
  }

  c.set('session', result.session)
  c.set('account', result.account)

  await next()
})

/**
 * Optional authentication middleware.
 * If a valid token is provided, injects session and account into context.
 * If token is missing or invalid, proceeds without throwing 401.
 */
export const optionalAuthMiddleware = createMiddleware<{
  Variables: OptionalAuthVariables
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (token) {
    const result = await validateSessionToken(token)
    if (result) {
      c.set('session', result.session)
      c.set('account', result.account)
    }
  }

  await next()
})
