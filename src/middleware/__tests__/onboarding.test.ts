import { describe, it, expect, mock } from 'bun:test'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { onboardingMiddleware } from '../onboarding'
import { isOnboardingCompleted } from '../../lib/profile'
import type { SafeAccount } from '../../db/schema/accounts'
import type { ProfileWithIdentity } from '../../db/schema/profiles'

function createTestApp() {
  const app = new Hono()
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    return c.json({ error: 'Internal Server Error' }, 500)
  })
  return app
}

describe('Onboarding Middleware Unit Tests', () => {
  const mockAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockCompletedProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: mockAccount.id,
    name: 'John Doe',
    isMale: true,
    avatarKey: null,
    description: 'Hello',
    shortDescription: null,
    countryCode: null,
    cityId: null,
    contacts: null,
    identityId: 444444444444444n,
    regularFollowersCount: 0,
    followersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'johndoe',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  it('throws 401 when context account is missing', async () => {
    const app = createTestApp()
    app.use('/protected', onboardingMiddleware)
    app.get('/protected', (c) => c.json({ ok: true }))

    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Authentication required')
  })

  it('throws 403 when onboarding is incomplete', async () => {
    const app = createTestApp()
    app.use('/protected', async (c, next) => {
      c.set('account', mockAccount)
      await next()
    })
    app.use('/protected', onboardingMiddleware)
    app.get('/protected', (c) => c.json({ ok: true }))

    mock.module('../../lib/profile', () => ({
      getProfileByAccountId: async () => null,
      isOnboardingCompleted,
    }))

    const res = await app.request('/protected')
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Profile onboarding required')
  })

  it('passes and sets profile in context when onboarding is complete', async () => {
    const app = createTestApp()
    app.use('/protected', async (c, next) => {
      c.set('account', mockAccount)
      await next()
    })
    app.use('/protected', onboardingMiddleware)
    app.get('/protected', (c) => {
      const profile = c.get('profile')
      return c.json({ name: profile.name, handle: profile.identity?.identity })
    })

    mock.module('../../lib/profile', () => ({
      getProfileByAccountId: async () => mockCompletedProfile,
      isOnboardingCompleted,
    }))

    const res = await app.request('/protected')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; handle: string }
    expect(body.name).toBe('John Doe')
    expect(body.handle).toBe('johndoe')
  })
})
