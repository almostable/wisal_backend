import { pgTable, timestamp, primaryKey, check, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { accounts } from './accounts'

export const follows = pgTable(
  'follows',
  {
    followerId: snowflakeId('follower_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    followingId: snowflakeId('following_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    primaryKey({
      name: 'follows_follower_id_following_id_pk',
      columns: [table.followerId, table.followingId],
    }),
    check('follows_prevent_self_follow_check', sql`${table.followerId} != ${table.followingId}`),
    index('follows_following_id_idx').on(table.followingId),
    index('follows_created_at_idx').on(table.createdAt),
    index('idx_follows_regular_readers').on(table.followingId, table.lastReadAt),
  ]
)

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(accounts, {
    fields: [follows.followerId],
    references: [accounts.id],
    relationName: 'follower',
  }),
  following: one(accounts, {
    fields: [follows.followingId],
    references: [accounts.id],
    relationName: 'following',
  }),
}))

export const insertFollowSchema = createInsertSchema(follows).refine(
  (data) => data.followerId !== data.followingId,
  {
    message: 'Users cannot follow themselves',
    path: ['followingId'],
  }
)

export const selectFollowSchema = createSelectSchema(follows)

export type Follow = typeof follows.$inferSelect
export type NewFollow = typeof follows.$inferInsert
