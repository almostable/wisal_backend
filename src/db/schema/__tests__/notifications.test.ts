import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  notifications,
  insertNotificationSchema,
  selectNotificationSchema,
  NOTIFICATION_TYPES,
  NOTIFICATION_TARGET_TYPES,
} from '../notifications'

describe('Notifications Schema Tests', () => {
  it('validates notification insertion with valid data', () => {
    const parsed = insertNotificationSchema.parse({
      recipientProfileId: 1001n,
      actorProfileId: 1002n,
      type: 'new_comment',
      targetType: 'post',
      targetId: 2001n,
      payload: { commentId: '3001', commentSnippet: 'Great post!' },
    })

    expect(parsed.recipientProfileId).toBe(1001n)
    expect(parsed.actorProfileId).toBe(1002n)
    expect(parsed.type).toBe('new_comment')
    expect(parsed.targetType).toBe('post')
    expect(parsed.targetId).toBe(2001n)
    expect(parsed.payload).toEqual({ commentId: '3001', commentSnippet: 'Great post!' })
  })

  it('validates system notification without actorProfileId', () => {
    const parsed = insertNotificationSchema.parse({
      recipientProfileId: 1001n,
      type: 'system_restriction',
      targetType: 'system',
      payload: { reason: 'Invited user was banned' },
    })

    expect(parsed.recipientProfileId).toBe(1001n)
    expect(parsed.actorProfileId).toBeUndefined()
    expect(parsed.type).toBe('system_restriction')
    expect(parsed.targetType).toBe('system')
  })

  it('rejects invalid notification type or target type', () => {
    expect(() =>
      insertNotificationSchema.parse({
        recipientProfileId: 1001n,
        type: 'invalid_type',
        targetType: 'post',
      })
    ).toThrow()

    expect(() =>
      insertNotificationSchema.parse({
        recipientProfileId: 1001n,
        type: 'new_comment',
        targetType: 'invalid_target',
      })
    ).toThrow()
  })

  it('validates selectNotificationSchema with readAt', () => {
    const now = new Date()
    const selected = selectNotificationSchema.parse({
      id: 5001n,
      recipientProfileId: 1001n,
      actorProfileId: 1002n,
      type: 'comment_reply',
      targetType: 'comment',
      targetId: 3001n,
      payload: { postId: '2001' },
      readAt: null,
      createdAt: now,
    })

    expect(selected.id).toBe(5001n)
    expect(selected.readAt).toBeNull()
    expect(selected.createdAt).toEqual(now)
  })

  it('has correct indexes configured on notifications table', () => {
    const config = getTableConfig(notifications)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('notifications_recipient_created_at_idx')
    expect(indexNames).toContain('notifications_recipient_id_idx')
    expect(indexNames).toContain('notifications_recipient_read_at_idx')
    expect(indexNames).toContain('notifications_actor_profile_id_idx')
    expect(indexNames).toContain('notifications_target_idx')
  })

  it('has expected enum constants defined', () => {
    expect(NOTIFICATION_TYPES).toContain('new_comment')
    expect(NOTIFICATION_TYPES).toContain('comment_reply')
    expect(NOTIFICATION_TYPES).toContain('invite_used')
    expect(NOTIFICATION_TYPES).toContain('system_restriction')

    expect(NOTIFICATION_TARGET_TYPES).toContain('post')
    expect(NOTIFICATION_TARGET_TYPES).toContain('comment')
    expect(NOTIFICATION_TARGET_TYPES).toContain('invite')
    expect(NOTIFICATION_TARGET_TYPES).toContain('profile')
    expect(NOTIFICATION_TARGET_TYPES).toContain('system')
  })
})
