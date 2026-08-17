import { pgTable, varchar, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps } from './common'
import { adminSessions } from './admin-sessions'
import { invites } from './invites'

export const ADMIN_ROLES = ['admin', 'moderator'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const adminRoleEnum = pgEnum('admin_role', ADMIN_ROLES)

/**
 * Admins table definition
 * - id: 64-bit Snowflake ID (bigint)
 * - email: case-insensitive unique email (enforced via functional index on lower(email))
 * - password: encrypted hash (Argon2id)
 * - role: role level ('admin' | 'moderator')
 * - created_at, updated_at: standard timestamps with timezone
 */
export const admins = pgTable(
  'admins',
  {
    id: snowflakePrimaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    role: adminRoleEnum('role').notNull().default('moderator'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('admins_email_unique_idx').on(sql`lower(${table.email})`),
  ]
)

export const adminsRelations = relations(admins, ({ many }) => ({
  sessions: many(adminSessions),
  invitesCreated: many(invites),
}))

// Base Zod validators with email trimming, lowercasing, and RFC 5322 validation
export const adminEmailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(255, 'Email is too long')
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.email('Invalid email address'))

export const adminRawPasswordSchema = z
  .string()
  .min(16, 'Password must be at least 16 characters long')
  .max(128, 'Password must be at most 128 characters long')

export const adminRoleSchema = z.enum(ADMIN_ROLES)

// Zod schemas for runtime validation
export const insertAdminSchema = createInsertSchema(admins, {
  email: () => adminEmailSchema,
  password: () => adminRawPasswordSchema,
  role: () => adminRoleSchema.optional(),
})

export const selectAdminSchema = createSelectSchema(admins)

export const safeAdminSchema = selectAdminSchema.omit({ password: true })

// Inferred TypeScript types
export type Admin = typeof admins.$inferSelect
export type NewAdmin = typeof admins.$inferInsert
export type SafeAdmin = z.infer<typeof safeAdminSchema>
