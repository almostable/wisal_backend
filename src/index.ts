import './lib/sentry'
import './lib/snowflake'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { compress } from 'hono/compress'
import { bodyLimit } from 'hono/body-limit'
import { timeout } from 'hono/timeout'
import { sql } from 'drizzle-orm'
import { db, client } from './db'
import { env } from './config/env'
import { ERROR_CODES } from './config/error-codes'
import { captureAppException } from './lib/sentry'
import { adminRouter } from './features/admin'
import { authRouter } from './features/auth'
import { profileRouter } from './features/profile'
import { postsRouter, feedRouter } from './features/posts'
import { reportsRouter } from './features/reports'
import { uploadsRouter } from './features/uploads'
import { notificationsRouter } from './features/notifications'
import { inviteApplicationsRouter } from './features/invite-applications'
import { initMediaGcCron } from './jobs/media-gc'
import type { Cron } from 'croner'

let mediaGcCron: Cron | null = null

if (env.NODE_ENV !== 'test') {
  mediaGcCron = initMediaGcCron()
}

// Graceful Shutdown
let isShuttingDown = false

export function setShuttingDownForTest(state: boolean) {
  isShuttingDown = state
}

async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n[SHUTDOWN] Received ${signal}. Starting graceful shutdown...`)

  if (mediaGcCron) {
    mediaGcCron.stop()
  }

  await new Promise((resolve) => setTimeout(resolve, 1500))

  try {
    await client.end({ timeout: 5 })
    console.log('[SHUTDOWN] Database connection pool drained.')
  } catch (err) {
    console.error('[SHUTDOWN] Error closing database pool:', err)
  }

  console.log('[SHUTDOWN] Graceful shutdown completed. Exiting.')
  process.exit(0)
}

if (env.NODE_ENV !== 'test') {
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

const app = new Hono()

app.use('*', secureHeaders())
app.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use('*', logger())
app.use('*', compress())
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
app.use('*', timeout(10000))
app.use('*', async (c, next) => {
  if (isShuttingDown) {
    c.header('Connection', 'close')
    return c.json(
      { error: 'Service is shutting down', code: ERROR_CODES.SERVICE_UNAVAILABLE },
      503
    )
  }
  await next()
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  if (err instanceof SyntaxError) {
    return c.json(
      { error: 'Malformed JSON payload', code: ERROR_CODES.MALFORMED_JSON },
      400
    )
  }

  const pgError = (err as any)?.cause ?? err
  if (pgError && typeof pgError === 'object') {
    if (pgError.code === '22003' || pgError.code === '22P02') {
      return c.json(
        { error: 'Invalid parameter format', code: ERROR_CODES.INVALID_PARAMETER_FORMAT },
        400
      )
    }
    if (pgError.code === '23505') {
      const constraint = String(pgError.constraint ?? '')
      if (constraint.includes('accounts_email')) {
        return c.json({ error: 'Email is already registered' }, 409)
      }
      if (constraint.includes('identities_identity')) {
        return c.json({ error: 'Identity handle is already taken' }, 409)
      }
      if (constraint.includes('posts_author_pinned')) {
        return c.json({ error: 'Another post is already pinned' }, 409)
      }
      return c.json({ error: 'Conflict: A resource with this identifier already exists' }, 409)
    }
  }

  captureAppException(err, c)
  console.error('Unhandled server error:', err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

if (env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', () => {
    throw new Error('Sentry debug test error')
  })

  app.get('/api/debug-sentry', () => {
    throw new Error('Sentry debug test error')
  })
}

app.get('/db-health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`)
    return c.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    captureAppException(error, c)
    return c.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      },
      503
    )
  }
})

app.route('/admin', adminRouter)
app.route('/auth', authRouter)
app.route('/profile', profileRouter)
app.route('/posts', postsRouter)
app.route('/feed', feedRouter)
app.route('/reports', reportsRouter)
app.route('/uploads', uploadsRouter)
app.route('/notifications', notificationsRouter)
app.route('/invite-applications', inviteApplicationsRouter)

export { app }

export default {
  port: env.PORT,
  fetch: app.fetch,
}
