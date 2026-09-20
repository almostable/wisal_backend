import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps, emailSchema } from './common'
import { sessions } from './sessions'
import { profiles } from './profiles'
import { invites } from './invites'

export const accounts = pgTable(
  'accounts',
  {
    id: snowflakePrimaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    bannedAt: timestamp('banned_at', { withTimezone: true, mode: 'date' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('accounts_email_unique_idx').on(sql`lower(${table.email})`),
    index('accounts_created_at_idx').on(table.createdAt),
    index('accounts_deleted_at_idx').on(table.deletedAt),
    index('accounts_banned_at_idx').on(table.bannedAt),
  ]
)

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  sessions: many(sessions),
  profile: one(profiles),
  usedInvites: many(invites, { relationName: 'usedBy' }),
  invites: many(invites, { relationName: 'inviter' }),
}))

export { emailSchema }

export const rawPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must be at most 128 characters long')

export const insertAccountSchema = createInsertSchema(accounts, {
  email: () => emailSchema,
  passwordHash: () => z.string().min(1, 'Password hash is required'),
})

export const selectAccountSchema = createSelectSchema(accounts)

export const safeAccountSchema = selectAccountSchema.omit({ passwordHash: true })

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type SafeAccount = z.infer<typeof safeAccountSchema>
