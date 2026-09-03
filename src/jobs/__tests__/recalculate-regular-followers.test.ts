import { describe, it, expect, mock } from 'bun:test'
import { recalculateRegularFollowers, initRegularFollowersCron } from '../recalculate-regular-followers'

describe('Recalculate Regular Followers Job Tests', () => {
  it('executes SQL batch updates and returns success', async () => {
    const executedQueries: string[] = []

    const mockExecutor: any = {
      execute: async (sqlQuery: any) => {
        // sqlQuery in Drizzle has queryChunks / sql
        executedQueries.push(sqlQuery)
        return []
      },
    }

    const result = await recalculateRegularFollowers(mockExecutor)

    expect(result.success).toBe(true)
    expect(result.timestamp).toBeDefined()
    expect(executedQueries.length).toBe(2)
  })

  it('initRegularFollowersCron creates and stops a Cron job for 03:00 UTC', () => {
    const job = initRegularFollowersCron()

    expect(job).toBeDefined()
    expect(job.getPattern()).toBe('0 3 * * *')
    expect(job.isStopped()).toBe(false)

    job.stop()
    expect(job.isStopped()).toBe(true)
  })
})
