import type { NotificationType, NotificationTargetType } from '../../db/schema/notifications'

export interface NotificationActor {
  id: bigint
  name: string | null
  identity: string | null
  avatarKey: string | null
  isMale: boolean | null
}

export interface NotificationItem {
  id: bigint
  type: NotificationType
  targetType: NotificationTargetType
  targetId: bigint | null
  postId?: bigint | null
  commentId?: bigint | null
  payload: Record<string, unknown>
  isRead: boolean
  createdAt: Date
  actor: NotificationActor | null
}

export interface CreateNotificationOptions {
  recipientProfileId: bigint
  actorProfileId?: bigint | null
  type: NotificationType
  targetType: NotificationTargetType
  targetId?: bigint | null
  postId?: bigint | null
  commentId?: bigint | null
  payload?: Record<string, unknown>
}

export interface ListNotificationsOptions {
  limit?: number
  offset?: number
}

export interface ListNotificationsResult {
  notifications: NotificationItem[]
  total: number
  unreadCount: number
  limit: number
  offset: number
}

export interface UnreadCountResult {
  unreadCount: number
}

export interface MarkSingleNotificationReadResult {
  success: boolean
  notificationId: bigint
  readAt: Date
  isRead: boolean
}
