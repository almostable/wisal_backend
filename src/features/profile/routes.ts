import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import {
  identityParamSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  listMyInvitesQuerySchema,
  listFollowsQuerySchema,
  listBlocksQuerySchema,
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
  blockUser,
  unblockUser,
  getBlockedUsers,
} from './service'

export const profileRouter = new Hono()

profileRouter.use('*', authMiddleware)

profileRouter.get('/me', async (c) => {
  const account = c.get('account')
  const result = await getMyProfile(account.id)

  return c.json({
    success: true,
    ...result,
  })
})

profileRouter.post(
  '/onboarding',
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
  '/blocks',
  zValidator('query', listBlocksQuerySchema),
  async (c) => {
    const account = c.get('account')
    const query = c.req.valid('query')
    const result = await getBlockedUsers(account.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/followers',
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

profileRouter.post(
  '/:identity/block',
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const result = await blockUser(account.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.delete(
  '/:identity/block',
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const result = await unblockUser(account.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/followers',
  zValidator('param', identityParamSchema),
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserFollowersByIdentity(identity, query, account.id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/following',
  zValidator('param', identityParamSchema),
  zValidator('query', listFollowsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserFollowingByIdentity(identity, query, account.id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity',
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const profile = await getPublicProfile(identity, account.id)

    return c.json({
      success: true,
      profile,
    })
  }
)
