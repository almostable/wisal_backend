import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth'
import {
  identityParamSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  listMyInvitesQuerySchema,
} from './schema'
import {
  getMyProfile,
  completeUserOnboarding,
  updateUserProfile,
  getPublicProfile,
  checkHandleAvailability,
  getMyInvites,
} from './service'

export const profileRouter = new Hono()

profileRouter.get('/me', authMiddleware, async (c) => {
  const account = c.get('account')
  const result = await getMyProfile(account.id)

  return c.json({
    success: true,
    ...result,
  })
})

profileRouter.post(
  '/onboarding',
  authMiddleware,
  zValidator('json', onboardingInputSchema),
  async (c) => {
    const account = c.get('account')
    const data = c.req.valid('json')
    const profile = await completeUserOnboarding(account.id, data)

    return c.json({
      success: true,
      profile,
    })
  }
)

profileRouter.patch(
  '/me',
  authMiddleware,
  zValidator('json', updateProfileInputSchema),
  async (c) => {
    const account = c.get('account')
    const data = c.req.valid('json')
    const profile = await updateUserProfile(account.id, data)

    return c.json({
      success: true,
      profile,
    })
  }
)

profileRouter.get(
  '/invites',
  authMiddleware,
  zValidator('query', listMyInvitesQuerySchema),
  async (c) => {
    const account = c.get('account')
    const query = c.req.valid('query')
    const result = await getMyInvites(account.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/me/invites',
  authMiddleware,
  zValidator('query', listMyInvitesQuerySchema),
  async (c) => {
    const account = c.get('account')
    const query = c.req.valid('query')
    const result = await getMyInvites(account.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get('/check/:identity', zValidator('param', identityParamSchema), async (c) => {
  const { identity } = c.req.valid('param')
  const result = await checkHandleAvailability(identity)

  return c.json({
    success: true,
    ...result,
  })
})

profileRouter.get(
  '/:identity',
  optionalAuthMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const { identity } = c.req.valid('param')
    const profile = await getPublicProfile(identity)

    return c.json({
      success: true,
      profile,
    })
  }
)
