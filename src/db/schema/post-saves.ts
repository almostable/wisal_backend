import { pgTable, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { profiles } from './profiles'
import { posts } from './posts'

export const postSaves = pgTable(
  'post_saves',
  {
    postId: snowflakeId('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    profileId: snowflakeId('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'post_saves_post_id_profile_id_pk',
      columns: [table.postId, table.profileId],
    }),
    index('post_saves_profile_id_idx').on(table.profileId),
    index('post_saves_created_at_idx').on(table.createdAt),
  ]
)

export const postSavesRelations = relations(postSaves, ({ one }) => ({
  post: one(posts, {
    fields: [postSaves.postId],
    references: [posts.id],
  }),
  profile: one(profiles, {
    fields: [postSaves.profileId],
    references: [profiles.id],
  }),
}))

export const insertPostSaveSchema = createInsertSchema(postSaves)
export const selectPostSaveSchema = createSelectSchema(postSaves)

export type PostSave = typeof postSaves.$inferSelect
export type NewPostSave = typeof postSaves.$inferInsert
