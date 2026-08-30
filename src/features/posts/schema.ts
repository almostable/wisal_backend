import { z } from 'zod'
import { createPaginationSchema } from '../../db/schema/common'
import {
  POST_TYPES,
  GENDER_SCOPES,
  ACCESS_LEVELS,
} from '../../db/schema/posts'
import {
  COMMENT_TYPES,
} from '../../db/schema/comments'
import { mediaPayloadSchema } from '../uploads/schema'

export const postIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid post ID format'),
})

export const commentIdParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid comment ID format'),
})

export const userPostsParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const createPostSchema = z
  .object({
    type: z.enum(POST_TYPES).default('text').optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
    genderScope: z.enum(GENDER_SCOPES).default('all').optional(),
    accessLevel: z.enum(ACCESS_LEVELS).default('public').optional(),
    isPinned: z.boolean().default(false).optional(),
  })
  .superRefine((data, ctx) => {
    const postType = data.type ?? 'text'
    if (postType === 'text') {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Content cannot be empty',
          path: ['content'],
        })
      }
    } else if (postType === 'media') {
      const parsedPayload = mediaPayloadSchema.safeParse(data.payload)
      if (!parsedPayload.success) {
        for (const issue of parsedPayload.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['payload', ...issue.path],
          })
        }
      }
    }
  })
  .transform((data) => {
    const postType = data.type ?? 'text'
    if (postType === 'media') {
      const parsedPayload = mediaPayloadSchema.parse(data.payload)
      return {
        ...data,
        type: 'media' as const,
        content: data.content ? data.content.trim() : '',
        payload: parsedPayload,
      }
    }
    return {
      ...data,
      type: 'text' as const,
      content: data.content ? data.content.trim() : '',
      payload: data.payload ?? {},
    }
  })

export const updatePostSchema = z
  .object({
    type: z.enum(POST_TYPES).optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    genderScope: z.enum(GENDER_SCOPES).optional(),
    accessLevel: z.enum(ACCESS_LEVELS).optional(),
    isPinned: z.boolean().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'media' && data.payload !== undefined) {
      const parsedPayload = mediaPayloadSchema.safeParse(data.payload)
      if (!parsedPayload.success) {
        for (const issue of parsedPayload.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['payload', ...issue.path],
          })
        }
      }
    } else if (data.type === 'text' && data.content !== undefined) {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Content cannot be empty',
          path: ['content'],
        })
      }
    }
  })
  .transform((data) => {
    if (data.type === 'media' && data.payload !== undefined) {
      const parsedPayload = mediaPayloadSchema.parse(data.payload)
      return {
        ...data,
        payload: parsedPayload,
      }
    }
    return data
  })

export const pinPostSchema = z.object({
  isPinned: z.boolean().default(true),
})

export const feedQuerySchema = createPaginationSchema(20, 100).extend({
  feed: z.enum(['public', 'following']).default('public').optional(),
  type: z.enum(['public', 'following']).optional(),
})

export const userPostsQuerySchema = createPaginationSchema(20, 100)

export const createCommentSchema = z
  .object({
    type: z.enum(COMMENT_TYPES).default('text').optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
    parentId: z.string().regex(/^\d{1,20}$/, 'Invalid parent ID format').nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const commentType = data.type ?? 'text'
    if (commentType === 'text') {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Content cannot be empty',
          path: ['content'],
        })
      }
    } else if (commentType === 'media') {
      const parsedPayload = mediaPayloadSchema.safeParse(data.payload)
      if (!parsedPayload.success) {
        for (const issue of parsedPayload.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['payload', ...issue.path],
          })
        }
      }
    }
  })
  .transform((data) => {
    const commentType = data.type ?? 'text'
    if (commentType === 'media') {
      const parsedPayload = mediaPayloadSchema.parse(data.payload)
      return {
        ...data,
        type: 'media' as const,
        content: data.content ? data.content.trim() : '',
        payload: parsedPayload,
      }
    }
    return {
      ...data,
      type: 'text' as const,
      content: data.content ? data.content.trim() : '',
      payload: data.payload ?? {},
    }
  })

export const replyCommentSchema = z
  .object({
    type: z.enum(COMMENT_TYPES).default('text').optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
  })
  .superRefine((data, ctx) => {
    const commentType = data.type ?? 'text'
    if (commentType === 'text') {
      if (!data.content || data.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Content cannot be empty',
          path: ['content'],
        })
      }
    } else if (commentType === 'media') {
      const parsedPayload = mediaPayloadSchema.safeParse(data.payload)
      if (!parsedPayload.success) {
        for (const issue of parsedPayload.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ['payload', ...issue.path],
          })
        }
      }
    }
  })
  .transform((data) => {
    const commentType = data.type ?? 'text'
    if (commentType === 'media') {
      const parsedPayload = mediaPayloadSchema.parse(data.payload)
      return {
        ...data,
        type: 'media' as const,
        content: data.content ? data.content.trim() : '',
        payload: parsedPayload,
      }
    }
    return {
      ...data,
      type: 'text' as const,
      content: data.content ? data.content.trim() : '',
      payload: data.payload ?? {},
    }
  })

export const updateCommentSchema = z
  .object({
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
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
