import { eq, and, or, desc, count, sql, isNull, gt } from 'drizzle-orm'
import { db } from '../../db'
import { notifications, type Notification } from '../../db/schema/notifications'
import { profiles } from '../../db/schema/profiles'
import { identities } from '../../db/schema/identities'
import { profileBlocks } from '../../db/schema/profile-blocks'
import type {
  CreateNotificationOptions,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationItem,
  UnreadCountResult,
} from './types'

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function createNotification(
  options: CreateNotificationOptions,
  executor: DbExecutor = db
): Promise<Notification | null> {
  const { recipientProfileId, actorProfileId, type, targetType, targetId, payload } = options

  // 1. Self-Action Check: Do not notify author about their own actions
  if (actorProfileId && actorProfileId === recipientProfileId) {
    return null
  }

  // 2. Block Filter: Do not send notifications if mutual block exists
  if (actorProfileId) {
    const isBlocked = await executor.query.profileBlocks.findFirst({
      where: or(
        and(
          eq(profileBlocks.blockerProfileId, actorProfileId),
          eq(profileBlocks.blockedProfileId, recipientProfileId)
        ),
        and(
          eq(profileBlocks.blockerProfileId, recipientProfileId),
          eq(profileBlocks.blockedProfileId, actorProfileId)
        )
      ),
    })

    if (isBlocked) {
      return null
    }
  }

  // 3. Insert notification into database
  const [newNotification] = await executor
    .insert(notifications)
    .values({
      recipientProfileId,
      actorProfileId: actorProfileId ?? null,
      type,
      targetType,
      targetId: targetId ?? null,
      payload: payload ?? {},
    })
    .returning()

  // 4. APNs Push Dispatcher Extension Point (Stub for async background push)
  // dispatchApnsPushNotification(newNotification).catch(err => captureAppException(err))

  return newNotification ?? null
}

export async function getNotifications(
  profileId: bigint,
  options: ListNotificationsOptions = {}
): Promise<ListNotificationsResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  // Fetch current user's notificationsReadAt
  const userProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: {
      notificationsReadAt: true,
    },
  })

  const readAt = userProfile?.notificationsReadAt ?? null

  const whereCondition = eq(notifications.recipientProfileId, profileId)

  const [rawItems, totalCountResult, unreadCountResult] = await Promise.all([
    db
      .select({
        notification: notifications,
        actorProfile: {
          id: profiles.id,
          name: profiles.name,
          avatarKey: profiles.avatarKey,
          isMale: profiles.isMale,
        },
        actorIdentity: {
          identity: identities.identity,
        },
      })
      .from(notifications)
      .leftJoin(profiles, eq(notifications.actorProfileId, profiles.id))
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(whereCondition)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notifications)
      .where(whereCondition),
    db
      .select({ count: count() })
      .from(notifications)
      .where(
        readAt
          ? and(whereCondition, gt(notifications.createdAt, readAt))
          : whereCondition
      ),
  ])

  const mappedNotifications: NotificationItem[] = rawItems.map((item) => {
    const isRead = readAt ? item.notification.createdAt <= readAt : false

    const actor =
      item.actorProfile && item.actorProfile.id
        ? {
            id: item.actorProfile.id,
            name: item.actorProfile.name,
            identity: item.actorIdentity?.identity ?? null,
            avatarKey: item.actorProfile.avatarKey,
            isMale: item.actorProfile.isMale,
          }
        : null

    return {
      id: item.notification.id,
      type: item.notification.type as any,
      targetType: item.notification.targetType as any,
      targetId: item.notification.targetId,
      payload: item.notification.payload,
      isRead,
      createdAt: item.notification.createdAt,
      actor,
    }
  })

  return {
    notifications: mappedNotifications,
    total: totalCountResult[0]?.count ?? 0,
    unreadCount: unreadCountResult[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function getUnreadNotificationsCount(
  profileId: bigint
): Promise<UnreadCountResult> {
  const userProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
    columns: {
      notificationsReadAt: true,
    },
  })

  const readAt = userProfile?.notificationsReadAt ?? null
  const whereCondition = eq(notifications.recipientProfileId, profileId)

  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      readAt
        ? and(whereCondition, gt(notifications.createdAt, readAt))
        : whereCondition
    )

  return {
    unreadCount: result?.count ?? 0,
  }
}

export async function markNotificationsAsRead(
  profileId: bigint
): Promise<{ success: boolean; readAt: Date }> {
  const now = new Date()

  await db
    .update(profiles)
    .set({ notificationsReadAt: now })
    .where(eq(profiles.id, profileId))

  return {
    success: true,
    readAt: now,
  }
}
