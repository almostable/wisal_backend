import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth'
import {
  identityParamSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  listMyInvitesQuerySchema,
  listFollowsQuerySchema,
} from './schema'
import {
  getMyProfile,
  completeUserOnboarding,
  updateUserProfile,
  getPublicProfile,
  checkHandleAvailability,
  getMyInvites,
  getFollowers,
  getFollowing,
  getUserFollowersByIdentity,
  getUserFollowingByIdentity,
  followUser,
  unfollowUser,
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
  '/followers',
  authMiddleware,
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const query = c.req.valid('query')
    const result = await getFollowers(account.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/following',
  authMiddleware,
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const query = c.req.valid('query')
    const result = await getFollowing(account.id, query)

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

profileRouter.post(
  '/:identity/follow',
  authMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const result = await followUser(account.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.delete(
  '/:identity/follow',
  authMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const result = await unfollowUser(account.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/followers',
  optionalAuthMiddleware,
  zValidator('param', identityParamSchema),
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserFollowersByIdentity(identity, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/following',
  optionalAuthMiddleware,
  zValidator('param', identityParamSchema),
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserFollowingByIdentity(identity, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

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
