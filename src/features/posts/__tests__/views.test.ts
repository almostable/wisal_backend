import { describe, it, expect } from 'bun:test'
import { recordPostViews } from '../service'
import { posts } from '../../../db/schema/posts'
import { postViews } from '../../../db/schema/post-views'

describe('recordPostViews Service Unit Tests', () => {
  const viewer = {
    profileId: 100000000000001n,
    isMale: true,
  }

  it('returns updatedCount 0 if empty postIds array is passed', async () => {
    let selectCalled = false
    const mockExecutor: any = {
      select: () => {
        selectCalled = true
        return {
          from: () => ({
            where: async () => [],
          }),
        }
      },
    }

    const result = await recordPostViews(viewer, [], mockExecutor)
    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(0)
    expect(selectCalled).toBe(false)
  })

  it('records views for accessible posts and increments viewsCount', async () => {
    let insertedTable: any = null
    let insertedValues: any = null
    let updatedTable: any = null

    const mockAccessible = [
      { id: 200000000000001n, authorId: 900000000000001n },
      { id: 200000000000002n, authorId: 900000000000002n },
    ]

    const mockInserted = [
      { postId: 200000000000001n },
      { postId: 200000000000002n },
    ]

    const mockExecutor: any = {
      select: () => ({
        from: () => ({
          where: async () => mockAccessible,
        }),
      }),
      insert: (table: any) => {
        insertedTable = table
        return {
          values: (vals: any) => {
            insertedValues = vals
            return {
              onConflictDoNothing: () => ({
                returning: async () => mockInserted,
              }),
            }
          },
        }
      },
      update: (table: any) => {
        updatedTable = table
        return {
          set: () => ({
            where: async () => [],
          }),
        }
      },
    }

    const postIds = [
      200000000000001n,
      200000000000002n,
      200000000000001n, // duplicate
    ]

    const result = await recordPostViews(viewer, postIds, mockExecutor)

    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(2)
    expect(insertedTable).toBe(postViews)
    expect(insertedValues).toEqual([
      { postId: 200000000000001n, profileId: viewer.profileId },
      { postId: 200000000000002n, profileId: viewer.profileId },
    ])
    expect(updatedTable).toBe(posts)
  })

  it('deduplicates re-views: if already viewed, onConflict returns empty and does not increment', async () => {
    let updateCalled = false

    const mockAccessible = [
      { id: 200000000000001n, authorId: 900000000000001n },
    ]

    const mockExecutor: any = {
      select: () => ({
        from: () => ({
          where: async () => mockAccessible,
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [], // already viewed!
          }),
        }),
      }),
      update: () => {
        updateCalled = true
        return {
          set: () => ({
            where: async () => [],
          }),
        }
      },
    }

    const result = await recordPostViews(viewer, [200000000000001n], mockExecutor)

    expect(result.success).toBe(true)
    expect(result.updatedCount).toBe(0)
    expect(updateCalled).toBe(false)
  })
})
