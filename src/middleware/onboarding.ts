import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { getProfileByAccountId, isOnboardingCompleted } from '../lib/profile'
import type { ProfileWithIdentity } from '../db/schema/profiles'

export type OnboardingVariables = {
  profile: ProfileWithIdentity
}

declare module 'hono' {
  interface ContextVariableMap {
    profile: ProfileWithIdentity
  }
}

export const onboardingMiddleware = createMiddleware<{
  Variables: OnboardingVariables
}>(async (c, next) => {
  const account = c.get('account')

  if (!account) {
    throw new HTTPException(401, { message: 'Authentication required' })
  }

  const profile = await getProfileByAccountId(account.id)

  if (!profile || !isOnboardingCompleted(profile)) {
    throw new HTTPException(403, { message: 'Profile onboarding required' })
  }

  c.set('profile', profile)

  await next()
})
