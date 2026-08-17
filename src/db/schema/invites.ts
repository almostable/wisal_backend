import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { admins } from './admins'
import { accounts } from './accounts'

/**
 * Invites table definition
 * - id: 64-bit Snowflake ID (bigint)
 * - code: unique invite code string (min 8 characters)
 * - expires_at: timestamp when the invite expires (NOT NULL)
 * - created_by_id: foreign key referencing admins.id (NOT NULL)
 * - used_by_id: foreign key referencing accounts.id (NULL until consumed)
 * - used_at: timestamp when the invite was used (NULL until consumed)
 * - created_at, updated_at: standard timestamps with timezone
 */
export const invites = pgTable(
  'invites',
  {
    id: snowflakePrimaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdById: snowflakeId('created_by_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    usedById: snowflakeId('used_by_id')
      .references(() => accounts.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invites_code_unique_idx').on(table.code),
    index('invites_created_by_id_idx').on(table.createdById),
    index('invites_used_by_id_idx').on(table.usedById),
  ]
)

export const invitesRelations = relations(invites, ({ one }) => ({
  creator: one(admins, {
    fields: [invites.createdById],
    references: [admins.id],
  }),
  usedBy: one(accounts, {
    fields: [invites.usedById],
    references: [accounts.id],
  }),
}))

// Zod schemas for runtime validation
export const inviteCodeSchema = z
  .string()
  .min(8, 'Invite code must be at least 8 characters long')
  .max(64, 'Invite code is too long')
  .trim()

export const insertInviteSchema = createInsertSchema(invites, {
  code: () => inviteCodeSchema,
})

export const selectInviteSchema = createSelectSchema(invites)

// Inferred TypeScript types
export type Invite = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert
