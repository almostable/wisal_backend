import { z } from 'zod'
import {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
} from '../../db/schema/reports'
import { paginationQuerySchema, snowflakeParamSchema, snowflakeIdSchema } from '../../db/schema/common'

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES, {
    message: 'targetType must be one of: post, comment, profile',
  }),
  targetId: snowflakeIdSchema,
  reason: z.enum(REPORT_REASONS, {
    message: `reason must be one of: ${REPORT_REASONS.join(', ')}`,
  }),
  details: z
    .string()
    .trim()
    .max(1000, 'Details must be at most 1000 characters')
    .optional(),
})

export const userReportStatusEnum = z.enum(['all', ...REPORT_STATUSES])
export type UserReportStatusFilter = z.infer<typeof userReportStatusEnum>

export const listUserReportsQuerySchema = paginationQuerySchema.extend({
  status: userReportStatusEnum.default('all'),
})

export const reportIdParamSchema = snowflakeParamSchema

export { snowflakeParamSchema, paginationQuerySchema }
export type CreateReportRouteInput = z.infer<typeof createReportSchema>
export type ListUserReportsQuery = z.infer<typeof listUserReportsQuerySchema>
