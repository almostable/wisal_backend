import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, timestamps } from './common'

/**
 * Identities table definition
 * Platform-wide unique username/handle system shared across users and communities.
 * - id: 64-bit Snowflake ID (bigint)
 * - identity: unique string identifier (case-insensitive via functional index on lower(identity))
 * - type: owner entity type ('user' | 'community')
 * - created_at, updated_at: standard timestamps
 */
export const identities = pgTable(
  'identities',
  {
    id: snowflakePrimaryKey(),
    identity: varchar('identity', { length: 32 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('user'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identities_identity_unique_idx').on(sql`lower(${table.identity})`),
  ]
)

// Zod validator for identity format: trims and lowercases before format check
export const identityFormatSchema = z
  .string()
  .transform((val) => val.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'Identity must be at least 3 characters long')
      .max(32, 'Identity must be at most 32 characters long')
      .regex(
        /^[a-z0-9_]+$/,
        'Identity can only contain letters, numbers, and underscores'
      )
  )

// Zod schemas for runtime validation
export const insertIdentitySchema = createInsertSchema(identities, {
  identity: () => identityFormatSchema,
})

export const selectIdentitySchema = createSelectSchema(identities)

// Inferred TypeScript types
export type Identity = typeof identities.$inferSelect
export type NewIdentity = typeof identities.$inferInsert
