import { z } from 'zod'
import { paginationQuerySchema } from '../../db/schema/common'
import {
  onboardingInputSchema,
  updateProfileInputSchema,
} from '../../db/schema/profiles'

export const identityParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const listMyInvitesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', 'active', 'used', 'expired']).default('all'),
})

export type ListMyInvitesQuery = z.infer<typeof listMyInvitesQuerySchema>

export const listFollowsQuerySchema = paginationQuerySchema

export type ListFollowsQuery = z.infer<typeof listFollowsQuerySchema>

export const listBlocksQuerySchema = paginationQuerySchema

export type ListBlocksQuery = z.infer<typeof listBlocksQuerySchema>

export { onboardingInputSchema, updateProfileInputSchema }

