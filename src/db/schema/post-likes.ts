import { pgTable, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { profiles } from './profiles'
import { posts } from './posts'

export const postLikes = pgTable(
  'post_likes',
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
      name: 'post_likes_post_id_profile_id_pk',
      columns: [table.postId, table.profileId],
    }),
    index('post_likes_profile_id_idx').on(table.profileId),
    index('post_likes_created_at_idx').on(table.createdAt),
  ]
)

export const postLikesRelations = relations(postLikes, ({ one }) => ({
  post: one(posts, {
    fields: [postLikes.postId],
    references: [posts.id],
  }),
  profile: one(profiles, {
    fields: [postLikes.profileId],
    references: [profiles.id],
  }),
}))

export const insertPostLikeSchema = createInsertSchema(postLikes)
export const selectPostLikeSchema = createSelectSchema(postLikes)

export type PostLike = typeof postLikes.$inferSelect
export type NewPostLike = typeof postLikes.$inferInsert
