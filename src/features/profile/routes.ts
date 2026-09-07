import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
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
  '/authors',
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
  '/:author_id/read',
  zValidator('param', authorParamSchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
    const { author_id } = c.req.valid('param')

    let body: any = null
    const contentType = c.req.header('content-type')
    if (contentType?.includes('application/json')) {
      try {
        body = await c.req.json()
      } catch {
        // empty or malformed JSON
      }
    }

    if (body && (body.last_post_id !== undefined || body.lastPostId !== undefined)) {
      const parsed = markAuthorReadSchema.safeParse(body)
      if (!parsed.success) {
        throw new HTTPException(400, {
          message: parsed.error.issues[0]?.message ?? 'Invalid last_post_id',
        })
      }
      const result = await markAuthorPostsRead(profile.id, author_id, parsed.data.lastPostId)
      return c.json({
        success: true,
        ...result,
      })
    }

    const result = await readProfile(profile.id, author_id)

    return c.json({
      success: true,
      ...result,
    })
  }
)

profileRouter.delete(
  '/:author_id/read',
  zValidator('param', authorParamSchema),
  async (c) => {
    const account = c.get('account')
    const profile = await getProfileByAccountId(account.id)
    if (!profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }
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
