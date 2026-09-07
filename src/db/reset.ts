import postgres from 'postgres'
import { env } from '../config/env'

async function runReset() {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    console.log('Resetting PostgreSQL public schema...')

    await client`DROP SCHEMA IF EXISTS public CASCADE;`
    await client`CREATE SCHEMA public;`
    await client`GRANT ALL ON SCHEMA public TO CURRENT_USER;`
    await client`GRANT ALL ON SCHEMA public TO public;`
    await client`CREATE EXTENSION IF NOT EXISTS pg_trgm;`

    console.log('Database schema successfully reset and pg_trgm extension enabled.')
  } catch (error) {
    console.error('Database reset failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runReset()

