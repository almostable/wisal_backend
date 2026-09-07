import { sql } from 'drizzle-orm'
import { Cron } from 'croner'
import { db } from '../db'

export interface RecalculateResult {
  success: boolean
  timestamp: string
}

export async function recalculateRegularReaders(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<RecalculateResult> {
  const nowIso = new Date().toISOString()

  // 1. Update authors who have active readers in the last 30 days
  await executor.execute(sql`
    WITH calculated_stats AS (
      SELECT author_profile_id, COUNT(*) AS active_count
      FROM readers
      WHERE last_read_at >= NOW() - INTERVAL '30 days'
      GROUP BY author_profile_id
    )
    UPDATE profiles p
    SET regular_readers_count = cs.active_count
    FROM calculated_stats cs
    WHERE p.id = cs.author_profile_id
      AND p.regular_readers_count != cs.active_count
  `)

  // 2. Reset regular_readers_count to 0 for authors with no active reads in the last 30 days
  await executor.execute(sql`
    UPDATE profiles
    SET regular_readers_count = 0
    WHERE regular_readers_count > 0
      AND id NOT IN (
        SELECT DISTINCT author_profile_id
        FROM readers
        WHERE last_read_at >= NOW() - INTERVAL '30 days'
      )
  `)

  return {
    success: true,
    timestamp: nowIso,
  }
}

export const recalculateRegularFollowers = recalculateRegularReaders

export function initRegularReadersCron(): Cron {
  // Run daily at 03:00 UTC
  const job = new Cron('0 3 * * *', { timezone: 'UTC' }, async () => {
    console.log(`[CRON] [${new Date().toISOString()}] Starting daily recalculation of regular readers...`)
    try {
      const result = await recalculateRegularReaders()
      console.log(`[CRON] [${result.timestamp}] Finished daily recalculation of regular readers successfully.`)
    } catch (error) {
      console.error(`[CRON] [${new Date().toISOString()}] Error during regular readers recalculation:`, error)
    }
  })

  return job
}

export const initRegularFollowersCron = initRegularReadersCron

if (import.meta.main) {
  console.log(`[CLI] Starting recalculation of regular readers...`)
  try {
    const result = await recalculateRegularReaders()
    console.log(`[CLI] Finished recalculation of regular readers at ${result.timestamp}.`)
    process.exit(0)
  } catch (error) {
    console.error(`[CLI] Error recalculating regular readers:`, error)
    process.exit(1)
  }
}
