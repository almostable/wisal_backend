import { pgTable, varchar, boolean, text, jsonb, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { profiles } from './profiles'
import { postSaves } from './post-saves'
import { postViews } from './post-views'
import { postLikes } from './post-likes'

export const POST_TYPES = ['text', 'media'] as const
export type PostType = (typeof POST_TYPES)[number]

export interface MediaItem {
  fileKey: string
  width: number
  height: number
}

export interface MediaPayload {
  media: MediaItem[]
}

export const GENDER_SCOPES = ['all', 'same_gender'] as const
export type GenderScope = (typeof GENDER_SCOPES)[number]

export const posts = pgTable(
  'posts',
  {
    id: snowflakePrimaryKey(),
    authorId: snowflakeId('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    authorGender: boolean('author_gender').notNull(),
    type: varchar('type', { length: 32 }).notNull().default('text'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    content: text('content').notNull().default(''),
    genderScope: varchar('gender_scope', { length: 32 }).notNull().default('all'),
    isFeed: boolean('is_feed').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    savesCount: integer('saves_count').notNull().default(0),
    likesCount: integer('likes_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    viewsCount: integer('views_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('posts_author_id_idx').on(table.authorId),
    index('posts_created_at_idx').on(table.createdAt),
    index('posts_deleted_at_idx').on(table.deletedAt),
    index('posts_gender_scope_idx').on(table.genderScope),
    index('posts_is_pinned_idx').on(table.isPinned),
    index('posts_saves_count_idx').on(table.savesCount),
    index('posts_likes_count_idx').on(table.likesCount),
    index('posts_comments_count_idx').on(table.commentsCount),
    index('posts_views_count_idx').on(table.viewsCount),
    uniqueIndex('posts_author_pinned_unique_idx')
      .on(table.authorId)
      .where(sql`${table.isPinned} = true AND ${table.deletedAt} IS NULL`),
    index('idx_posts_author_unread_scan')
      .on(table.authorId, table.id, table.genderScope, table.authorGender)
      .where(sql`${table.deletedAt} IS NULL`),
    index('posts_feed_idx')
      .on(table.createdAt)
      .where(sql`${table.isFeed} = true AND ${table.deletedAt} IS NULL`),
  ]
)

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(profiles, {
    fields: [posts.authorId],
    references: [profiles.id],
  }),
  saves: many(postSaves),
  views: many(postViews),
  likes: many(postLikes),
}))

export const postContentSchema = z
  .string()
  .trim()
  .min(8, 'Content must be at least 8 characters')
  .max(5000, 'Content must be at most 5000 characters')

export const insertPostSchema = createInsertSchema(posts, {
  type: () => z.enum(POST_TYPES).default('text'),
  genderScope: () => z.enum(GENDER_SCOPES).default('all'),
  isFeed: () => z.boolean().default(false).optional(),
  payload: () => z.record(z.string(), z.unknown()).default({}),
  content: () => postContentSchema,
})

export const selectPostSchema = createSelectSchema(posts)

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
