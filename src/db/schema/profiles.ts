import { pgTable, varchar, boolean, text } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { accounts } from './accounts'
import { identities, identityFormatSchema, type Identity } from './identities'

export const profiles = pgTable('profiles', {
  id: snowflakePrimaryKey(),
  accountId: snowflakeId('account_id')
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }),
  isMale: boolean('is_male'),
  avatarKey: text('avatar_key'),
  description: text('description'),
  identityId: snowflakeId('identity_id')
    .unique()
    .references(() => identities.id, { onDelete: 'restrict' }),
  ...timestamps,
})

export const profilesRelations = relations(profiles, ({ one }) => ({
  account: one(accounts, {
    fields: [profiles.accountId],
    references: [accounts.id],
  }),
  identity: one(identities, {
    fields: [profiles.identityId],
    references: [identities.id],
  }),
}))

export const nameSchema = z
  .string()
  .min(1, 'Name cannot be empty')
  .max(100, 'Name must be at most 100 characters')
  .trim()

export const descriptionSchema = z
  .string()
  .max(500, 'Description must be at most 500 characters')
  .trim()

export const onboardingInputSchema = z.object({
  name: nameSchema,
  isMale: z.boolean({
    message: 'is_male (gender) is required and must be a boolean',
  }),
  identity: identityFormatSchema,
  avatarKey: z.string().nullable().optional(),
  description: descriptionSchema.nullable().optional(),
})

export const updateProfileInputSchema = z.object({
  name: nameSchema.optional(),
  avatarKey: z.string().nullable().optional(),
  description: descriptionSchema.nullable().optional(),
  isMale: z.boolean().optional(),
})

export const insertProfileSchema = createInsertSchema(profiles)
export const selectProfileSchema = createSelectSchema(profiles)

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type OnboardingInput = z.infer<typeof onboardingInputSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>

export interface ProfileWithIdentity extends Profile {
  identity: Identity | null
}
