import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import {
  postIdParamSchema,
  userPostsParamSchema,
  createPostSchema,
  updatePostSchema,
  pinPostSchema,
  feedQuerySchema,
  userPostsQuerySchema,
} from './schema'
import {
  createPost,
  updatePost,
  deletePost,
  pinPost,
  getPostById,
  getFeed,
  getUserPosts,
  likePost,
  unlikePost,
} from './service'

export const postsRouter = new Hono()

postsRouter.use('*', authMiddleware, onboardingMiddleware)

postsRouter.post('/', zValidator('json', createPostSchema), async (c) => {
  const account = c.get('account')
  const profile = c.get('profile')
  const data = c.req.valid('json')

  const post = await createPost(account.id, profile.isMale!, data)

  return c.json(
    {
      success: true,
      post,
    },
    201
  )
})

postsRouter.get('/feed', zValidator('query', feedQuerySchema), async (c) => {
  const account = c.get('account')
  const profile = c.get('profile')
  const query = c.req.valid('query')

  const result = await getFeed(
    { accountId: account.id, isMale: profile.isMale! },
    query
  )

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.get(
  '/user/:identity',
  zValidator('param', userPostsParamSchema),
  zValidator('query', userPostsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = c.get('profile')
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')

    const result = await getUserPosts(
      identity,
      { accountId: account.id, isMale: profile.isMale! },
      query
    )

    return c.json({
      success: true,
      ...result,
    })
  }
)

postsRouter.get('/:id', zValidator('param', postIdParamSchema), async (c) => {
  const account = c.get('account')
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const post = await getPostById(BigInt(id), {
    accountId: account.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    post,
  })
})

postsRouter.patch(
  '/:id/pin',
  zValidator('param', postIdParamSchema),
  zValidator('json', pinPostSchema),
  async (c) => {
    const account = c.get('account')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const post = await pinPost(account.id, BigInt(id), data)

    return c.json({
      success: true,
      post,
    })
  }
)

postsRouter.patch(
  '/:id',
  zValidator('param', postIdParamSchema),
  zValidator('json', updatePostSchema),
  async (c) => {
    const account = c.get('account')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const post = await updatePost(account.id, BigInt(id), data)

    return c.json({
      success: true,
      post,
    })
  }
)

postsRouter.post('/:id/like', zValidator('param', postIdParamSchema), async (c) => {
  const account = c.get('account')
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await likePost(BigInt(id), {
    accountId: account.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.post('/:id/unlike', zValidator('param', postIdParamSchema), async (c) => {
  const account = c.get('account')
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await unlikePost(BigInt(id), {
    accountId: account.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.delete('/:id', zValidator('param', postIdParamSchema), async (c) => {
  const account = c.get('account')
  const { id } = c.req.valid('param')

  const result = await deletePost(account.id, BigInt(id))

  return c.json({
    success: true,
    ...result,
  })
})

