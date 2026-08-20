import { z } from 'zod'
import {
  POST_TYPES,
  GENDER_SCOPES,
  ACCESS_LEVELS,
  postContentSchema,
} from '../../db/schema/posts'

export const postIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid post ID format'),
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

export const feedQuerySchema = z.object({
  feed: z.enum(['public', 'following']).default('public').optional(),
  type: z.enum(['public', 'following']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const userPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type PostIdParam = z.infer<typeof postIdParamSchema>
export type UserPostsParam = z.infer<typeof userPostsParamSchema>
export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type PinPostInput = z.infer<typeof pinPostSchema>
export type FeedQueryInput = z.infer<typeof feedQuerySchema>
export type UserPostsQueryInput = z.infer<typeof userPostsQuerySchema>
