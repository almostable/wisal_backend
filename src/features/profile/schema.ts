import { z } from 'zod'
import { paginationQuerySchema, createPaginationSchema } from '../../db/schema/common'
import {
  onboardingInputSchema,
  updateProfileInputSchema,
  shortDescriptionSchema,
  countryCodeSchema,
  cityIdSchema,
  telegramUsernameSchema,
  contactsSchema,
} from '../../db/schema/profiles'

export const identityParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const listMyInvitesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', 'active', 'used', 'expired']).default('all'),
})

export type ListMyInvitesQuery = z.infer<typeof listMyInvitesQuerySchema>

export const listReadersQuerySchema = paginationQuerySchema

export type ListReadersQuery = z.infer<typeof listReadersQuerySchema>

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
  shortDescriptionSchema,
  countryCodeSchema,
  cityIdSchema,
  telegramUsernameSchema,
  contactsSchema,
}

