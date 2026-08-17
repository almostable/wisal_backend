import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { validateAdminSessionToken, ADMIN_COOKIE_NAME } from '../lib/admin-session'
import { extractBearerToken } from './auth'
import type { Context } from 'hono'
import type { AdminSession } from '../db/schema/admin-sessions'
import type { SafeAdmin, AdminRole } from '../db/schema/admins'

export type AdminAuthVariables = {
  adminSession: AdminSession
  admin: SafeAdmin
}

export type OptionalAdminAuthVariables = {
  adminSession?: AdminSession
  admin?: SafeAdmin
}

declare module 'hono' {
  interface ContextVariableMap {
    admin: SafeAdmin
    adminSession: AdminSession
  }
}

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

export const adminAuthMiddleware = createMiddleware<{
  Variables: AdminAuthVariables
}>(async (c, next) => {
  const token = extractAdminToken(c)

  if (!token) {
    throw new HTTPException(401, { message: 'Missing admin session token' })
  }

  const result = await validateAdminSessionToken(token)

  if (!result) {
    throw new HTTPException(401, { message: 'Invalid or expired admin session token' })
  }

  c.set('adminSession', result.session)
  c.set('admin', result.admin)

  await next()
})

export function requireAdminRole(...allowedRoles: AdminRole[]) {
  return createMiddleware<{
    Variables: AdminAuthVariables
  }>(async (c, next) => {
    const admin = c.get('admin')

    if (!admin) {
      throw new HTTPException(401, { message: 'Admin authentication required' })
    }

    if (!allowedRoles.includes(admin.role)) {
      throw new HTTPException(403, { message: 'Insufficient permissions' })
    }

    await next()
  })
}

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
