import { z } from 'zod'
import { createPaginationSchema, snowflakeParamSchema, snowflakeIdSchema, MAX_PG_BIGINT } from '../../db/schema/common'
import {
  POST_TYPES,
  GENDER_SCOPES,
} from '../../db/schema/posts'
import {
  COMMENT_TYPES,
} from '../../db/schema/comments'
import { postMediaPayloadSchema, commentMediaPayloadSchema } from '../uploads/schema'

export const postIdParamSchema = snowflakeParamSchema
export const commentIdParamSchema = snowflakeParamSchema

export const userPostsParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export function validateCommentMediaOrText(
  data: { type?: string; content?: string | null; payload?: Record<string, unknown> },
  ctx: z.RefinementCtx
) {
  const itemType = data.type ?? 'text'
  if (itemType === 'text') {
    if (!data.content || data.content.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Content cannot be empty',
        path: ['content'],
      })
    }
  } else if (itemType === 'media') {
    const parsedPayload = commentMediaPayloadSchema.safeParse(data.payload)
    if (!parsedPayload.success) {
      for (const issue of parsedPayload.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['payload', ...issue.path],
        })
      }
    }
  }
}

export function transformPostMediaOrText<
  T extends {
    type?: string
    content?: string | null
    payload?: Record<string, unknown>
    isFeed?: boolean
    showInFeed?: boolean
  },
>(data: T) {
  const itemType = data.type ?? 'text'
  const effectiveIsFeed =
    data.isFeed !== undefined ? data.isFeed : data.showInFeed !== undefined ? data.showInFeed : undefined

  if (itemType === 'media') {
    const parsedPayload = postMediaPayloadSchema.parse(data.payload)
    return {
      ...data,
      type: 'media' as const,
      content: data.content ? data.content.trim() : '',
      payload: parsedPayload,
      ...(effectiveIsFeed !== undefined ? { isFeed: effectiveIsFeed } : {}),
    }
  }
  return {
    ...data,
    type: 'text' as const,
    content: data.content ? data.content.trim() : '',
    payload: data.payload ?? {},
    ...(effectiveIsFeed !== undefined ? { isFeed: effectiveIsFeed } : {}),
  }
}

export function transformCommentMediaOrText<
  T extends {
    type?: string
    content?: string | null
    payload?: Record<string, unknown>
  },
>(data: T) {
  const itemType = data.type ?? 'text'
  if (itemType === 'media') {
    const parsedPayload = commentMediaPayloadSchema.parse(data.payload)
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
}

export const transformMediaOrText = transformPostMediaOrText

export const createPostSchema = z
  .object({
    type: z.enum(POST_TYPES).default('text').optional(),
    content: z
      .string()
      .trim()
      .min(8, 'Content must be at least 8 characters')
      .max(5000, 'Content must be at most 5000 characters'),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
    genderScope: z.enum(GENDER_SCOPES).default('all').optional(),
    isFeed: z.boolean().optional(),
    showInFeed: z.boolean().optional(),
    isPinned: z.boolean().default(false).optional(),
  })
  .superRefine((data, ctx) => {
    const effectiveIsFeed =
      data.isFeed !== undefined ? data.isFeed : data.showInFeed !== undefined ? data.showInFeed : false

    if (effectiveIsFeed && data.content.trim().length < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Posts published to the public feed must contain at least 100 characters',
        path: ['content'],
      })
    }

    if (data.type === 'media') {
      const parsedPayload = postMediaPayloadSchema.safeParse(data.payload)
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
  .transform(transformPostMediaOrText)

export const updatePostSchema = z
  .object({
    type: z.enum(POST_TYPES).optional(),
    content: z
      .string()
      .trim()
      .min(8, 'Content must be at least 8 characters')
      .max(5000, 'Content must be at most 5000 characters')
      .nullable()
      .optional(),
    genderScope: z.enum(GENDER_SCOPES).optional(),
    isFeed: z.boolean().optional(),
    showInFeed: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    const effectiveIsFeed =
      data.isFeed !== undefined ? data.isFeed : data.showInFeed !== undefined ? data.showInFeed : undefined

    if (effectiveIsFeed === true && data.content !== undefined && data.content !== null && data.content.trim().length < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Posts published to the public feed must contain at least 100 characters',
        path: ['content'],
      })
    }

    if (data.type === 'media' && data.payload !== undefined) {
      const parsedPayload = postMediaPayloadSchema.safeParse(data.payload)
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
    const effectiveIsFeed =
      data.isFeed !== undefined ? data.isFeed : data.showInFeed !== undefined ? data.showInFeed : undefined

    let result = {
      ...data,
      ...(effectiveIsFeed !== undefined ? { isFeed: effectiveIsFeed } : {}),
    }

    if (data.type === 'media' && data.payload !== undefined) {
      const parsedPayload = postMediaPayloadSchema.parse(data.payload)
      result = {
        ...result,
        payload: parsedPayload,
      }
    }
    return result
  })

export const pinPostSchema = z.object({
  isPinned: z.boolean().default(true),
})

export const userPostsQuerySchema = createPaginationSchema(20, 100)

export const savedPostsQuerySchema = createPaginationSchema(20, 100)

export const createCommentSchema = z
  .object({
    type: z.enum(COMMENT_TYPES).default('text').optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
    parentId: snowflakeIdSchema.nullable().optional(),
  })
  .superRefine(validateCommentMediaOrText)
  .transform(transformCommentMediaOrText)

export const updateCommentSchema = z
  .object({
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payload !== undefined) {
      const parsedPayload = commentMediaPayloadSchema.safeParse(data.payload)
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
    if (data.payload !== undefined) {
      const parsedPayload = commentMediaPayloadSchema.parse(data.payload)
      return {
        ...data,
        content: data.content !== undefined ? (data.content ? data.content.trim() : '') : undefined,
        payload: parsedPayload,
      }
    }
    return {
      ...data,
      content: data.content !== undefined ? (data.content ? data.content.trim() : '') : undefined,
    }
  })

export const listCommentsQuerySchema = createPaginationSchema(50, 100)

export const recordViewsSchema = z.object({
  postIds: z
    .array(snowflakeIdSchema)
    .min(1, 'At least 1 post ID is required')
    .max(100, 'Maximum 100 post IDs allowed'),
})

export const feedQuerySchema = createPaginationSchema(20, 100).extend({
  cursor: z
    .string()
    .regex(/^\d{1,19}$/, 'Invalid cursor format')
    .refine((val) => {
      try {
        const b = BigInt(val)
        return b > 0n && b <= MAX_PG_BIGINT
      } catch {
        return false
      }
    }, 'Invalid cursor range')
    .optional(),
})

export type PostIdParam = z.infer<typeof postIdParamSchema>
export type CommentIdParam = z.infer<typeof commentIdParamSchema>
export type UserPostsParam = z.infer<typeof userPostsParamSchema>
export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type PinPostInput = z.infer<typeof pinPostSchema>
export type UserPostsQueryInput = z.infer<typeof userPostsQuerySchema>
export type SavedPostsQueryInput = z.infer<typeof savedPostsQuerySchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type ListCommentsQueryInput = z.infer<typeof listCommentsQuerySchema>
export type RecordViewsInput = z.infer<typeof recordViewsSchema>
export type FeedQueryInput = z.infer<typeof feedQuerySchema>

