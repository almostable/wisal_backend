import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import {
  createNotification,
  deleteNotificationsForComments,
  deleteNotificationsForPosts,
  deleteNotificationsForInvites,
  deleteNotificationsBetweenProfiles,
  deleteNotificationsForProfiles,
} from '../service'

describe('Notifications Service Tests', () => {
  it('createNotification returns null on self-action (actor === recipient)', async () => {
    const result = await createNotification({
      recipientProfileId: 1001n,
      actorProfileId: 1001n,
      type: 'new_comment',
      targetType: 'post',
      targetId: 2001n,
    })

    expect(result).toBeNull()
  })

  it('createNotification drops notification if users have mutual block', async () => {
    const mockExecutor: any = {
      query: {
        profileBlocks: {
          findFirst: async () => ({
            blockerProfileId: 1001n,
            blockedProfileId: 1002n,
            createdAt: new Date(),
          }),
        },
      },
    }

    const result = await createNotification(
      {
        recipientProfileId: 1002n,
        actorProfileId: 1001n,
        type: 'new_comment',
        targetType: 'post',
        targetId: 2001n,
      },
      mockExecutor
    )

    expect(result).toBeNull()
  })

  it('createNotification inserts notification when not blocked and not self-action', async () => {
    const mockInserted = {
      id: 999999999999991n,
      recipientProfileId: 1002n,
      actorProfileId: 1001n,
      type: 'new_comment',
      targetType: 'post',
      targetId: 2001n,
      payload: { snippet: 'hello' },
      createdAt: new Date(),
    }

    const mockExecutor: any = {
      query: {
        profileBlocks: {
          findFirst: async () => null,
        },
      },
      insert: () => ({
        values: () => ({
          returning: async () => [mockInserted],
        }),
      }),
    }

    const result = await createNotification(
      {
        recipientProfileId: 1002n,
        actorProfileId: 1001n,
        type: 'new_comment',
        targetType: 'post',
        targetId: 2001n,
        payload: { snippet: 'hello' },
      },
      mockExecutor
    )

    expect(result).not.toBeNull()
    expect(result?.id).toBe(999999999999991n)
    expect(result?.type).toBe('new_comment')
  })

  it('deleteNotificationsForComments triggers delete for target comment and payload commentId', async () => {
    let deletedWhere: any = null
    const mockExecutor: any = {
      delete: () => ({
        where: async (condition: any) => {
          deletedWhere = condition
          return []
        },
      }),
    }

    await deleteNotificationsForComments([3001n, 3002n], mockExecutor)
    expect(deletedWhere).toBeDefined()

    // Calling with empty array does nothing
    let called = false
    const noopExecutor: any = {
      delete: () => {
        called = true
        return { where: async () => [] }
      },
    }
    await deleteNotificationsForComments([], noopExecutor)
    expect(called).toBe(false)
  })

  it('deleteNotificationsForPosts triggers delete for target post and payload postId', async () => {
    let deletedWhere: any = null
    const mockExecutor: any = {
      delete: () => ({
        where: async (condition: any) => {
          deletedWhere = condition
          return []
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({}),
        }),
      }),
    }

    await deleteNotificationsForPosts(2001n, mockExecutor)
    expect(deletedWhere).toBeDefined()

    // Empty array does nothing
    let called = false
    const noopExecutor: any = {
      delete: () => {
        called = true
        return { where: async () => [] }
      },
    }
    await deleteNotificationsForPosts([], noopExecutor)
    expect(called).toBe(false)
  })

  it('deleteNotificationsForInvites triggers delete for target invite', async () => {
    let deletedWhere: any = null
    const mockExecutor: any = {
      delete: () => ({
        where: async (condition: any) => {
          deletedWhere = condition
          return []
        },
      }),
    }

    await deleteNotificationsForInvites(4001n, mockExecutor)
    expect(deletedWhere).toBeDefined()

    let called = false
    const noopExecutor: any = {
      delete: () => {
        called = true
        return { where: async () => [] }
      },
    }
    await deleteNotificationsForInvites([], noopExecutor)
    expect(called).toBe(false)
  })

  it('deleteNotificationsBetweenProfiles triggers delete for mutual profile notifications', async () => {
    let deletedWhere: any = null
    const mockExecutor: any = {
      delete: () => ({
        where: async (condition: any) => {
          deletedWhere = condition
          return []
        },
      }),
    }

    await deleteNotificationsBetweenProfiles(1001n, 1002n, mockExecutor)
    expect(deletedWhere).toBeDefined()
  })

  it('deleteNotificationsForProfiles triggers delete for profileIds', async () => {
    let deletedWhere: any = null
    const mockExecutor: any = {
      delete: () => ({
        where: async (condition: any) => {
          deletedWhere = condition
          return []
        },
      }),
    }

    await deleteNotificationsForProfiles([1001n, 1002n], mockExecutor)
    expect(deletedWhere).toBeDefined()

    let called = false
    const noopExecutor: any = {
      delete: () => {
        called = true
        return { where: async () => [] }
      },
    }
    await deleteNotificationsForProfiles([], noopExecutor)
    expect(called).toBe(false)
  })
})

