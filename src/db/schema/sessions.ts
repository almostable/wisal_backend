import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { accounts } from './accounts'

/**
 * Sessions table definition
 * - id: 64-bit Snowflake ID (bigint)
 * - account_id: foreign key referencing accounts.id (CASCADE on delete)
 * - token_hash: SHA-256 hash (64 hex characters) of the raw session token
 * - expires_at: timestamp when the session expires (default: 360 days)
 * - created_at, updated_at: standard timestamps
 */
export const sessions = pgTable(
  'sessions',
  {
    id: snowflakePrimaryKey(),
    accountId: snowflakeId('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique_idx').on(table.tokenHash),
    index('sessions_account_id_idx').on(table.accountId),
  ]
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
  account: one(accounts, {
    fields: [sessions.accountId],
    references: [accounts.id],
  }),
}))

// Zod schemas for runtime validation
export const insertSessionSchema = createInsertSchema(sessions)
export const selectSessionSchema = createSelectSchema(sessions)

// Inferred TypeScript types
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
