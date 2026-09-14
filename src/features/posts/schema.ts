import { z } from 'zod'
import { createPaginationSchema, snowflakeParamSchema } from '../../db/schema/common'
import {
  POST_TYPES,
  GENDER_SCOPES,
  ACCESS_LEVELS,
  FEED_CATEGORIES,
} from '../../db/schema/posts'
import {
  COMMENT_TYPES,
} from '../../db/schema/comments'
import { mediaPayloadSchema } from '../uploads/schema'

export const postIdParamSchema = snowflakeParamSchema
export const commentIdParamSchema = snowflakeParamSchema

export const userPostsParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export function validateMediaOrText(
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
}

export function transformMediaOrText<
  T extends {
    type?: string
    content?: string | null
    payload?: Record<string, unknown>
    category?: (typeof FEED_CATEGORIES)[number] | null
    feedCategory?: (typeof FEED_CATEGORIES)[number] | null
  },
>(data: T) {
  const itemType = data.type ?? 'text'
  const effectiveFeedCategory =
    data.category !== undefined ? data.category : data.feedCategory !== undefined ? data.feedCategory : undefined

  if (itemType === 'media') {
    const parsedPayload = mediaPayloadSchema.parse(data.payload)
    return {
      ...data,
      type: 'media' as const,
      content: data.content ? data.content.trim() : '',
      payload: parsedPayload,
      ...(effectiveFeedCategory !== undefined ? { feedCategory: effectiveFeedCategory } : {}),
    }
  }
  return {
    ...data,
    type: 'text' as const,
    content: data.content ? data.content.trim() : '',
    payload: data.payload ?? {},
    ...(effectiveFeedCategory !== undefined ? { feedCategory: effectiveFeedCategory } : {}),
  }
}

export const createPostSchema = z
  .object({
    type: z.enum(POST_TYPES).default('text').optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}).optional(),
    genderScope: z.enum(GENDER_SCOPES).default('all').optional(),
    accessLevel: z.enum(ACCESS_LEVELS).default('public').optional(),
    category: z.enum(FEED_CATEGORIES).nullable().optional(),
    feedCategory: z.enum(FEED_CATEGORIES).nullable().optional(),
    isPinned: z.boolean().default(false).optional(),
  })
  .superRefine((data, ctx) => {
    validateMediaOrText(data, ctx)
    const effectiveAccessLevel = data.accessLevel ?? 'public'
    const effectiveGenderScope = data.genderScope ?? 'all'
    if (effectiveAccessLevel === 'public' && effectiveGenderScope === 'same_gender') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "genderScope must be 'all' when accessLevel is 'public'",
        path: ['genderScope'],
      })
    }
  })
  .transform(transformMediaOrText)

export const updatePostSchema = z
  .object({
    type: z.enum(POST_TYPES).optional(),
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    genderScope: z.enum(GENDER_SCOPES).optional(),
    accessLevel: z.enum(ACCESS_LEVELS).optional(),
    category: z.enum(FEED_CATEGORIES).nullable().optional(),
    feedCategory: z.enum(FEED_CATEGORIES).nullable().optional(),
    isPinned: z.boolean().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accessLevel === 'public' && data.genderScope === 'same_gender') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "genderScope must be 'all' when accessLevel is 'public'",
        path: ['genderScope'],
      })
    }
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
    const effectiveFeedCategory =
      data.category !== undefined ? data.category : data.feedCategory !== undefined ? data.feedCategory : undefined

    let result = {
      ...data,
      ...(effectiveFeedCategory !== undefined ? { feedCategory: effectiveFeedCategory } : {}),
    }

    if (data.type === 'media' && data.payload !== undefined) {
      const parsedPayload = mediaPayloadSchema.parse(data.payload)
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
    parentId: z.string().regex(/^\d{1,20}$/, 'Invalid parent ID format').nullable().optional(),
  })
  .superRefine(validateMediaOrText)
  .transform(transformMediaOrText)

export const updateCommentSchema = z
  .object({
    content: z.string().trim().max(5000, 'Content must be at most 5000 characters').nullable().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })

export const listCommentsQuerySchema = createPaginationSchema(50, 100)

export const recordViewsSchema = z.object({
  postIds: z
    .array(
      z
        .string()
        .regex(/^\d{1,20}$/, 'Invalid post ID format')
        .transform((val) => BigInt(val))
    )
    .min(1, 'At least 1 post ID is required')
    .max(100, 'Maximum 100 post IDs allowed'),
})

export const feedCategoriesSchema = z
  .union([
    z.array(z.enum(FEED_CATEGORIES)),
    z.string().transform((str) =>
      str
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),
  ])
  .pipe(z.array(z.enum(FEED_CATEGORIES)).min(1, 'At least 1 category must be selected').max(3))
  .optional()

export const feedQuerySchema = z.object({
  categories: feedCategoriesSchema,
  allServed: z
    .union([z.boolean(), z.string().transform((val) => val === 'true' || val === '1')])
    .default(true)
    .optional(),
})

export const feedNextBatchSchema = z.object({
  categories: feedCategoriesSchema,
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
export type FeedNextBatchInput = z.infer<typeof feedNextBatchSchema>

