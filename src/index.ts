import './lib/snowflake'
import { Hono } from 'hono'
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

app.use('*', secureHeaders())   // CSP, X-Frame-Options, HSTS etc. — sensible defaults
// app.use('*', cors({ origin: 'https://yourapp.com', credentials: true }))
app.use('*', logger())
app.use('*', compress())
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))
app.use('*', timeout(10000))

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

// Feature routes
app.route('/admin', adminRouter)

export { app }

export default {
  port: env.PORT,
  fetch: app.fetch,
}
