import { pgTable, timestamp, primaryKey, check, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { accounts } from './accounts'

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: snowflakeId('blocker_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    blockedId: snowflakeId('blocked_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'user_blocks_blocker_id_blocked_id_pk',
      columns: [table.blockerId, table.blockedId],
    }),
    check('user_blocks_prevent_self_block_check', sql`${table.blockerId} != ${table.blockedId}`),
    index('user_blocks_blocked_id_idx').on(table.blockedId),
    index('user_blocks_created_at_idx').on(table.createdAt),
  ]
)

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(accounts, {
    fields: [userBlocks.blockerId],
    references: [accounts.id],
    relationName: 'blocker',
  }),
  blocked: one(accounts, {
    fields: [userBlocks.blockedId],
    references: [accounts.id],
    relationName: 'blocked',
  }),
}))

export const insertUserBlockSchema = createInsertSchema(userBlocks).refine(
  (data) => data.blockerId !== data.blockedId,
  {
    message: 'Users cannot block themselves',
    path: ['blockedId'],
  }
)

export const selectUserBlockSchema = createSelectSchema(userBlocks)

export type UserBlock = typeof userBlocks.$inferSelect
export type NewUserBlock = typeof userBlocks.$inferInsert
