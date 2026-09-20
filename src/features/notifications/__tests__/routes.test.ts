import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { NotificationItem } from '../types'

describe('Notifications Feature Route Tests', () => {
  const userAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'user@wisal.dev',
    bannedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const userSession: Session = {
    id: 222222222222222n,
    accountId: userAccount.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const userProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: userAccount.id,
    name: 'Notification Receiver',
    isMale: true,
    avatarKey: null,
    description: 'Bio',
    contacts: null,
    identityId: 444444444444444n,
    regularReadersCount: 0,
    readersCount: 0,
    verifiedAt: null,
    notificationsReadAt: new Date(Date.now() - 10000),
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'receiver_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const mockNotification: NotificationItem = {
    id: 999999999999991n,
    type: 'new_comment',
    targetType: 'post',
    targetId: 888888888888881n,
    payload: { commentId: '777777777777771', commentSnippet: 'Nice post!' },
    isRead: false,
    createdAt: new Date(),
    actor: {
      id: 555555555555555n,
      name: 'Commenter',
      identity: 'commenter_handle',
      avatarKey: null,
      isMale: false,
    },
  }

  it('GET /notifications returns list of notifications with isRead and unreadCount', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getNotifications: async () => ({
        notifications: [mockNotification],
        total: 1,
        unreadCount: 1,
        limit: 20,
        offset: 0,
      }),
      getUnreadNotificationsCount: async () => ({ unreadCount: 1 }),
      markNotificationsAsRead: async () => ({ success: true, readAt: new Date() }),
    }))

    const res = await app.request('/notifications?limit=20&offset=0', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0].id).toBe('999999999999991')
    expect(body.notifications[0].type).toBe('new_comment')
    expect(body.notifications[0].actor.identity).toBe('commenter_handle')
    expect(body.unreadCount).toBe(1)
  })

  it('GET /notifications/unread-count returns fast unread count for badge', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUnreadNotificationsCount: async () => ({ unreadCount: 5 }),
    }))

    const res = await app.request('/notifications/unread-count', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.unreadCount).toBe(5)
  })

  it('POST /notifications/read marks all notifications as read', async () => {
    const now = new Date()
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      markNotificationsAsRead: async () => ({ success: true, readAt: now }),
    }))

    const res = await app.request('/notifications/read', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.readAt).toBeDefined()
  })

  it('GET /notifications requires auth', async () => {
    const res = await app.request('/notifications', {
      method: 'GET',
    })

    expect(res.status).toBe(401)
  })
})
