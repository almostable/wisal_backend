import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { validateAdminSessionToken, ADMIN_COOKIE_NAME } from '../lib/admin-session'
import { extractBearerToken } from './auth'
import type { Context } from 'hono'
import type { AdminSession } from '../db/schema/admin-sessions'
import type { SafeAdmin, AdminRole } from '../db/schema/admins'

/**
 * Variables injected into Hono context by admin authentication middlewares
 */
export type AdminAuthVariables = {
  adminSession: AdminSession
  admin: SafeAdmin
}

export type OptionalAdminAuthVariables = {
  adminSession?: AdminSession
  admin?: SafeAdmin
}

// Augment Hono ContextVariableMap for global type-safety across admin routes
declare module 'hono' {
  interface ContextVariableMap {
    admin: SafeAdmin
    adminSession: AdminSession
  }
}

/**
 * Extracts admin session token from Authorization header (Bearer) or HTTP-only cookie
 */
export function extractAdminToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  const bearerToken = extractBearerToken(authHeader)
  if (bearerToken) return bearerToken

  const cookieToken = getCookie(c, ADMIN_COOKIE_NAME)
  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim()
  }

  return null
}

/**
 * Strict admin authentication middleware.
 * Verifies admin session token from Authorization header or HTTP-only cookie.
 * Injects adminSession + safe admin into context.
 * Returns 401 Unauthorized if token is missing, invalid or expired.
 */
export const adminAuthMiddleware = createMiddleware<{
  Variables: AdminAuthVariables
}>(async (c, next) => {
  const token = extractAdminToken(c)

  if (!token) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing admin session token (Authorization header or cookie required)',
      },
      401
    )
  }

  const result = await validateAdminSessionToken(token)

  if (!result) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired admin session token',
      },
      401
    )
  }

  c.set('adminSession', result.session)
  c.set('admin', result.admin)

  await next()
})

/**
 * Role-based authorization middleware for admins.
 * Verifies that the authenticated admin possesses one of the required roles (e.g. 'admin', 'moderator').
 * Must be mounted after `adminAuthMiddleware`.
 * Returns 403 Forbidden if the admin's role is not permitted.
 */
export function requireAdminRole(...allowedRoles: AdminRole[]) {
  return createMiddleware<{
    Variables: AdminAuthVariables
  }>(async (c, next) => {
    const admin = c.get('admin')

    if (!admin) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Admin authentication required',
        },
        401
      )
    }

    if (!allowedRoles.includes(admin.role)) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Insufficient permissions for this resource',
        },
        403
      )
    }

    await next()
  })
}

/**
 * Optional admin authentication middleware.
 * If a valid admin token is provided (via header or cookie), injects adminSession and admin into context.
 * If token is missing or invalid, proceeds without throwing 401.
 */
export const optionalAdminAuthMiddleware = createMiddleware<{
  Variables: OptionalAdminAuthVariables
}>(async (c, next) => {
  const token = extractAdminToken(c)

  if (token) {
    const result = await validateAdminSessionToken(token)
    if (result) {
      c.set('adminSession', result.session)
      c.set('admin', result.admin)
    }
  }

  await next()
})
