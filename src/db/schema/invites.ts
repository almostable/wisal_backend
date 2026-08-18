import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { admins } from './admins'
import { accounts } from './accounts'

export const invites = pgTable(
  'invites',
  {
    id: snowflakePrimaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdById: snowflakeId('created_by_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    usedById: snowflakeId('used_by_id')
      .references(() => accounts.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invites_code_unique_idx').on(table.code),
    index('invites_created_by_id_idx').on(table.createdById),
    index('invites_used_by_id_idx').on(table.usedById),
    index('invites_created_at_idx').on(table.createdAt),
    index('invites_expires_at_idx').on(table.expiresAt),
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

export const inviteCodeSchema = z
  .string()
  .min(8, 'Invite code must be at least 8 characters long')
  .max(64, 'Invite code is too long')
  .trim()

export const insertInviteSchema = createInsertSchema(invites, {
  code: () => inviteCodeSchema,
})

export const selectInviteSchema = createSelectSchema(invites)

export type Invite = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert
