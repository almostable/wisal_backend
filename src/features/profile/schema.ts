import { z } from 'zod'
import { paginationQuerySchema, createPaginationSchema, MAX_PG_BIGINT } from '../../db/schema/common'
import {
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
  profileLinkSchema,
  profileLinksSchema,
  type ProfileLink,
} from '../../db/schema/profiles'

export const identityParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const authorParamSchema = z.object({
  author_id: z.string().min(1, 'Author ID or identity is required'),
})

const postIdFieldSchema = z
  .union([
    z
      .string()
      .regex(/^\d{1,19}$/, 'Invalid post ID')
      .refine((val) => {
        try {
          const b = BigInt(val)
          return b > 0n && b <= MAX_PG_BIGINT
        } catch {
          return false
        }
      }, 'Invalid post ID'),
    z
      .number()
      .int('Invalid post ID')
      .positive('Invalid post ID')
      .refine((val) => BigInt(val) <= MAX_PG_BIGINT, 'Invalid post ID'),
  ])

export const markAuthorReadSchema = z
  .object({
    last_post_id: postIdFieldSchema.optional(),
    lastPostId: postIdFieldSchema.optional(),
  })
  .refine((data) => data.last_post_id !== undefined || data.lastPostId !== undefined, {
    message: 'last_post_id or lastPostId is required',
  })
  .transform((data) => ({
    lastPostId: BigInt((data.last_post_id ?? data.lastPostId)!),
  }))

export type MarkAuthorReadInput = z.infer<typeof markAuthorReadSchema>

export const listMyInvitesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', 'active', 'used', 'expired']).default('all'),
})

export type ListMyInvitesQuery = z.infer<typeof listMyInvitesQuerySchema>

export const listReadersQuerySchema = paginationQuerySchema

export type ListReadersQuery = z.infer<typeof listReadersQuerySchema>

export const listAuthorsQuerySchema = paginationQuerySchema

export type ListAuthorsQuery = z.infer<typeof listAuthorsQuerySchema>

export const listBlocksQuerySchema = paginationQuerySchema

export type ListBlocksQuery = z.infer<typeof listBlocksQuerySchema>

export const profileFeedTypeSchema = z.enum(['random', 'recommended'])

export const profileFeedQuerySchema = createPaginationSchema(20, 100)
  .extend({
    type: profileFeedTypeSchema.default('recommended'),
    seed: z.string().regex(/^[a-f0-9]{16}$/, 'Invalid seed format').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'recommended' && data.seed !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seed is not allowed for recommended feed',
        path: ['seed'],
      })
    }
    if (data.type === 'random') {
      if (data.offset === 0 && data.seed !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Seed cannot be provided for initial request (offset=0). The server generates the seed automatically.',
          path: ['seed'],
        })
      }
      if (data.offset > 0 && !data.seed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seed is required for pagination (offset > 0) in random mode',
          path: ['seed'],
        })
      }
    }
  })

export type ProfileFeedQuery = z.infer<typeof profileFeedQuerySchema>

export const profileSearchQuerySchema = createPaginationSchema(20, 100).extend({
  q: z
    .string()
    .trim()
    .min(1, 'Search query must not be empty')
    .max(100, 'Search query is too long'),
})

export type ProfileSearchQuery = z.infer<typeof profileSearchQuerySchema>

export {
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
  profileLinkSchema,
  profileLinksSchema,
  type ProfileLink,
}

