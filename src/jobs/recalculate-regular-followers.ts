import { sql } from 'drizzle-orm'
import { Cron } from 'croner'
import { db } from '../db'

import { REGULAR_READERS_WINDOW_DAYS } from '../config/constants'

import { captureAppException } from '../lib/sentry'

export interface RecalculateResult {
  success: boolean
  timestamp: string
}

export async function recalculateRegularReaders(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<RecalculateResult> {
  const nowIso = new Date().toISOString()
  const intervalString = `${REGULAR_READERS_WINDOW_DAYS} days`

  const runUpdates = async (tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    // 1. Update authors who have active readers in the window
    await tx.execute(sql`
      WITH calculated_stats AS (
        SELECT author_profile_id, COUNT(*)::int AS active_count
        FROM readers
        WHERE last_read_at >= NOW() - (${intervalString})::interval
        GROUP BY author_profile_id
      )
      UPDATE profiles p
      SET regular_readers_count = cs.active_count
      FROM calculated_stats cs
      WHERE p.id = cs.author_profile_id
        AND p.regular_readers_count != cs.active_count
    `)

    // 2. Reset regular_readers_count to 0 for authors with no active reads in the window
    await tx.execute(sql`
      UPDATE profiles p
      SET regular_readers_count = 0
      WHERE p.regular_readers_count > 0
        AND NOT EXISTS (
          SELECT 1
          FROM readers r
          WHERE r.author_profile_id = p.id
            AND r.last_read_at >= NOW() - (${intervalString})::interval
        )
    `)
  }

  if (typeof (executor as any).transaction === 'function') {
    await (executor as any).transaction(runUpdates)
  } else {
    await runUpdates(executor)
  }

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
      captureAppException(error)
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
