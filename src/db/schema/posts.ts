import { pgTable, varchar, boolean, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { accounts } from './accounts'
import { postLikes } from './post-likes'

export const POST_TYPES = ['text'] as const
export type PostType = (typeof POST_TYPES)[number]

export const GENDER_SCOPES = ['all', 'same_gender'] as const
export type GenderScope = (typeof GENDER_SCOPES)[number]

export const ACCESS_LEVELS = ['public', 'followers'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]

export const posts = pgTable(
  'posts',
  {
    id: snowflakePrimaryKey(),
    authorId: snowflakeId('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    authorGender: boolean('author_gender').notNull(),
    type: varchar('type', { length: 32 }).notNull().default('text'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    content: text('content').notNull(),
    genderScope: varchar('gender_scope', { length: 32 }).notNull().default('all'),
    accessLevel: varchar('access_level', { length: 32 }).notNull().default('public'),
    isPinned: boolean('is_pinned').notNull().default(false),
    likesCount: integer('likes_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    index('posts_author_id_idx').on(table.authorId),
    index('posts_created_at_idx').on(table.createdAt),
    index('posts_deleted_at_idx').on(table.deletedAt),
    index('posts_gender_scope_idx').on(table.genderScope),
    index('posts_access_level_idx').on(table.accessLevel),
    index('posts_is_pinned_idx').on(table.isPinned),
    index('posts_likes_count_idx').on(table.likesCount),
    index('posts_comments_count_idx').on(table.commentsCount),
  ]
)

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(accounts, {
    fields: [posts.authorId],
    references: [accounts.id],
  }),
  likes: many(postLikes),
}))

export const postContentSchema = z
  .string()
  .trim()
  .min(1, 'Content cannot be empty')
  .max(5000, 'Content must be at most 5000 characters')

export const insertPostSchema = createInsertSchema(posts, {
  type: () => z.enum(POST_TYPES).default('text'),
  genderScope: () => z.enum(GENDER_SCOPES).default('all'),
  accessLevel: () => z.enum(ACCESS_LEVELS).default('public'),
  payload: () => z.record(z.string(), z.unknown()).default({}),
  content: () => postContentSchema,
})

export const selectPostSchema = createSelectSchema(posts)

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
