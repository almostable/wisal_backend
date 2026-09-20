import { pgTable, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId } from './common'
import { profiles } from './profiles'

export const NOTIFICATION_TYPES = [
  'new_comment',
  'comment_reply',
  'invite_used',
  'system_restriction',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TARGET_TYPES = [
  'post',
  'comment',
  'invite',
  'profile',
  'system',
] as const
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number]

export const notifications = pgTable(
  'notifications',
  {
    id: snowflakePrimaryKey(),
    recipientProfileId: snowflakeId('recipient_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actorProfileId: snowflakeId('actor_profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    type: varchar('type', { length: 32 }).notNull(),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: snowflakeId('target_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notifications_recipient_created_at_idx').on(
      table.recipientProfileId,
      table.createdAt
    ),
    index('notifications_recipient_id_idx').on(table.recipientProfileId, table.id),
    index('notifications_actor_profile_id_idx').on(table.actorProfileId),
  ]
)

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(profiles, {
    fields: [notifications.recipientProfileId],
    references: [profiles.id],
    relationName: 'recipientProfile',
  }),
  actor: one(profiles, {
    fields: [notifications.actorProfileId],
    references: [profiles.id],
    relationName: 'actorProfile',
  }),
}))

export const insertNotificationSchema = createInsertSchema(notifications, {
  type: () => z.enum(NOTIFICATION_TYPES),
  targetType: () => z.enum(NOTIFICATION_TARGET_TYPES),
  payload: () => z.record(z.string(), z.unknown()).default({}),
})

export const selectNotificationSchema = createSelectSchema(notifications)

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
