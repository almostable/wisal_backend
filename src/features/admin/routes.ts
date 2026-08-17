import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { env } from '../../config/env'
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_DAYS } from '../../lib/admin-session'
import { adminAuthMiddleware } from '../../middleware/admin'
import {
  loginInputSchema,
  createInviteInputSchema,
  paginationQuerySchema,
} from './schema'
import {
  loginAdmin,
  logoutAdmin,
  createInvite,
  listInvites,
  listUsers,
  AdminServiceError,
} from './service'

export const adminRouter = new Hono()

/**
 * 1. POST /admin/login - Login to admin panel, creates session and sets HTTP-only cookie
 */
adminRouter.post('/login', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'INVALID_JSON', message: 'Request body must be valid JSON' }, 400)
  }

  const parsed = loginInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Invalid login parameters',
        details: parsed.error.format(),
      },
      400
    )
  }

  try {
    const result = await loginAdmin(parsed.data)

    // Set HTTP-only secure cookie
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
  } catch (error) {
    if (error instanceof AdminServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status as any)
    }
    console.error('Unexpected admin login error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred during login' }, 500)
  }
})

/**
 * 2. POST /admin/logout - Invalidate session in DB and clear HTTP-only cookie
 */
adminRouter.post('/logout', adminAuthMiddleware, async (c) => {
  const session = c.get('adminSession')

  try {
    if (session) {
      await logoutAdmin(session.id)
    }

    // Clear cookie
    deleteCookie(c, ADMIN_COOKIE_NAME, {
      path: '/',
    })

    return c.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error) {
    console.error('Admin logout error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to complete logout' }, 500)
  }
})

/**
 * 3. POST /admin/invites - Create a new invite code
 */
adminRouter.post('/invites', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin')

  let body: unknown = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const parsed = createInviteInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Invalid invite parameters',
        details: parsed.error.format(),
      },
      400
    )
  }

  try {
    const invite = await createInvite(admin.id, parsed.data)

    return c.json(
      {
        success: true,
        invite,
      },
      201
    )
  } catch (error) {
    if (error instanceof AdminServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status as any)
    }
    console.error('Unexpected create invite error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to create invite' }, 500)
  }
})

/**
 * 4. GET /admin/invites - Retrieve paginated list of all invites
 */
adminRouter.get('/invites', adminAuthMiddleware, async (c) => {
  const query = c.req.query()
  const parsed = paginationQuerySchema.safeParse(query)

  if (!parsed.success) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Invalid pagination query parameters',
      },
      400
    )
  }

  try {
    const result = await listInvites(parsed.data)
    return c.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Unexpected list invites error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to list invites' }, 500)
  }
})

/**
 * 5. GET /admin/users - Retrieve paginated list of users (Account + Profile + Identity)
 */
adminRouter.get('/users', adminAuthMiddleware, async (c) => {
  const query = c.req.query()
  const parsed = paginationQuerySchema.safeParse(query)

  if (!parsed.success) {
    return c.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'Invalid pagination query parameters',
      },
      400
    )
  }

  try {
    const result = await listUsers(parsed.data)
    return c.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('Unexpected list users error:', error)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to list users' }, 500)
  }
})
