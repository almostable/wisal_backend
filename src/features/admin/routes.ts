import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { env } from '../../config/env'
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_DAYS } from '../../lib/admin-session'
import { adminAuthMiddleware, requireAdminRole } from '../../middleware/admin'
import { adminLoginRateLimiter } from '../../middleware/rate-limiter'
import {
  loginInputSchema,
  createAdminInputSchema,
  createInviteInputSchema,
  listAdminsQuerySchema,
  listUsersQuerySchema,
  listInvitesQuerySchema,
  listReportsQuerySchema,
  updateReportResolutionSchema,
  snowflakeParamSchema,
  adminUpdateUserProfileSchema,
  banUserInputSchema,
  unbanUserInputSchema,
  listPostsAdminQuerySchema,
  updatePostByAdminSchema,
  listCommentsAdminQuerySchema,
  resolveReportActionSchema,
} from './schema'
import {
  loginAdmin,
  logoutAdmin,
  listAdmins,
  createAdmin,
  deleteAdmin,
  createInvite,
  deleteInvite,
  listInvites,
  listUsers,
  getUserById,
  updateUserProfileByAdmin,
  banUserAccount,
  unbanUserAccount,
  revokeUserSessions,
  listPostsByAdmin,
  getPostByIdByAdmin,
  deletePostByAdmin,
  restorePostByAdmin,
  updatePostByAdmin,
  listCommentsByAdmin,
  getPostCommentsByAdmin,
  deleteCommentByAdmin,
  restoreCommentByAdmin,
  listReports,
  getReportById,
  updateReportResolution,
  resolveReportWithAction,
} from './service'

export const adminRouter = new Hono()

adminRouter.post('/login', adminLoginRateLimiter, zValidator('json', loginInputSchema), async (c) => {
  const data = c.req.valid('json')
  const result = await loginAdmin(data)

  setCookie(c, ADMIN_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60,
  })

  return c.json({
    success: true,
    admin: result.admin,
    token: result.token,
  })
})

adminRouter.post('/logout', adminAuthMiddleware, async (c) => {
  const session = c.get('adminSession')

  if (session) {
    await logoutAdmin(session.id)
  }

  deleteCookie(c, ADMIN_COOKIE_NAME, {
    path: '/',
  })

  return c.json({
    success: true,
    message: 'Logged out successfully',
  })
})

adminRouter.get('/me', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin')
  return c.json({
    success: true,
    admin,
  })
})

// ---------------------------------------------------------
// Admins Management
// ---------------------------------------------------------

adminRouter.get(
  '/admins',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('query', listAdminsQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listAdmins(query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.post(
  '/admins',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('json', createAdminInputSchema),
  async (c) => {
    const data = c.req.valid('json')
    const admin = await createAdmin(data)

    return c.json(
      {
        success: true,
        admin,
      },
      201
    )
  }
)

adminRouter.delete(
  '/admins/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const currentAdmin = c.get('admin')
    const { id } = c.req.valid('param')

    await deleteAdmin(id, currentAdmin.id)

    return c.json({
      success: true,
      message: 'Admin deleted successfully',
    })
  }
)

// ---------------------------------------------------------
// Invites Management
// ---------------------------------------------------------

adminRouter.post(
  '/invites',
  adminAuthMiddleware,
  zValidator('json', createInviteInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const data = c.req.valid('json')
    const invite = await createInvite(admin, data)

    return c.json(
      {
        success: true,
        invite,
      },
      201
    )
  }
)

adminRouter.get(
  '/invites',
  adminAuthMiddleware,
  zValidator('query', listInvitesQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listInvites(query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.delete(
  '/invites/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')

    await deleteInvite(id)

    return c.json({
      success: true,
      message: 'Invite deleted successfully',
    })
  }
)

// ---------------------------------------------------------
// Users Management & Moderation
// ---------------------------------------------------------

adminRouter.get(
  '/users',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('query', listUsersQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listUsers(query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.get(
  '/users/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const user = await getUserById(id)

    return c.json({
      success: true,
      user,
    })
  }
)

adminRouter.patch(
  '/users/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  zValidator('json', adminUpdateUserProfileSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const user = await updateUserProfileByAdmin(id, data)

    return c.json({
      success: true,
      user,
    })
  }
)

adminRouter.post(
  '/users/:id/ban',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  zValidator('json', banUserInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const result = await banUserAccount(admin, id, data)

    return c.json(result)
  }
)

adminRouter.post(
  '/users/:id/unban',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  zValidator('json', unbanUserInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const result = await unbanUserAccount(admin, id, data)

    return c.json(result)
  }
)

adminRouter.delete(
  '/users/:id/sessions',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const result = await revokeUserSessions(id)

    return c.json(result)
  }
)

// ---------------------------------------------------------
// Posts Moderation
// ---------------------------------------------------------

adminRouter.get(
  '/posts',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('query', listPostsAdminQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listPostsByAdmin({
      ...query,
      authorId: query.authorId ? BigInt(query.authorId) : undefined,
    })

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.get(
  '/posts/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const post = await getPostByIdByAdmin(id)

    return c.json({
      success: true,
      post,
    })
  }
)

adminRouter.delete(
  '/posts/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const result = await deletePostByAdmin(id)

    return c.json(result)
  }
)

adminRouter.post(
  '/posts/:id/restore',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const result = await restorePostByAdmin(id)

    return c.json(result)
  }
)

adminRouter.patch(
  '/posts/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  zValidator('json', updatePostByAdminSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const post = await updatePostByAdmin(id, data)

    return c.json({
      success: true,
      post,
    })
  }
)

// ---------------------------------------------------------
// Comments Moderation
// ---------------------------------------------------------

adminRouter.get(
  '/comments',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('query', listCommentsAdminQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listCommentsByAdmin({
      ...query,
      postId: query.postId ? BigInt(query.postId) : undefined,
      authorId: query.authorId ? BigInt(query.authorId) : undefined,
    })

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.get(
  '/posts/:id/comments',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const commentsList = await getPostCommentsByAdmin(id)

    return c.json({
      success: true,
      comments: commentsList,
    })
  }
)

adminRouter.delete(
  '/comments/:id',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const result = await deleteCommentByAdmin(id)

    return c.json(result)
  }
)

adminRouter.post(
  '/comments/:id/restore',
  adminAuthMiddleware,
  requireAdminRole('admin'),
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const result = await restoreCommentByAdmin(id)

    return c.json(result)
  }
)

// ---------------------------------------------------------
// Reports Moderation & Actions
// ---------------------------------------------------------

adminRouter.get(
  '/reports',
  adminAuthMiddleware,
  zValidator('query', listReportsQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listReports(query)

    return c.json({
      success: true,
      ...result,
    })
  }
)

adminRouter.get(
  '/reports/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')

    const report = await getReportById(id)

    return c.json({
      success: true,
      report,
    })
  }
)

adminRouter.patch(
  '/reports/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', updateReportResolutionSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const report = await updateReportResolution(admin, id, data)

    return c.json({
      success: true,
      report,
    })
  }
)

adminRouter.post(
  '/reports/:id/action',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', resolveReportActionSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const report = await resolveReportWithAction(admin, id, data)

    return c.json({
      success: true,
      report,
    })
  }
)
