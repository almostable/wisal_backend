import { z } from 'zod'
import { ADMIN_ROLES } from '../../db/schema/admins'

export const snowflakeParamSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/, 'Invalid ID format'),
})

export const loginInputSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address')),
  password: z.string().min(1, 'Password is required'),
})

export const createAdminInputSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(255, 'Email is too long')
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address')),
  password: z
    .string()
    .min(16, 'Password must be at least 16 characters long')
    .max(128, 'Password must be at most 128 characters long'),
  role: z.enum(ADMIN_ROLES).default('moderator'),
})

export const createInviteInputSchema = z.object({
  code: z
    .string()
    .min(8, 'Invite code must be at least 8 characters long')
    .max(64, 'Invite code is too long')
    .optional(),
  expiresAt: z.coerce.date({ message: 'expiresAt is required and must be a valid date' }),
})

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const inviteStatusEnum = z.enum(['all', 'active', 'used', 'expired'])
export type InviteStatus = z.infer<typeof inviteStatusEnum>

export const listInvitesQuerySchema = paginationQuerySchema.extend({
  status: inviteStatusEnum.default('all'),
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
})

export type SnowflakeParam = z.infer<typeof snowflakeParamSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type CreateAdminRouteInput = z.infer<typeof createAdminInputSchema>
export type CreateInviteRouteInput = z.infer<typeof createInviteInputSchema>
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>
export type ListInvitesQueryInput = z.infer<typeof listInvitesQuerySchema>
