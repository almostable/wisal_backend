import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import {
  postIdParamSchema,
  commentIdParamSchema,
  userPostsParamSchema,
  createPostSchema,
  updatePostSchema,
  pinPostSchema,
  feedQuerySchema,
  userPostsQuerySchema,
  createCommentSchema,
  replyCommentSchema,
  listCommentsQuerySchema,
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
  getPostComments,
  createComment,
  replyToComment,
  deleteComment,
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

postsRouter.post(
  '/comments/:id/reply',
  zValidator('param', commentIdParamSchema),
  zValidator('json', replyCommentSchema),
  async (c) => {
    const account = c.get('account')
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const comment = await replyToComment(
      BigInt(id),
      account.id,
      { accountId: account.id, isMale: profile.isMale! },
      data
    )

    return c.json(
      {
        success: true,
        comment,
      },
      201
    )
  }
)

postsRouter.delete(
  '/comments/:id',
  zValidator('param', commentIdParamSchema),
  async (c) => {
    const account = c.get('account')
    const { id } = c.req.valid('param')

    const result = await deleteComment(account.id, BigInt(id))

    return c.json(result)
  }
)

postsRouter.get(
  '/:id/comments',
  zValidator('param', postIdParamSchema),
  zValidator('query', listCommentsQuerySchema),
  async (c) => {
    const account = c.get('account')
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const query = c.req.valid('query')

    const result = await getPostComments(
      BigInt(id),
      { accountId: account.id, isMale: profile.isMale! },
      query
    )

    return c.json({
      success: true,
      ...result,
    })
  }
)

postsRouter.post(
  '/:id/comments',
  zValidator('param', postIdParamSchema),
  zValidator('json', createCommentSchema),
  async (c) => {
    const account = c.get('account')
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const comment = await createComment(
      BigInt(id),
      account.id,
      { accountId: account.id, isMale: profile.isMale! },
      {
        content: data.content,
        parentId: data.parentId ? BigInt(data.parentId) : null,
        type: data.type,
        payload: data.payload,
      }
    )

    return c.json(
      {
        success: true,
        comment,
      },
      201
    )
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

  return c.json(result)
})
