import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'
import * as schema from './schema'

export const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 20 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, {
  schema,
  logger: env.NODE_ENV === 'development',
})

export type Database = typeof db
export * from './schema'
