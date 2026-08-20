import { pgTable, varchar, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps, emailSchema } from './common'
import { sessions } from './sessions'
import { profiles } from './profiles'
import { invites } from './invites'
import { follows } from './follows'
import { posts } from './posts'
import { postLikes } from './post-likes'

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
    index('accounts_created_at_idx').on(table.createdAt),
  ]
)

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  sessions: many(sessions),
  profile: one(profiles),
  usedInvites: many(invites, { relationName: 'usedBy' }),
  invites: many(invites, { relationName: 'inviter' }),
  followers: many(follows, { relationName: 'following' }),
  following: many(follows, { relationName: 'follower' }),
  posts: many(posts),
  postLikes: many(postLikes),
}))

export { emailSchema }

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
