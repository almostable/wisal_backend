import { pgTable, varchar, text, timestamp, index, unique, check } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { accounts } from './accounts'
import { admins } from './admins'

export const REPORT_TARGET_TYPES = ['post', 'comment', 'user'] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number]

export const REPORT_REASONS = [
  'boundary_violation',
  'inappropriate_content',
  'toxicity',
  'fraud_or_scam',
  'spam',
  'gender_mismatch',
  'other',
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_STATUSES = ['pending', 'resolved', 'rejected'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const reports = pgTable(
  'reports',
  {
    id: snowflakePrimaryKey(),
    reporterId: snowflakeId('reporter_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    reportedUserId: snowflakeId('reported_user_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: snowflakeId('target_id').notNull(),
    reason: varchar('reason', { length: 64 }).notNull(),
    details: text('details'),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    resolvedById: snowflakeId('resolved_by_id')
      .references(() => admins.id, { onDelete: 'set null' }),
    modNote: text('mod_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    unique('uq_reporter_target_reason').on(
      table.reporterId,
      table.targetType,
      table.targetId,
      table.reason
    ),
    index('idx_reports_reported_user').on(table.reportedUserId),
    index('reports_status_idx').on(table.status),
    index('reports_created_at_idx').on(table.createdAt),
    index('reports_target_idx').on(table.targetType, table.targetId),
    check('reports_prevent_self_report_check', sql`${table.reporterId} != ${table.reportedUserId}`),
  ]
)

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(accounts, {
    fields: [reports.reporterId],
    references: [accounts.id],
    relationName: 'reporter',
  }),
  reportedUser: one(accounts, {
    fields: [reports.reportedUserId],
    references: [accounts.id],
    relationName: 'reportedUser',
  }),
  resolvedBy: one(admins, {
    fields: [reports.resolvedById],
    references: [admins.id],
    relationName: 'resolvedBy',
  }),
}))

export const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES)
export const reportReasonSchema = z.enum(REPORT_REASONS)
export const reportStatusSchema = z.enum(REPORT_STATUSES)

export const reportDetailsSchema = z
  .string()
  .trim()
  .max(1000, 'Details must be at most 1000 characters')

export const reportModNoteSchema = z
  .string()
  .trim()
  .max(1000, 'Moderator note must be at most 1000 characters')

export const insertReportSchema = createInsertSchema(reports, {
  targetType: () => reportTargetTypeSchema,
  reason: () => reportReasonSchema,
  status: () => reportStatusSchema.default('pending'),
  details: () => reportDetailsSchema.nullable().optional(),
  modNote: () => reportModNoteSchema.nullable().optional(),
}).refine((data) => data.reporterId !== data.reportedUserId, {
  message: 'Users cannot report themselves',
  path: ['reportedUserId'],
})

export const selectReportSchema = createSelectSchema(reports)

export type Report = typeof reports.$inferSelect
export type NewReport = typeof reports.$inferInsert
