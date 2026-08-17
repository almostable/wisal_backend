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
import { db } from './db'
import { env } from './config/env'
import { adminRouter } from './features/admin'

const app = new Hono()

app.use('*', secureHeaders())
app.use('*', cors({ origin: 'http://localhost:5173', credentials: true }))
app.use('*', logger())
app.use('*', compress())
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
app.use('*', timeout(10000))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  console.error('Unhandled server error:', err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

app.get('/db-health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`)
    return c.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return c.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown database error',
        timestamp: new Date().toISOString(),
      },
      503
    )
  }
})

app.route('/admin', adminRouter)

export { app }

export default {
  port: env.PORT,
  fetch: app.fetch,
}
