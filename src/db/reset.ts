import { drizzle } from 'drizzle-orm/postgres-js'
import { reset } from 'drizzle-seed'
import * as schema from './schema'

async function runReset() {
  const db = drizzle(process.env.DATABASE_URL!);
  await reset(db, schema);
}

runReset()
