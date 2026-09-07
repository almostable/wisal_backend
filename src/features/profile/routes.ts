import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import { getProfileByAccountId } from '../../lib/profile'
import {
  identityParamSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  listMyInvitesQuerySchema,
  listReadersQuerySchema,
  listBlocksQuerySchema,
  profileFeedQuerySchema,
  profileSearchQuerySchema,
} from './schema'
import {
  getMyProfile,
  completeUserOnboarding,
  updateUserProfile,
  getPublicProfile,
  checkHandleAvailability,
  getMyInvites,
  getReaders,
  getReading,
  getUserReadersByIdentity,
  getUserReadingByIdentity,
  readProfile,
  unreadProfile,
  blockProfile,
  unblockProfile,
  getBlockedProfiles,
  getProfileFeed,
  searchProfiles,
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
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const query = c.req.valid('query')
    const result = await getBlockedProfiles(profile.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/readers',
  zValidator('query', listReadersQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const query = c.req.valid('query')
    const result = await getReaders(profile.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/reading',
  zValidator('query', listReadersQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const query = c.req.valid('query')
    const result = await getReading(profile.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get('/check/:identity', zValidator('param', identityParamSchema), async (c) => {
  const account = c.get('account')
  const { identity } = c.req.valid('param')
  const result = await checkHandleAvailability(identity, account.id)

  return c.json({
    success: true,
    ...result,
  })
})

profileRouter.post(
  '/:identity/read',
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const { identity } = c.req.valid('param')
    const result = await readProfile(profile.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.delete(
  '/:identity/read',
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const { identity } = c.req.valid('param')
    const result = await unreadProfile(profile.id, identity)

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
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const { identity } = c.req.valid('param')
    const result = await blockProfile(profile.id, identity)

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
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const { identity } = c.req.valid('param')
    const result = await unblockProfile(profile.id, identity)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/readers',
  zValidator('param', identityParamSchema),
  zValidator('query', listReadersQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserReadersByIdentity(identity, query, profile?.id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/:identity/reading',
  zValidator('param', identityParamSchema),
  zValidator('query', listReadersQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserReadingByIdentity(identity, query, profile?.id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/feed',
  onboardingMiddleware,
  zValidator('query', profileFeedQuerySchema),
  async (c) => {
    const profile = c.get('profile')
    const query = c.req.valid('query')
    const result = await getProfileFeed(profile.id, query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/search',
  onboardingMiddleware,
  zValidator('query', profileSearchQuerySchema),
  async (c) => {
    const profile = c.get('profile')
    const query = c.req.valid('query')
    const result = await searchProfiles(profile.id, query)

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
