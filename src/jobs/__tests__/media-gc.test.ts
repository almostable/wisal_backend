import { describe, it, expect } from 'bun:test'
import { runMediaGc, initMediaGcCron } from '../media-gc'
import { Cron } from 'croner'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

describe('Media GC Worker Tests', () => {
  it('runMediaGc completes with 0 when no candidates exist', async () => {
    const mockExecutor: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      delete: () => ({
        where: async () => [],
      }),
    }

    const result = await runMediaGc(mockExecutor)
    expect(result.success).toBe(true)
    expect(result.processedBatches).toBe(0)
    expect(result.purgedKeysCount).toBe(0)
    expect(result.purgedPostsCount).toBe(0)
    expect(result.purgedCommentsCount).toBe(0)
    expect(result.databaseCleanedCount).toBe(0)
    expect(result.timestamp).toBeString()
  })

  it('runMediaGc deletes candidates from R2 and removes confirmed records from media_uploads without purged status', async () => {
    const candidates = [
      { fileKey: 'media/2026-09-04/111.jpg' },
      { fileKey: 'media/2026-09-04/222.jpg' },
      { fileKey: 'media/2026-09-04/333.jpg' },
    ]

    let selectedCalls = 0
    const updates: any[] = []
    const deletedCalls: any[] = []
    let s3CalledKeys: string[] = []

    const mockS3Deleter = async (keys: string[]) => {
      s3CalledKeys = keys
      return {
        deleted: ['media/2026-09-04/111.jpg', 'media/2026-09-04/222.jpg'],
        errors: [{ key: 'media/2026-09-04/333.jpg', message: 'Rate limited' }],
      }
    }

    const mockExecutor: any = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                selectedCalls++
                // Only return media candidates on the first call, empty on posts and comments
                return selectedCalls === 1 ? candidates : []
              },
            }),
          }),
        }),
      }),
      update: () => ({
        set: (data: any) => {
          updates.push(data)
          return {
            where: async () => [],
          }
        },
      }),
      delete: (table: any) => ({
        where: async (cond: any) => {
          deletedCalls.push({ table, cond })
          return []
        },
      }),
    }

    const result = await runMediaGc(mockExecutor, {
      batchSize: 1000,
      s3Deleter: mockS3Deleter,
    })

    expect(result.success).toBe(true)
    expect(result.processedBatches).toBe(1)
    expect(result.purgedKeysCount).toBe(2)
    expect(result.databaseCleanedCount).toBe(2)
    expect(s3CalledKeys).toEqual([
      'media/2026-09-04/111.jpg',
      'media/2026-09-04/222.jpg',
      'media/2026-09-04/333.jpg',
    ])
    // Confirmed deleted files are removed from media_uploads directly
    expect(deletedCalls.length).toBe(1)
    // No status = 'purged' exists
    expect(updates.some((u) => u.status === 'purged')).toBe(false)
    // Unhandled file is marked as gc_failed
    expect(updates.some((u) => u.status === 'gc_failed')).toBe(true)
  })

  it('moves the cursor after a failed R2 deletion instead of retrying the same key in one run', async () => {
    const conditions: SQL[] = []
    let reads = 0
    const executor = {
      select: () => ({ from: () => ({ where: (condition: SQL) => {
        conditions.push(condition)
        return { orderBy: () => ({ limit: async () => ++reads === 1
          ? [{ fileKey: 'media/2026-09-27/111.jpg' }] : [] }) }
      } }) }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
      delete: () => ({ where: async () => [] }),
    }
    const result = await runMediaGc(executor as unknown as Parameters<typeof runMediaGc>[0], {
      batchSize: 1,
      s3Deleter: async () => ({ deleted: [], errors: [{ key: 'media/2026-09-27/111.jpg' }] }),
    })
    expect(result.processedBatches).toBe(1)
    expect(reads).toBe(4) // 2 for media loop, 1 for posts, 1 for comments
    const firstQuery = new PgDialect().sqlToQuery(conditions[0]!)
    expect(firstQuery.sql).toContain('"deleted_at" <=')
    expect(firstQuery.params.some((param) => {
      const timestamp = param instanceof Date ? param.getTime() : Date.parse(String(param))
      return Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp - 14 * 86_400_000) < 5_000
    })).toBe(true)
    const secondQuery = new PgDialect().sqlToQuery(conditions[1]!)
    expect(secondQuery.sql).toContain('"file_key" >')
    expect(secondQuery.params).toContain('media/2026-09-27/111.jpg')
  })

  it('permanently erases posts older than 14 days and cleans up their media and DB records', async () => {
    const expiredPosts = [
      {
        id: 5001n,
        payload: {
          media: [{ fileKey: 'media/2026-09-01/5001.jpg', width: 800, height: 600 }],
        },
      },
    ]

    let s3DeletedKeys: string[] = []
    const deletedEntities: string[] = []

    let selectCall = 0
    const mockExecutor: any = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                selectCall++
                // call 1: media_uploads (empty)
                // call 2: posts (returns expiredPosts)
                // call 3: posts next page (empty)
                // call 4: comments (empty)
                if (selectCall === 2) return expiredPosts
                return []
              },
            }),
          }),
        }),
      }),
      delete: (table: any) => ({
        where: async () => {
          deletedEntities.push('deleted')
          return []
        },
      }),
      update: () => ({
        set: () => ({ where: async () => [] }),
      }),
    }

    const mockS3Deleter = async (keys: string[]) => {
      s3DeletedKeys = keys
      return { deleted: keys, errors: [] }
    }

    const result = await runMediaGc(mockExecutor, {
      batchSize: 100,
      s3Deleter: mockS3Deleter,
    })

    expect(result.success).toBe(true)
    expect(result.purgedPostsCount).toBe(1)
    expect(s3DeletedKeys).toEqual(['media/2026-09-01/5001.jpg'])
    // deleted media_uploads row + deleted posts row
    expect(deletedEntities.length).toBe(2)
  })

  it('permanently erases standalone comments older than 14 days and cleans up their media and DB records', async () => {
    const expiredComments = [
      {
        id: 7001n,
        payload: {
          media: [{ fileKey: 'media/2026-09-01/7001.jpg', width: 600, height: 400 }],
        },
      },
    ]

    let s3DeletedKeys: string[] = []
    const deletedEntities: string[] = []

    let selectCall = 0
    const mockExecutor: any = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                selectCall++
                // call 1: media_uploads (empty)
                // call 2: posts (empty)
                // call 3: comments (returns expiredComments)
                // call 4: comments next page (empty)
                if (selectCall === 3) return expiredComments
                return []
              },
            }),
          }),
        }),
      }),
      delete: (table: any) => ({
        where: async () => {
          deletedEntities.push('deleted')
          return []
        },
      }),
      update: () => ({
        set: () => ({ where: async () => [] }),
      }),
    }

    const mockS3Deleter = async (keys: string[]) => {
      s3DeletedKeys = keys
      return { deleted: keys, errors: [] }
    }

    const result = await runMediaGc(mockExecutor, {
      batchSize: 100,
      s3Deleter: mockS3Deleter,
    })

    expect(result.success).toBe(true)
    expect(result.purgedCommentsCount).toBe(1)
    expect(s3DeletedKeys).toEqual(['media/2026-09-01/7001.jpg'])
    expect(deletedEntities.length).toBe(2)
  })

  it('initMediaGcCron returns an active Cron instance', () => {
    const job = initMediaGcCron()
    expect(job).toBeInstanceOf(Cron)
    job.stop()
  })
})
