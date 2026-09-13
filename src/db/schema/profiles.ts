import { pgTable, varchar, boolean, text, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps, emailSchema } from './common'
import { accounts } from './accounts'
import { identities, identityFormatSchema, standardIdentityFormatSchema, type Identity } from './identities'
import { readers } from './readers'
import { posts } from './posts'
import { comments } from './comments'
import { postLikes } from './post-likes'
import { postSaves } from './post-saves'
import { mediaUploads } from './media-uploads'
import { reports } from './reports'
import { profileBlocks } from './profile-blocks'

export const urlSchema = z
  .string()
  .max(2048, 'URL is too long')
  .transform((val) => val.trim())
  .pipe(z.string().url('Invalid URL format'))

export const telegramUsernameSchema = z
  .string()
  .min(4, 'Telegram username must be at least 4 characters')
  .max(32, 'Telegram username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9_]{4,32}$/,
    'Telegram username must be 4-32 characters and contain only letters, numbers, and underscores (without @, spaces, or links)'
  )

export const contactsSchema = z.object({
  telegram: telegramUsernameSchema.nullable().optional(),
  youtube: urlSchema.nullable().optional(),
  website: urlSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
})

export type Contacts = z.infer<typeof contactsSchema>

export const profiles = pgTable(
  'profiles',
  {
    id: snowflakePrimaryKey(),
    accountId: snowflakeId('account_id')
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }),
    identity: varchar('identity', { length: 32 }),
    isMale: boolean('is_male'),
    avatarKey: text('avatar_key'),
    description: text('description'),
    contacts: jsonb('contacts').$type<Contacts>(),
    identityId: snowflakeId('identity_id')
      .unique()
      .references(() => identities.id, { onDelete: 'restrict' }),
    regularReadersCount: integer('regular_readers_count').notNull().default(0),
    readersCount: integer('readers_count').notNull().default(0),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    searchText: text('search_text').generatedAlwaysAs(
      sql`lower(coalesce(identity, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, ''))`
    ),
    ...timestamps,
  },
  (table) => [
    index('profiles_search_text_trgm_idx').using('gin', sql`${table.searchText} gin_trgm_ops`),
  ]
)

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  account: one(accounts, {
    fields: [profiles.accountId],
    references: [accounts.id],
  }),
  identity: one(identities, {
    fields: [profiles.identityId],
    references: [identities.id],
  }),
  readers: many(readers, { relationName: 'author' }),
  reading: many(readers, { relationName: 'reader' }),
  posts: many(posts),
  comments: many(comments),
  postLikes: many(postLikes),
  postSaves: many(postSaves),
  mediaUploads: many(mediaUploads),
  reportsFiled: many(reports, { relationName: 'reporter' }),
  reportsReceived: many(reports, { relationName: 'reportedProfile' }),
  blockedProfiles: many(profileBlocks, { relationName: 'blocker' }),
  blockedByProfiles: many(profileBlocks, { relationName: 'blocked' }),
}))

export const nameSchema = z
  .string()
  .min(1, 'Name cannot be empty')
  .max(100, 'Name must be at most 100 characters')
  .trim()

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description must be at least 1 character')
  .max(110, 'Description must be at most 110 characters')

export const onboardingInputSchema = z.object({
  name: nameSchema,
  isMale: z.boolean({
    message: 'is_male (gender) is required and must be a boolean',
  }),
  identity: standardIdentityFormatSchema,
  avatarKey: z.string().nullable().optional(),
  description: descriptionSchema.nullable().optional(),
  contacts: contactsSchema.nullable().optional(),
})

export const updateProfileInputSchema = z.object({
  name: nameSchema.optional(),
  identity: identityFormatSchema.optional(),
  avatarKey: z.string().nullable().optional(),
  description: descriptionSchema.nullable().optional(),
  isMale: z.boolean().optional(),
  contacts: contactsSchema.nullable().optional(),
})

export const insertProfileSchema = createInsertSchema(profiles)
export const selectProfileSchema = createSelectSchema(profiles)

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type OnboardingInput = z.infer<typeof onboardingInputSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>

export type ProfileWithIdentity = Omit<Profile, 'identity' | 'searchText'> & {
  identity: Identity | null
  searchText?: string | null
}
