import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { admins } from './admins'

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
    index('admin_sessions_expires_at_idx').on(table.expiresAt),
  ]
)

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  admin: one(admins, {
    fields: [adminSessions.adminId],
    references: [admins.id],
  }),
}))

export const insertAdminSessionSchema = createInsertSchema(adminSessions)
export const selectAdminSessionSchema = createSelectSchema(adminSessions)

export type AdminSession = typeof adminSessions.$inferSelect
export type NewAdminSession = typeof adminSessions.$inferInsert
