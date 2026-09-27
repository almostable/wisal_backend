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
        where: () => ({
          returning: async () => [],
        }),
      }),
    }

    const result = await runMediaGc(mockExecutor)
    expect(result.success).toBe(true)
    expect(result.processedBatches).toBe(0)
    expect(result.purgedKeysCount).toBe(0)
    expect(result.databaseCleanedCount).toBe(0)
    expect(result.timestamp).toBeString()
  })

  it('runMediaGc deletes candidates from R2 and updates status to purged in DB', async () => {
    const candidates = [
      { fileKey: 'media/2026-09-04/111.jpg' },
      { fileKey: 'media/2026-09-04/222.jpg' },
      { fileKey: 'media/2026-09-04/333.jpg' },
    ]

    let selectedCalls = 0
    const updates: any[] = []
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
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                selectedCalls++
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
      delete: () => ({
        where: () => ({
          returning: async () => [
            { fileKey: 'media/old/expired1.jpg' },
            { fileKey: 'media/old/expired2.jpg' },
          ],
        }),
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
    expect(updates.some((u) => u.status === 'purged' && u.purgedAt instanceof Date)).toBe(true)
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
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
    }
    const result = await runMediaGc(executor as unknown as Parameters<typeof runMediaGc>[0], {
      batchSize: 1,
      s3Deleter: async () => ({ deleted: [], errors: [{ key: 'media/2026-09-27/111.jpg' }] }),
    })
    expect(result.processedBatches).toBe(1)
    expect(reads).toBe(2)
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

  it('initMediaGcCron returns an active Cron instance', () => {
    const job = initMediaGcCron()
    expect(job).toBeInstanceOf(Cron)
    job.stop()
  })
})
