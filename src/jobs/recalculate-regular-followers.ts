import { sql } from 'drizzle-orm'
import { Cron } from 'croner'
import { db } from '../db'

export interface RecalculateResult {
  success: boolean
  timestamp: string
}

export async function recalculateRegularFollowers(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db
): Promise<RecalculateResult> {
  const nowIso = new Date().toISOString()

  // 1. Update authors who have active readers in the last 30 days
  await executor.execute(sql`
    WITH calculated_stats AS (
      SELECT following_id, COUNT(*) AS active_count
      FROM follows
      WHERE last_read_at >= NOW() - INTERVAL '30 days'
      GROUP BY following_id
    )
    UPDATE profiles p
    SET regular_followers_count = cs.active_count
    FROM calculated_stats cs
    WHERE p.account_id = cs.following_id
      AND p.regular_followers_count != cs.active_count
  `)

  // 2. Reset regular_followers_count to 0 for authors with no active reads in the last 30 days
  await executor.execute(sql`
    UPDATE profiles
    SET regular_followers_count = 0
    WHERE regular_followers_count > 0
      AND account_id NOT IN (
        SELECT DISTINCT following_id
        FROM follows
        WHERE last_read_at >= NOW() - INTERVAL '30 days'
      )
  `)

  return {
    success: true,
    timestamp: nowIso,
  }
}

export function initRegularFollowersCron(): Cron {
  // Run daily at 03:00 UTC
  const job = new Cron('0 3 * * *', { timezone: 'UTC' }, async () => {
    console.log(`[CRON] [${new Date().toISOString()}] Starting daily recalculation of regular followers...`)
    try {
      const result = await recalculateRegularFollowers()
      console.log(`[CRON] [${result.timestamp}] Finished daily recalculation of regular followers successfully.`)
    } catch (error) {
      console.error(`[CRON] [${new Date().toISOString()}] Error during regular followers recalculation:`, error)
    }
  })

  return job
}

if (import.meta.main) {
  console.log(`[CLI] Starting recalculation of regular followers...`)
  try {
    const result = await recalculateRegularFollowers()
    console.log(`[CLI] Finished recalculation of regular followers at ${result.timestamp}.`)
    process.exit(0)
  } catch (error) {
    console.error(`[CLI] Error recalculating regular followers:`, error)
    process.exit(1)
  }
}
