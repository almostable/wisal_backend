import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps } from './common'

export const identities = pgTable(
  'identities',
  {
    id: snowflakePrimaryKey(),
    identity: varchar('identity', { length: 32 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identities_identity_unique_idx').on(sql`lower(${table.identity})`),
  ]
)

export const RESERVED_IDENTITIES = [
  'admin',
  'administrator',
  'system',
  'root',
  'support',
  'help',
  'wisal',
  'api',
  'bot',
  'moderator',
  'mod',
  'official',
  'staff',
  'feed',
  'search',
  'null',
  'undefined',
  'me',
  'onboarding',
  'invites',
  'blocks',
  'followers',
  'following',
  'check',
  'views',
  'saves',
] as const

export const createIdentityFormatSchema = (isVerified: boolean = false) => {
  const minLength = isVerified ? 3 : 5
  return z
    .string()
    .transform((val) => val.trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(minLength, `Identity must be at least ${minLength} characters long`)
        .max(32, 'Identity must be at most 32 characters long')
        .regex(/^[a-z]/, 'Identity must start with a letter')
        .regex(/^[a-z0-9_]+$/, 'Identity can only contain letters, numbers, and underscores')
        .refine(
          (val) => !RESERVED_IDENTITIES.includes(val as (typeof RESERVED_IDENTITIES)[number]),
          { message: 'This identity is reserved and cannot be used' }
        )
    )
}

export const identityFormatSchema = createIdentityFormatSchema(true)
export const standardIdentityFormatSchema = createIdentityFormatSchema(false)

export const insertIdentitySchema = createInsertSchema(identities, {
  identity: () => identityFormatSchema,
})

export const selectIdentitySchema = createSelectSchema(identities)

export type Identity = typeof identities.$inferSelect
export type NewIdentity = typeof identities.$inferInsert
