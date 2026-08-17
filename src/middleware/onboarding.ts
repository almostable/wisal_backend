import { createMiddleware } from 'hono/factory'
import { getProfileByAccountId, isOnboardingCompleted } from '../lib/profile'
import type { ProfileWithIdentity } from '../db/schema/profiles'

export type OnboardingVariables = {
  profile: ProfileWithIdentity
}

// Augment Hono ContextVariableMap with profile
declare module 'hono' {
  interface ContextVariableMap {
    profile: ProfileWithIdentity
  }
}

/**
 * Onboarding check middleware.
 * Verifies that the authenticated user has completed their profile (name, is_male, identity).
 * Must be used after `authMiddleware`.
 * Injects `profile` (which includes `.identity`) into context.
 * Returns 403 Forbidden with code ONBOARDING_REQUIRED if profile is incomplete.
 */
export const onboardingMiddleware = createMiddleware<{
  Variables: OnboardingVariables
}>(async (c, next) => {
  const account = c.get('account')

  if (!account) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required before checking onboarding status',
      },
      401
    )
  }

  const profile = await getProfileByAccountId(account.id)

  if (!profile || !isOnboardingCompleted(profile)) {
    return c.json(
      {
        error: 'Forbidden',
        code: 'ONBOARDING_REQUIRED',
        message:
          'You must complete your profile onboarding (name, is_male, identity) before accessing this resource',
      },
      403
    )
  }

  c.set('profile', profile)

  await next()
})
