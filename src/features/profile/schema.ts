import { z } from 'zod'
import {
  onboardingInputSchema,
  updateProfileInputSchema,
} from '../../db/schema/profiles'

export const identityParamSchema = z.object({
  identity: z.string().min(1, 'Identity handle is required'),
})

export const listMyInvitesQuerySchema = z.object({
  status: z.enum(['all', 'active', 'used', 'expired']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListMyInvitesQuery = z.infer<typeof listMyInvitesQuerySchema>

export { onboardingInputSchema, updateProfileInputSchema }

