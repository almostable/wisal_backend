import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { admins } from './admins'

/**
 * Admin Sessions table definition
 * - id: 64-bit Snowflake ID (bigint)
 * - admin_id: foreign key referencing admins.id (CASCADE on delete)
 * - token_hash: SHA-256 hash (64 hex characters) of the raw session token
 * - expires_at: timestamp when the session expires (default: 30 days)
 * - created_at, updated_at: standard timestamps
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: snowflakePrimaryKey(),
    adminId: snowflakeId('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('admin_sessions_token_hash_unique_idx').on(table.tokenHash),
    index('admin_sessions_admin_id_idx').on(table.adminId),
  ]
)

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(admins, {
    fields: [adminSessions.adminId],
    references: [admins.id],
  }),
}))

// Zod schemas for runtime validation
export const insertAdminSessionSchema = createInsertSchema(adminSessions)
export const selectAdminSessionSchema = createSelectSchema(adminSessions)

// Inferred TypeScript types
export type AdminSession = typeof adminSessions.$inferSelect
export type NewAdminSession = typeof adminSessions.$inferInsert
