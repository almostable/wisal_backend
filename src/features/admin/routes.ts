import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { env } from '../../config/env'
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_DAYS } from '../../lib/admin-session'
import { stringToSnowflake } from '../../lib/snowflake'
import { adminAuthMiddleware } from '../../middleware/admin'
import {
  loginInputSchema,
  createAdminInputSchema,
  createInviteInputSchema,
  paginationQuerySchema,
  snowflakeParamSchema,
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

adminRouter.get(
  '/admins',
  adminAuthMiddleware,
  zValidator('query', paginationQuerySchema),
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

adminRouter.post(
  '/invites',
  adminAuthMiddleware,
  zValidator('json', createInviteInputSchema),
  async (c) => {
    const admin = c.get('admin')
    const data = c.req.valid('json')
    const invite = await createInvite(admin.id, data)

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
  zValidator('query', paginationQuerySchema),
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

adminRouter.get(
  '/users',
  adminAuthMiddleware,
  zValidator('query', paginationQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const result = await listUsers(query)

    return c.json({
      success: true,
      ...result,
    })
  }
)
