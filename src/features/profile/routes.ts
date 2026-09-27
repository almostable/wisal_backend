import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import { getProfileByAccountId } from '../../lib/profile'
import {
  identityParamSchema,
  authorParamSchema,
  markAuthorReadSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  listMyInvitesQuerySchema,
  listReadersQuerySchema,
  listAuthorsQuerySchema,
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
  getSubscribedAuthors,
  markAuthorPostsRead,
  getUserReadersByIdentity,
  getUserSubscribedAuthorsByIdentity,
  readProfile,
  unreadProfile,
  blockProfile,
  unblockProfile,
  getBlockedProfiles,
  getProfileFeed,
  searchProfiles,
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
  '/blocks',
  authMiddleware,
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
  authMiddleware,
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
  '/authors',
  authMiddleware,
  zValidator('query', listAuthorsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const query = c.req.valid('query')
    const result = await getSubscribedAuthors(
      { profileId: profile.id, isMale: profile.isMale },
      query
    )

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get('/check/:identity', authMiddleware, zValidator('param', identityParamSchema), async (c) => {
  const account = c.get('account')
  const { identity } = c.req.valid('param')
  const result = await checkHandleAvailability(identity, account.id)

  return c.json({
    success: true,
    ...result,
  })
})

profileRouter.post(
  '/:author_id/read',
  authMiddleware,
  onboardingMiddleware,
  zValidator('param', authorParamSchema),
  async (c) => {
    const profile = c.get('profile')
    const { author_id } = c.req.valid('param')
    const result = await readProfile(profile.id, author_id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.post(
  '/:author_id/read-marker',
  authMiddleware,
  onboardingMiddleware,
  zValidator('param', authorParamSchema),
  zValidator('json', markAuthorReadSchema),
  async (c) => {
    const profile = c.get('profile')
    const { author_id } = c.req.valid('param')
    const { lastPostId } = c.req.valid('json')
    const result = await markAuthorPostsRead(profile.id, author_id, lastPostId)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.delete(
  '/:author_id/read',
  authMiddleware,
  onboardingMiddleware,
  zValidator('param', authorParamSchema),
  async (c) => {
    const profile = c.get('profile')
    const { author_id } = c.req.valid('param')
    const result = await unreadProfile(profile.id, author_id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.post(
  '/:identity/block',
  authMiddleware,
  onboardingMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const profile = c.get('profile')
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
  authMiddleware,
  onboardingMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const profile = c.get('profile')
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
  authMiddleware,
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
  '/:identity/authors',
  authMiddleware,
  zValidator('param', identityParamSchema),
  zValidator('query', listAuthorsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')
    const result = await getUserSubscribedAuthorsByIdentity(identity, query, profile?.id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.get(
  '/feed',
  authMiddleware,
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
  authMiddleware,
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
  optionalAuthMiddleware,
  zValidator('param', identityParamSchema),
  async (c) => {
    const account = c.get('account')
    const { identity } = c.req.valid('param')
    const profile = await getPublicProfile(identity, account?.id)

    return c.json({
      success: true,
      profile,
    })
  }
)
