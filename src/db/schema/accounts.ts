import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps } from './common'
import { sessions } from './sessions'
import { profiles } from './profiles'

/**
 * Account table definition
 * - id: 64-bit Snowflake ID (bigint)
 * - email: case-insensitive unique email (enforced via functional index on lower(email))
 * - password: encrypted hash (Argon2id)
 * - created_at, updated_at: standard timestamps with timezone
 */
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
}))

// Base Zod validators with email trimming, lowercasing, and RFC 5322 validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(255, 'Email is too long')
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.email('Invalid email address'))

export const rawPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long')

// Zod schemas for runtime validation
export const insertAccountSchema = createInsertSchema(accounts, {
  email: () => emailSchema,
  password: () => rawPasswordSchema,
})

export const selectAccountSchema = createSelectSchema(accounts)

export const safeAccountSchema = selectAccountSchema.omit({ password: true })

// Inferred TypeScript types
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type SafeAccount = z.infer<typeof safeAccountSchema>
