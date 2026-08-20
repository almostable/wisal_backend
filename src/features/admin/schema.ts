import { z } from 'zod'
import { ADMIN_ROLES, adminRawPasswordSchema } from '../../db/schema/admins'
import { emailSchema, paginationQuerySchema, snowflakeParamSchema } from '../../db/schema/common'

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const createAdminInputSchema = z.object({
  email: emailSchema,
  password: adminRawPasswordSchema,
  role: z.enum(ADMIN_ROLES).default('moderator'),
})

export const createInviteInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(8, 'Invite code must be at least 8 characters long')
    .max(64, 'Invite code is too long')
    .optional(),
  expiresAt: z.coerce
    .date({ message: 'expiresAt is required and must be a valid date' })
    .refine((date) => date.getTime() > Date.now(), {
      message: 'Expiration date must be in the future',
    }),
})

export const inviteStatusEnum = z.enum(['all', 'active', 'used', 'expired'])
export type InviteStatus = z.infer<typeof inviteStatusEnum>

export const listInvitesQuerySchema = paginationQuerySchema.extend({
  status: inviteStatusEnum.default('all'),
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
})

export { snowflakeParamSchema, paginationQuerySchema }

export type SnowflakeParam = z.infer<typeof snowflakeParamSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type CreateAdminRouteInput = z.infer<typeof createAdminInputSchema>
export type CreateInviteRouteInput = z.infer<typeof createInviteInputSchema>
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>
export type ListInvitesQueryInput = z.infer<typeof listInvitesQuerySchema>
