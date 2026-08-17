import { z } from 'zod'

export const loginInputSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .transform((val) => val.trim().toLowerCase())
    .pipe(z.email('Invalid email address')),
  password: z.string().min(1, 'Password is required'),
})

export const createInviteInputSchema = z.object({
  code: z
    .string()
    .min(8, 'Invite code must be at least 8 characters long')
    .max(64, 'Invite code is too long')
    .optional(),
  expiresAt: z.coerce.date().optional(),
  expiresInDays: z.coerce.number().positive().optional(),
})

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type LoginInput = z.infer<typeof loginInputSchema>
export type CreateInviteRouteInput = z.infer<typeof createInviteInputSchema>
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>
