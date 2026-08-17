import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps } from './common'
import { sessions } from './sessions'
import { profiles } from './profiles'
import { invites } from './invites'

export const accounts = pgTable(
  'accounts',
  {
    id: snowflakePrimaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('accounts_email_unique_idx').on(sql`lower(${table.email})`),
  ]
)

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  sessions: many(sessions),
  profile: one(profiles),
  usedInvites: many(invites),
}))

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(255, 'Email is too long')
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.string().email('Invalid email address'))

export const rawPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must be at most 128 characters long')

export const insertAccountSchema = createInsertSchema(accounts, {
  email: () => emailSchema,
  password: () => rawPasswordSchema,
})

export const selectAccountSchema = createSelectSchema(accounts)

export const safeAccountSchema = selectAccountSchema.omit({ password: true })

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type SafeAccount = z.infer<typeof safeAccountSchema>
