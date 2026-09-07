import { pgTable, timestamp, primaryKey, check, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { profiles } from './profiles'

export const profileBlocks = pgTable(
  'profile_blocks',
  {
    blockerProfileId: snowflakeId('blocker_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blockedProfileId: snowflakeId('blocked_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'profile_blocks_blocker_profile_id_blocked_profile_id_pk',
      columns: [table.blockerProfileId, table.blockedProfileId],
    }),
    check('profile_blocks_prevent_self_block_check', sql`${table.blockerProfileId} != ${table.blockedProfileId}`),
    index('profile_blocks_blocked_profile_id_idx').on(table.blockedProfileId),
    index('profile_blocks_created_at_idx').on(table.createdAt),
  ]
)

export const profileBlocksRelations = relations(profileBlocks, ({ one }) => ({
  blocker: one(profiles, {
    fields: [profileBlocks.blockerProfileId],
    references: [profiles.id],
    relationName: 'blocker',
  }),
  blocked: one(profiles, {
    fields: [profileBlocks.blockedProfileId],
    references: [profiles.id],
    relationName: 'blocked',
  }),
}))

export const insertProfileBlockSchema = createInsertSchema(profileBlocks).refine(
  (data) => data.blockerProfileId !== data.blockedProfileId,
  {
    message: 'Profiles cannot block themselves',
    path: ['blockedProfileId'],
  }
)

export const selectProfileBlockSchema = createSelectSchema(profileBlocks)

export type ProfileBlock = typeof profileBlocks.$inferSelect
export type NewProfileBlock = typeof profileBlocks.$inferInsert
