import { pgTable, timestamp, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { accounts } from './accounts'
import { posts } from './posts'

export const postSaves = pgTable(
  'post_saves',
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
      name: 'post_saves_post_id_user_id_pk',
      columns: [table.postId, table.userId],
    }),
    index('post_saves_user_id_idx').on(table.userId),
    index('post_saves_created_at_idx').on(table.createdAt),
  ]
)

export const postSavesRelations = relations(postSaves, ({ one }) => ({
  post: one(posts, {
    fields: [postSaves.postId],
    references: [posts.id],
  }),
  user: one(accounts, {
    fields: [postSaves.userId],
    references: [accounts.id],
  }),
}))

export const insertPostSaveSchema = createInsertSchema(postSaves)
export const selectPostSaveSchema = createSelectSchema(postSaves)

export type PostSave = typeof postSaves.$inferSelect
export type NewPostSave = typeof postSaves.$inferInsert
