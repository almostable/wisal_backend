import { z } from 'zod'
import { ADMIN_ROLES, adminRawPasswordSchema } from '../../db/schema/admins'
import {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from '../../db/schema/reports'
import { emailSchema, paginationQuerySchema, snowflakeParamSchema } from '../../db/schema/common'
import {
  nameSchema,
  descriptionSchema,
  shortDescriptionSchema,
  contactsSchema,
} from '../../db/schema/profiles'
import { identityFormatSchema } from '../../db/schema/identities'

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

export const baseAdminSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
})
export type BaseAdminSearchQuery = z.infer<typeof baseAdminSearchQuerySchema>

export const adminUserStatusEnum = z.enum(['all', 'onboarded', 'pending', 'verified', 'unverified'])
export type AdminUserStatusFilter = z.infer<typeof adminUserStatusEnum>

export const listUsersQuerySchema = baseAdminSearchQuerySchema.extend({
  status: adminUserStatusEnum.default('all'),
})
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

export const adminRoleFilterEnum = z.enum(['all', 'admin', 'moderator'])
export type AdminRoleFilter = z.infer<typeof adminRoleFilterEnum>

export const listAdminsQuerySchema = baseAdminSearchQuerySchema.extend({
  role: adminRoleFilterEnum.default('all'),
})
export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>

export const inviteStatusEnum = z.enum(['all', 'active', 'used', 'expired'])
export type InviteStatus = z.infer<typeof inviteStatusEnum>

export const listInvitesQuerySchema = baseAdminSearchQuerySchema.extend({
  status: inviteStatusEnum.default('all'),
})

export const adminReportStatusEnum = z.enum(['all', ...REPORT_STATUSES])
export type AdminReportStatusFilter = z.infer<typeof adminReportStatusEnum>

export const adminReportTargetTypeEnum = z.enum(['all', ...REPORT_TARGET_TYPES])
export type AdminReportTargetTypeFilter = z.infer<typeof adminReportTargetTypeEnum>

export const adminReportReasonEnum = z.enum(['all', ...REPORT_REASONS])
export type AdminReportReasonFilter = z.infer<typeof adminReportReasonEnum>

export const listReportsQuerySchema = baseAdminSearchQuerySchema.extend({
  status: adminReportStatusEnum.default('all'),
  targetType: adminReportTargetTypeEnum.default('all'),
  reason: adminReportReasonEnum.default('all'),
})

export const updateReportResolutionSchema = z.object({
  status: z.enum(REPORT_STATUSES, {
    message: `status must be one of: ${REPORT_STATUSES.join(', ')}`,
  }),
  modNote: z
    .string()
    .trim()
    .max(1000, 'Moderator note must be at most 1000 characters')
    .nullable()
    .optional(),
})

export const adminUpdateUserProfileSchema = z.object({
  name: nameSchema.optional(),
  identity: identityFormatSchema.optional(),
  isMale: z.boolean().optional(),
  avatarKey: z.string().nullable().optional(),
  description: descriptionSchema.nullable().optional(),
  shortDescription: shortDescriptionSchema.nullable().optional(),
  contacts: contactsSchema.nullable().optional(),
  isVerified: z.boolean().optional(),
})

export { snowflakeParamSchema, paginationQuerySchema }

export type SnowflakeParam = z.infer<typeof snowflakeParamSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type CreateAdminRouteInput = z.infer<typeof createAdminInputSchema>
export type CreateInviteRouteInput = z.infer<typeof createInviteInputSchema>
export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>
export type ListInvitesQueryInput = z.infer<typeof listInvitesQuerySchema>
export type ListReportsQueryInput = z.infer<typeof listReportsQuerySchema>
export type UpdateReportResolutionRouteInput = z.infer<typeof updateReportResolutionSchema>
export type AdminUpdateUserProfileInput = z.infer<typeof adminUpdateUserProfileSchema>
