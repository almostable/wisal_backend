import { pgTable, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId } from './common'
import { accounts } from './accounts'
import { admins } from './admins'

export const RESTRICTION_TYPES = ['ban'] as const
export type RestrictionType = (typeof RESTRICTION_TYPES)[number]

export const userRestrictions = pgTable(
  'user_restrictions',
  {
    id: snowflakePrimaryKey(),
    accountId: snowflakeId('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    adminId: snowflakeId('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    type: varchar('type', { length: 32 }).notNull().default('ban'),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedById: snowflakeId('revoked_by_id').references(() => admins.id, { onDelete: 'set null' }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_restrictions_account_active_idx').on(table.accountId, table.isActive),
    index('user_restrictions_is_active_expires_idx').on(table.isActive, table.expiresAt),
    index('user_restrictions_created_at_idx').on(table.createdAt),
  ]
)

export const userRestrictionsRelations = relations(userRestrictions, ({ one }) => ({
  account: one(accounts, {
    fields: [userRestrictions.accountId],
    references: [accounts.id],
  }),
  admin: one(admins, {
    fields: [userRestrictions.adminId],
    references: [admins.id],
    relationName: 'banningAdmin',
  }),
  revokedBy: one(admins, {
    fields: [userRestrictions.revokedById],
    references: [admins.id],
    relationName: 'revokingAdmin',
  }),
}))

export const insertUserRestrictionSchema = createInsertSchema(userRestrictions, {
  type: () => z.enum(RESTRICTION_TYPES).default('ban'),
  reason: () => z.string().trim().min(1, 'Reason is required'),
})

export const selectUserRestrictionSchema = createSelectSchema(userRestrictions)

export type UserRestriction = typeof userRestrictions.$inferSelect
export type NewUserRestriction = typeof userRestrictions.$inferInsert
