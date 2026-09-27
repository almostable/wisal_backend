import { sql, and, or, eq, inArray, gt, lte, asc } from 'drizzle-orm'
import { Cron } from 'croner'
import { db } from '../db'
import { mediaUploads } from '../db/schema/media-uploads'
import { deleteObjectsFromR2 } from '../lib/s3'
import { cleanupExpiredSessions } from '../lib/session'
import { cleanupExpiredAdminSessions } from '../lib/admin-session'
import { captureAppException } from '../lib/sentry'
import { MEDIA_GC_DELETED_TTL_DAYS } from '../config/constants'

export interface MediaGcOptions {
  batchSize?: number
  s3Deleter?: (keys: string[]) => Promise<{ deleted: string[]; errors?: any[] }>
}

export interface MediaGcResult {
  success: boolean
  processedBatches: number
  purgedKeysCount: number
  databaseCleanedCount: number
  timestamp: string
}

export async function runMediaGc(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
  options?: MediaGcOptions
): Promise<MediaGcResult> {
  const batchSize = options?.batchSize ?? 1000
  const deleter = options?.s3Deleter ?? deleteObjectsFromR2
  let processedBatches = 0
  let purgedKeysCount = 0
  let lastKey: string | null = null
  const deletedBefore = new Date(Date.now() - MEDIA_GC_DELETED_TTL_DAYS * 24 * 60 * 60 * 1000)

  while (true) {
    const candidates = await executor
      .select({ fileKey: mediaUploads.fileKey })
      .from(mediaUploads)
      .where(
        and(
          or(
            and(
              eq(mediaUploads.status, 'pending'),
              sql`${mediaUploads.createdAt} < NOW() - INTERVAL '24 HOURS'`
            ),
            and(eq(mediaUploads.status, 'deleted'), lte(mediaUploads.deletedAt, deletedBefore)),
            and(
              eq(mediaUploads.status, 'gc_failed'),
              or(sql`${mediaUploads.deletedAt} IS NULL`, lte(mediaUploads.deletedAt, deletedBefore))
            )
          ),
          lastKey ? gt(mediaUploads.fileKey, lastKey) : undefined
        )
      )
      .orderBy(asc(mediaUploads.fileKey))
      .limit(batchSize)

    if (candidates.length === 0) {
      break
    }

    processedBatches++
    const keys = candidates.map((c) => c.fileKey)
    lastKey = keys[keys.length - 1] ?? null

    const { deleted: confirmedDeletedKeys, errors } = await deleter(keys)
    const confirmedSet = new Set(confirmedDeletedKeys)

    if (errors && errors.length > 0) {
      console.warn(`[GC Worker] S3 reported ${errors.length} errors while deleting keys`, errors)
    }

    if (confirmedDeletedKeys.length > 0) {
      await executor
        .update(mediaUploads)
        .set({
          status: 'purged',
          purgedAt: new Date(),
        })
        .where(inArray(mediaUploads.fileKey, confirmedDeletedKeys))

      purgedKeysCount += confirmedDeletedKeys.length
    }

    const unhandledKeys = keys.filter((k) => !confirmedSet.has(k))
    if (unhandledKeys.length > 0) {
      await executor
        .update(mediaUploads)
        .set({
          status: 'gc_failed',
        })
        .where(inArray(mediaUploads.fileKey, unhandledKeys))
    }

    if (candidates.length < batchSize) {
      break
    }
  }

  const cleanedResult = await executor
    .delete(mediaUploads)
    .where(
      and(
        eq(mediaUploads.status, 'purged'),
        sql`${mediaUploads.purgedAt} < NOW() - INTERVAL '90 DAYS'`
      )
    )
    .returning({ fileKey: mediaUploads.fileKey })

  return {
    success: true,
    processedBatches,
    purgedKeysCount,
    databaseCleanedCount: cleanedResult.length,
    timestamp: new Date().toISOString(),
  }
}

export function initMediaGcCron(): Cron {
  // Run daily at 04:00 UTC
  const job = new Cron('0 4 * * *', { timezone: 'UTC' }, async () => {
    console.log(`[CRON] [${new Date().toISOString()}] Starting daily media garbage collection and session cleanup...`)
    try {
      const result = await runMediaGc()
      const [purgedUserSessions, purgedAdminSessions] = await Promise.all([
        cleanupExpiredSessions(),
        cleanupExpiredAdminSessions(),
      ])
      console.log(
        `[CRON] [${result.timestamp}] Finished media GC: ${result.purgedKeysCount} purged from R2, ${result.databaseCleanedCount} deleted from DB. Cleaned ${purgedUserSessions} user sessions, ${purgedAdminSessions} admin sessions.`
      )
    } catch (error) {
      captureAppException(error)
      console.error(`[CRON] [${new Date().toISOString()}] Error during media garbage collection:`, error)
    }
  })

  return job
}

if (import.meta.main) {
  console.log(`[CLI] Starting media garbage collection and session cleanup...`)
  try {
    const result = await runMediaGc()
    const [purgedUserSessions, purgedAdminSessions] = await Promise.all([
      cleanupExpiredSessions(),
      cleanupExpiredAdminSessions(),
    ])
    console.log(
      `[CLI] Finished media GC at ${result.timestamp}: ${result.purgedKeysCount} purged from R2, ${result.databaseCleanedCount} records deleted from DB. Cleaned ${purgedUserSessions} user sessions, ${purgedAdminSessions} admin sessions.`
    )
    process.exit(0)
  } catch (error) {
    console.error(`[CLI] Error running media garbage collection:`, error)
    process.exit(1)
  }
}
