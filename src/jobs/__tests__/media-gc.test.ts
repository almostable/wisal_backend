import { describe, it, expect } from 'bun:test'
import { runMediaGc, initMediaGcCron } from '../media-gc'
import { Cron } from 'croner'

describe('Media GC Worker Tests', () => {
  it('runMediaGc completes with 0 when no candidates exist', async () => {
    const mockExecutor: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
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
    let updatedSet: any = null
    let updatedWhereKeys: any = null
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
            limit: async () => {
              selectedCalls++
              return selectedCalls === 1 ? candidates : []
            },
          }),
        }),
      }),
      update: () => ({
        set: (data: any) => {
          updatedSet = data
          return {
            where: async (clause: any) => {
              updatedWhereKeys = clause
              return []
            },
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
    expect(updatedSet.status).toBe('purged')
    expect(updatedSet.purgedAt).toBeInstanceOf(Date)
  })

  it('initMediaGcCron returns an active Cron instance', () => {
    const job = initMediaGcCron()
    expect(job).toBeInstanceOf(Cron)
    job.stop()
  })
})
