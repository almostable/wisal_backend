import { drizzle } from 'drizzle-orm/postgres-js'
import { reset } from 'drizzle-seed'
import postgres from 'postgres'
import * as schema from './schema'

async function runReset() {
  const client = postgres(process.env.DATABASE_URL!)
  const db = drizzle(client)

  try {
    await reset(db, schema)
    console.log('Database successfully reset')
  } catch (error) {
    console.error('Database reset error:', error)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

runReset()
