import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { env } from '../../config/env'
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_DAYS } from '../../lib/admin-session'
import { stringToSnowflake } from '../../lib/snowflake'
import { adminAuthMiddleware, requireAdminRole } from '../../middleware/admin'
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

adminRouter.post('/login', zValidator('json', loginInputSchema), async (c) => {
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
    const targetAdminId = stringToSnowflake(id)

    await deleteAdmin(targetAdminId, currentAdmin.id)

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
    const inviteId = stringToSnowflake(id)

    await deleteInvite(inviteId)

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
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const accountId = stringToSnowflake(id)
    const user = await getUserById(accountId)

    return c.json({
      success: true,
      user,
    })
  }
)

adminRouter.patch(
  '/users/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', adminUpdateUserProfileSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const accountId = stringToSnowflake(id)
    const user = await updateUserProfileByAdmin(accountId, data)

    return c.json({
      success: true,
      user,
    })
  }
)

adminRouter.post(
  '/users/:id/ban',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', banUserInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const accountId = stringToSnowflake(id)
    const result = await banUserAccount(admin, accountId, data)

    return c.json(result)
  }
)

adminRouter.post(
  '/users/:id/unban',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', unbanUserInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')
    const accountId = stringToSnowflake(id)
    const result = await unbanUserAccount(admin, accountId, data)

    return c.json(result)
  }
)

adminRouter.delete(
  '/users/:id/sessions',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const accountId = stringToSnowflake(id)
    const result = await revokeUserSessions(accountId)

    return c.json(result)
  }
)

// ---------------------------------------------------------
// Posts Moderation
// ---------------------------------------------------------

adminRouter.get(
  '/posts',
  adminAuthMiddleware,
  zValidator('query', listPostsAdminQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listPostsByAdmin({
      ...query,
      authorId: query.authorId ? stringToSnowflake(query.authorId) : undefined,
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
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const postId = stringToSnowflake(id)
    const post = await getPostByIdByAdmin(postId)

    return c.json({
      success: true,
      post,
    })
  }
)

adminRouter.delete(
  '/posts/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const postId = stringToSnowflake(id)
    const result = await deletePostByAdmin(postId)

    return c.json(result)
  }
)

adminRouter.post(
  '/posts/:id/restore',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const postId = stringToSnowflake(id)
    const result = await restorePostByAdmin(postId)

    return c.json(result)
  }
)

adminRouter.patch(
  '/posts/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  zValidator('json', updatePostByAdminSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const postId = stringToSnowflake(id)
    const data = c.req.valid('json')
    const post = await updatePostByAdmin(postId, data)

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
  zValidator('query', listCommentsAdminQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listCommentsByAdmin({
      ...query,
      postId: query.postId ? stringToSnowflake(query.postId) : undefined,
      authorId: query.authorId ? stringToSnowflake(query.authorId) : undefined,
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
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const postId = stringToSnowflake(id)
    const commentsList = await getPostCommentsByAdmin(postId)

    return c.json({
      success: true,
      comments: commentsList,
    })
  }
)

adminRouter.delete(
  '/comments/:id',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const commentId = stringToSnowflake(id)
    const result = await deleteCommentByAdmin(commentId)

    return c.json(result)
  }
)

adminRouter.post(
  '/comments/:id/restore',
  adminAuthMiddleware,
  zValidator('param', snowflakeParamSchema),
  async (c) => {
    const { id } = c.req.valid('param')
    const commentId = stringToSnowflake(id)
    const result = await restoreCommentByAdmin(commentId)

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
    const reportId = stringToSnowflake(id)

    const report = await getReportById(reportId)

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
    const reportId = stringToSnowflake(id)

    const report = await updateReportResolution(admin, reportId, data)

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
    const reportId = stringToSnowflake(id)

    const report = await resolveReportWithAction(admin, reportId, data)

    return c.json({
      success: true,
      report,
    })
  }
)
