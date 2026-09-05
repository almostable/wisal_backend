import { pgTable, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { accounts } from './accounts'
import { posts } from './posts'

export const postViews = pgTable(
  'post_views',
  {
    postId: snowflakeId('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: snowflakeId('user_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'post_views_post_id_user_id_pk',
      columns: [table.postId, table.userId],
    }),
    index('post_views_user_id_idx').on(table.userId),
    index('post_views_created_at_idx').on(table.createdAt),
  ]
)

export const postViewsRelations = relations(postViews, ({ one }) => ({
  post: one(posts, {
    fields: [postViews.postId],
    references: [posts.id],
  }),
  user: one(accounts, {
    fields: [postViews.userId],
    references: [accounts.id],
  }),
}))

export const insertPostViewSchema = createInsertSchema(postViews)
export const selectPostViewSchema = createSelectSchema(postViews)

export type PostView = typeof postViews.$inferSelect
export type NewPostView = typeof postViews.$inferInsert
