import { z } from 'zod'
import { createPaginationSchema } from '../../db/schema/common'
import {
  POST_TYPES,
  GENDER_SCOPES,
  ACCESS_LEVELS,
  postContentSchema,
} from '../../db/schema/posts'
import {
  COMMENT_TYPES,
  commentContentSchema,
} from '../../db/schema/comments'

export const postIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid post ID format'),
})

export const commentIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid comment ID format'),
})

export const userPostsParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const createPostSchema = z.object({
  content: postContentSchema,
  type: z.enum(POST_TYPES).default('text').optional(),
  payload: z.record(z.string(), z.unknown()).default({}).optional(),
  genderScope: z.enum(GENDER_SCOPES).default('all').optional(),
  accessLevel: z.enum(ACCESS_LEVELS).default('public').optional(),
  isPinned: z.boolean().default(false).optional(),
})

export const updatePostSchema = z.object({
  content: postContentSchema.optional(),
  genderScope: z.enum(GENDER_SCOPES).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).optional(),
  isPinned: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const pinPostSchema = z.object({
  isPinned: z.boolean().default(true),
})

export const feedQuerySchema = createPaginationSchema(20, 100).extend({
  feed: z.enum(['public', 'following']).default('public').optional(),
  type: z.enum(['public', 'following']).optional(),
})

export const userPostsQuerySchema = createPaginationSchema(20, 100)

export const createCommentSchema = z.object({
  content: commentContentSchema,
  parentId: z.string().regex(/^\d{1,20}$/, 'Invalid parent ID format').nullable().optional(),
  type: z.enum(COMMENT_TYPES).default('text').optional(),
  payload: z.record(z.string(), z.unknown()).default({}).optional(),
})

export const replyCommentSchema = z.object({
  content: commentContentSchema,
  type: z.enum(COMMENT_TYPES).default('text').optional(),
  payload: z.record(z.string(), z.unknown()).default({}).optional(),
})

export const updateCommentSchema = z.object({
  content: commentContentSchema.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const listCommentsQuerySchema = createPaginationSchema(50, 100)

export type PostIdParam = z.infer<typeof postIdParamSchema>
export type CommentIdParam = z.infer<typeof commentIdParamSchema>
export type UserPostsParam = z.infer<typeof userPostsParamSchema>
export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type PinPostInput = z.infer<typeof pinPostSchema>
export type FeedQueryInput = z.infer<typeof feedQuerySchema>
export type UserPostsQueryInput = z.infer<typeof userPostsQuerySchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type ReplyCommentInput = z.infer<typeof replyCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type ListCommentsQueryInput = z.infer<typeof listCommentsQuerySchema>
