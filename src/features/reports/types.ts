import type {
  Report,
  ReportTargetType,
  ReportReason,
  ReportStatus,
} from '../../db/schema/reports'
import type { UserReportStatusFilter } from './schema'

export interface CreateReportInput {
  targetType: ReportTargetType
  targetId: bigint
  reason: ReportReason
  details?: string
}

export type UserReportItem = Report

export interface ListUserReportsOptions {
  limit?: number
  offset?: number
  status?: UserReportStatusFilter
}

export interface ListUserReportsResult {
  reports: UserReportItem[]
  total: number
  limit: number
  offset: number
}
