import { pgTable, varchar, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { accounts } from './accounts'
import { posts } from './posts'

export const COMMENT_TYPES = ['text', 'media'] as const
export type CommentType = (typeof COMMENT_TYPES)[number]

export const comments = pgTable(
  'comments',
  {
    id: snowflakePrimaryKey(),
    postId: snowflakeId('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: snowflakeId('author_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    rootId: snowflakeId('root_id').references((): any => comments.id, {
      onDelete: 'cascade',
    }),
    branchId: snowflakeId('branch_id').references((): any => comments.id, {
      onDelete: 'cascade',
    }),
    parentId: snowflakeId('parent_id').references((): any => comments.id, {
      onDelete: 'cascade',
    }),
    replyToUserId: snowflakeId('reply_to_user_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    type: varchar('type', { length: 32 }).notNull().default('text'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    content: text('content').notNull().default(''),
    repliesCount: integer('replies_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('comments_post_id_idx').on(table.postId),
    index('comments_author_id_idx').on(table.authorId),
    index('comments_root_id_idx').on(table.rootId),
    index('comments_branch_id_idx').on(table.branchId),
    index('comments_parent_id_idx').on(table.parentId),
    index('comments_reply_to_user_id_idx').on(table.replyToUserId),
    index('comments_replies_count_idx').on(table.repliesCount),
    index('comments_created_at_idx').on(table.createdAt),
    index('comments_deleted_at_idx').on(table.deletedAt),
  ]
)

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(accounts, {
    fields: [comments.authorId],
    references: [accounts.id],
  }),
  root: one(comments, {
    fields: [comments.rootId],
    references: [comments.id],
    relationName: 'comment_root',
  }),
  branch: one(comments, {
    fields: [comments.branchId],
    references: [comments.id],
    relationName: 'comment_branch',
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'comment_replies',
  }),
  replies: many(comments, {
    relationName: 'comment_replies',
  }),
  replyToUser: one(accounts, {
    fields: [comments.replyToUserId],
    references: [accounts.id],
  }),
}))

export const commentContentSchema = z
  .string()
  .trim()
  .min(1, 'Content cannot be empty')
  .max(5000, 'Content must be at most 5000 characters')

export const insertCommentSchema = createInsertSchema(comments, {
  type: () => z.enum(COMMENT_TYPES).default('text'),
  payload: () => z.record(z.string(), z.unknown()).default({}),
  content: () => commentContentSchema,
})

export const selectCommentSchema = createSelectSchema(comments)

export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
