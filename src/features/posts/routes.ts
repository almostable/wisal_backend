import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth'
import { onboardingMiddleware } from '../../middleware/onboarding'
import {
  postIdParamSchema,
  commentIdParamSchema,
  userPostsParamSchema,
  createPostSchema,
  updatePostSchema,
  pinPostSchema,
  userPostsQuerySchema,
  savedPostsQuerySchema,
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
  recordViewsSchema,
  feedQuerySchema,
} from './schema'
import {
  createPost,
  updatePost,
  deletePost,
  pinPost,
  getPostById,
  getUserPosts,
  getSavedPosts,
  savePost,
  unsavePost,
  likePost,
  unlikePost,
  getPostComments,
  createComment,
  updateComment,
  deleteComment,
  recordPostViews,
  getFeedPosts,
} from './service'

export const postsRouter = new Hono()

const auth = [authMiddleware, onboardingMiddleware] as const

export const feedRouter = new Hono()

feedRouter.get('/', ...auth, zValidator('query', feedQuerySchema), async (c) => {
  const profile = c.get('profile')
  const query = c.req.valid('query')

  const result = await getFeedPosts(
    { profileId: profile.id, isMale: profile.isMale! },
    query
  )

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.post('/', ...auth, zValidator('json', createPostSchema), async (c) => {
  const profile = c.get('profile')
  const data = c.req.valid('json')

  const post = await createPost(profile.id, profile.isMale!, data)

  return c.json(
    {
      success: true,
      post,
    },
    201
  )
})

postsRouter.post('/views', ...auth, zValidator('json', recordViewsSchema), async (c) => {
  const profile = c.get('profile')
  const { postIds } = c.req.valid('json')
  const result = await recordPostViews(
    { profileId: profile.id, isMale: profile.isMale! },
    postIds.map((id) => BigInt(id))
  )

  return c.json(result)
})

postsRouter.get(
  '/user/:identity',
  ...auth,
  zValidator('param', userPostsParamSchema),
  zValidator('query', userPostsQuerySchema),
  async (c) => {
    const profile = c.get('profile')
    const { identity } = c.req.valid('param')
    const query = c.req.valid('query')

    const result = await getUserPosts(
      identity,
      { profileId: profile.id, isMale: profile.isMale! },
      query
    )

    return c.json({
      success: true,
      ...result,
    })
  }
)

postsRouter.get('/saves', ...auth, zValidator('query', savedPostsQuerySchema), async (c) => {
  const profile = c.get('profile')
  const query = c.req.valid('query')

  const result = await getSavedPosts(
    { profileId: profile.id, isMale: profile.isMale! },
    query
  )

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.patch(
  '/comments/:id',
  ...auth,
  zValidator('param', commentIdParamSchema),
  zValidator('json', updateCommentSchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const comment = await updateComment(profile.id, id, data)

    return c.json({
      success: true,
      comment,
    })
  }
)

postsRouter.delete(
  '/comments/:id',
  ...auth,
  zValidator('param', commentIdParamSchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')

    const result = await deleteComment(profile.id, id)

    return c.json(result)
  }
)

postsRouter.get(
  '/:id/comments',
  ...auth,
  zValidator('param', postIdParamSchema),
  zValidator('query', listCommentsQuerySchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const query = c.req.valid('query')

    const result = await getPostComments(
      id,
      { profileId: profile.id, isMale: profile.isMale! },
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
  ...auth,
  zValidator('param', postIdParamSchema),
  zValidator('json', createCommentSchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const comment = await createComment(
      id,
      profile.id,
      { profileId: profile.id, isMale: profile.isMale! },
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

postsRouter.get('/:id', optionalAuthMiddleware, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const post = await getPostById(
    id,
    profile ? { profileId: profile.id, isMale: profile.isMale! } : undefined
  )

  return c.json({
    success: true,
    post,
  })
})

postsRouter.patch(
  '/:id/pin',
  ...auth,
  zValidator('param', postIdParamSchema),
  zValidator('json', pinPostSchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const post = await pinPost(profile.id, id, data)

    return c.json({
      success: true,
      post,
    })
  }
)

postsRouter.patch(
  '/:id',
  ...auth,
  zValidator('param', postIdParamSchema),
  zValidator('json', updatePostSchema),
  async (c) => {
    const profile = c.get('profile')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const post = await updatePost(profile.id, id, data)

    return c.json({
      success: true,
      post,
    })
  }
)

postsRouter.post('/:id/save', ...auth, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await savePost(id, {
    profileId: profile.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.post('/:id/unsave', ...auth, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await unsavePost(id, {
    profileId: profile.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.post('/:id/like', ...auth, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await likePost(id, {
    profileId: profile.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.post('/:id/unlike', ...auth, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await unlikePost(id, {
    profileId: profile.id,
    isMale: profile.isMale!,
  })

  return c.json({
    success: true,
    ...result,
  })
})

postsRouter.delete('/:id', ...auth, zValidator('param', postIdParamSchema), async (c) => {
  const profile = c.get('profile')
  const { id } = c.req.valid('param')

  const result = await deletePost(profile.id, id)

  return c.json(result)
})
