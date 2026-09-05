import { describe, it, expect } from 'bun:test'
import { recordPostViews } from '../service'
import { posts } from '../../../db/schema/posts'

describe('recordPostViews Service Unit Tests', () => {
  it('returns updatedCount 0 if empty postIds array is passed', async () => {
    let updateCalled = false
    const mockExecutor: any = {
      update: () => {
        updateCalled = true
        return {
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        }
      },
    }

    const result = await recordPostViews([], mockExecutor)
    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(0)
    expect(updateCalled).toBe(false)
  })

  it('executes a single update query with deduplicated IDs and returns updatedCount', async () => {
    let updatedTable: any = null
    let setData: any = null
    let whereCondition: any = null
    let returningSelection: any = null

    const mockReturningRows = [
      { id: 100000000000001n },
      { id: 100000000000002n },
    ]

    const mockExecutor: any = {
      update: (table: any) => {
        updatedTable = table
        return {
          set: (data: any) => {
            setData = data
            return {
              where: (cond: any) => {
                whereCondition = cond
                return {
                  returning: async (sel: any) => {
                    returningSelection = sel
                    return mockReturningRows
                  },
                }
              },
            }
          },
        }
      },
    }

    const postIds = [
      100000000000001n,
      100000000000002n,
      100000000000001n, // duplicate
    ]

    const result = await recordPostViews(postIds, mockExecutor)

    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(2)
    expect(updatedTable).toBe(posts)
    expect(setData).toBeDefined()
    expect(setData.viewsCount).toBeDefined()
    expect(whereCondition).toBeDefined()
    expect(returningSelection).toEqual({ id: posts.id })
  })
})
