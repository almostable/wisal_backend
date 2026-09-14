import { pgTable, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { profiles } from './profiles'

export const feedCycles = pgTable(
  'feed_cycles',
  {
    id: snowflakePrimaryKey(),
    profileId: snowflakeId('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedBatches: integer('used_batches').notNull().default(1),
    servedPostIds: jsonb('served_post_ids').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [
    index('feed_cycles_profile_expires_idx').on(table.profileId, table.expiresAt),
    index('feed_cycles_created_at_idx').on(table.createdAt),
  ]
)

export const feedCyclesRelations = relations(feedCycles, ({ one }) => ({
  profile: one(profiles, {
    fields: [feedCycles.profileId],
    references: [profiles.id],
  }),
}))

export const insertFeedCycleSchema = createInsertSchema(feedCycles)
export const selectFeedCycleSchema = createSelectSchema(feedCycles)

export type FeedCycle = typeof feedCycles.$inferSelect
export type NewFeedCycle = typeof feedCycles.$inferInsert
