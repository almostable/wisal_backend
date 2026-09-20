import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import { createNotification } from '../service'

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
})
