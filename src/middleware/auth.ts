import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { validateSessionToken } from '../lib/session'
import { getProfileByAccountId, isOnboardingCompleted } from '../lib/profile'
import type { Session } from '../db/schema/sessions'
import type { SafeAccount } from '../db/schema/accounts'
import type { OnboardedProfile } from './onboarding'

export type AuthVariables = {
  session: Session
  account: SafeAccount
}

declare module 'hono' {
  interface ContextVariableMap {
    session: Session
    account: SafeAccount
  }
}

export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null
  const trimmed = authHeader.trim()
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    const token = trimmed.slice(7).trim()
    return token.length > 0 ? token : null
  }
  return trimmed.length > 0 ? trimmed : null
}

export const authMiddleware = createMiddleware<{
  Variables: AuthVariables
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (!token) {
    throw new HTTPException(401, { message: 'Missing or malformed Authorization header' })
  }

  const result = await validateSessionToken(token)

  if (!result) {
    throw new HTTPException(401, { message: 'Invalid or expired session token' })
  }

  c.set('session', result.session)
  c.set('account', result.account)

  await next()
})

export const optionalAuthMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (token) {
    const result = await validateSessionToken(token)

    if (!result) {
      throw new HTTPException(401, { message: 'Invalid or expired session token' })
    }

    c.set('session', result.session)
    c.set('account', result.account)

    const profile = await getProfileByAccountId(result.account.id)
    if (profile && isOnboardingCompleted(profile)) {
      c.set('profile', profile as OnboardedProfile)
    }
  }

  await next()
})

