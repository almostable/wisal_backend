import { pgTable, varchar, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps, emailSchema } from './common'
import { adminSessions } from './admin-sessions'
import { invites } from './invites'

export const ADMIN_ROLES = ['admin', 'moderator'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const adminRoleEnum = pgEnum('admin_role', ADMIN_ROLES)

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
    index('admins_created_at_idx').on(table.createdAt),
  ]
)

export const adminsRelations = relations(admins, ({ many }) => ({
  sessions: many(adminSessions),
  invitesCreated: many(invites),
}))

export const adminEmailSchema = emailSchema

export const adminRawPasswordSchema = z
  .string()
  .min(16, 'Password must be at least 16 characters long')
  .max(128, 'Password must be at most 128 characters long')

export const adminRoleSchema = z.enum(ADMIN_ROLES)

export const insertAdminSchema = createInsertSchema(admins, {
  email: () => adminEmailSchema,
  password: () => adminRawPasswordSchema,
  role: () => adminRoleSchema.optional(),
})

export const selectAdminSchema = createSelectSchema(admins)

export const safeAdminSchema = selectAdminSchema.omit({ password: true })

export type Admin = typeof admins.$inferSelect
export type NewAdmin = typeof admins.$inferInsert
export type SafeAdmin = z.infer<typeof safeAdminSchema>
