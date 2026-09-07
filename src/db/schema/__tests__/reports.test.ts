import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  reports,
  insertReportSchema,
  selectReportSchema,
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
} from '../reports'

describe('Reports Schema Tests', () => {
  it('validates a valid report insertion payload with minimal fields', () => {
    const validData = {
      reporterProfileId: 100000000000001n,
      reportedProfileId: 200000000000002n,
      targetType: 'post' as const,
      targetId: 300000000000003n,
      reason: 'spam' as const,
    }

    const parsed = insertReportSchema.parse(validData)
    expect(parsed.reporterProfileId).toBe(100000000000001n)
    expect(parsed.reportedProfileId).toBe(200000000000002n)
    expect(parsed.targetType).toBe('post')
    expect(parsed.targetId).toBe(300000000000003n)
    expect(parsed.reason).toBe('spam')
    expect(parsed.status).toBe('pending')
    expect(parsed.details).toBeUndefined()
  })

  it('validates a full report insertion payload with all fields', () => {
    const validData = {
      reporterProfileId: 100000000000001n,
      reportedProfileId: 200000000000002n,
      targetType: 'comment' as const,
      targetId: 400000000000004n,
      reason: 'toxicity' as const,
      details: 'Offensive and toxic language in comment section',
      status: 'pending' as const,
    }

    const parsed = insertReportSchema.parse(validData)
    expect(parsed.reporterProfileId).toBe(100000000000001n)
    expect(parsed.reportedProfileId).toBe(200000000000002n)
    expect(parsed.targetType).toBe('comment')
    expect(parsed.targetId).toBe(400000000000004n)
    expect(parsed.reason).toBe('toxicity')
    expect(parsed.details).toBe('Offensive and toxic language in comment section')
    expect(parsed.status).toBe('pending')
  })

  it('rejects self-report in insertReportSchema', () => {
    const selfReportData = {
      reporterProfileId: 100000000000001n,
      reportedProfileId: 100000000000001n,
      targetType: 'profile' as const,
      targetId: 100000000000001n,
      reason: 'spam' as const,
    }

    expect(() => insertReportSchema.parse(selfReportData)).toThrow('Profiles cannot report themselves')
  })

  it('validates allowed target types and rejects invalid ones', () => {
    for (const targetType of REPORT_TARGET_TYPES) {
      const parsed = insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType,
        targetId: 500000000000005n,
        reason: 'other' as const,
      })
      expect(parsed.targetType).toBe(targetType)
    }

    expect(() =>
      insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType: 'article' as any,
        targetId: 500000000000005n,
        reason: 'other' as const,
      })
    ).toThrow()
  })

  it('validates allowed reasons and rejects invalid ones', () => {
    for (const reason of REPORT_REASONS) {
      const parsed = insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType: 'profile' as const,
        targetId: 200000000000002n,
        reason,
      })
      expect(parsed.reason).toBe(reason)
    }

    expect(() =>
      insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType: 'profile' as const,
        targetId: 200000000000002n,
        reason: 'invalid_reason' as any,
      })
    ).toThrow()
  })

  it('validates allowed statuses and rejects invalid ones', () => {
    for (const status of REPORT_STATUSES) {
      const parsed = insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType: 'profile' as const,
        targetId: 200000000000002n,
        reason: 'gender_mismatch' as const,
        status,
      })
      expect(parsed.status).toBe(status)
    }

    expect(() =>
      insertReportSchema.parse({
        reporterProfileId: 100000000000001n,
        reportedProfileId: 200000000000002n,
        targetType: 'profile' as const,
        targetId: 200000000000002n,
        reason: 'other' as const,
        status: 'closed' as any,
      })
    ).toThrow()
  })

  it('validates selectReportSchema with all nullable fields', () => {
    const now = new Date()
    const record = {
      id: 900000000000001n,
      reporterProfileId: 100000000000001n,
      reportedProfileId: 200000000000002n,
      targetType: 'post',
      targetId: 300000000000003n,
      reason: 'inappropriate_content',
      details: null,
      status: 'pending',
      resolvedById: null,
      modNote: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const parsed = selectReportSchema.parse(record)
    expect(parsed.id).toBe(900000000000001n)
    expect(parsed.reporterProfileId).toBe(100000000000001n)
    expect(parsed.reportedProfileId).toBe(200000000000002n)
    expect(parsed.targetType).toBe('post')
    expect(parsed.targetId).toBe(300000000000003n)
    expect(parsed.reason).toBe('inappropriate_content')
    expect(parsed.details).toBeNull()
    expect(parsed.status).toBe('pending')
    expect(parsed.resolvedById).toBeNull()
    expect(parsed.modNote).toBeNull()
    expect(parsed.resolvedAt).toBeNull()
    expect(parsed.createdAt).toEqual(now)
    expect(parsed.updatedAt).toEqual(now)
  })

  it('validates selectReportSchema when resolved by moderator', () => {
    const createdAt = new Date('2026-08-20T10:00:00.000Z')
    const resolvedAt = new Date('2026-08-20T11:00:00.000Z')
    const record = {
      id: 900000000000002n,
      reporterProfileId: 100000000000001n,
      reportedProfileId: 200000000000002n,
      targetType: 'post',
      targetId: 300000000000003n,
      reason: 'boundary_violation',
      details: 'Violated community boundaries',
      status: 'resolved',
      resolvedById: 888888888888888n,
      modNote: 'Post deleted and user warned',
      resolvedAt,
      createdAt,
      updatedAt: resolvedAt,
    }

    const parsed = selectReportSchema.parse(record)
    expect(parsed.status).toBe('resolved')
    expect(parsed.resolvedById).toBe(888888888888888n)
    expect(parsed.modNote).toBe('Post deleted and user warned')
    expect(parsed.resolvedAt).toEqual(resolvedAt)
  })

  it('has primary key on id', () => {
    const config = getTableConfig(reports)
    const idColumn = config.columns.find((c) => c.name === 'id')
    expect(idColumn?.primary).toBe(true)
  })

  it('has unique constraint for spam protection (uq_reporter_target_reason)', () => {
    const config = getTableConfig(reports)
    const uniqueConstraint = config.uniqueConstraints.find(
      (u) => u.name === 'uq_reporter_target_reason'
    )
    expect(uniqueConstraint).toBeDefined()
    expect(uniqueConstraint?.columns.map((c) => c.name)).toEqual([
      'reporter_profile_id',
      'target_type',
      'target_id',
      'reason',
    ])
  })

  it('has check constraint to prevent self-report in table definition', () => {
    const config = getTableConfig(reports)
    const checkConstraint = config.checks.find(
      (c) => c.name === 'reports_prevent_self_report_check'
    )
    expect(checkConstraint).toBeDefined()
  })

  it('has required index idx_reports_reported_profile on reported_profile_id', () => {
    const config = getTableConfig(reports)
    const reportedProfileIndex = config.indexes.find(
      (idx) => idx.config.name === 'idx_reports_reported_profile'
    )
    expect(reportedProfileIndex).toBeDefined()
  })

  it('has moderation indexes on status, created_at, and target', () => {
    const config = getTableConfig(reports)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('reports_status_idx')
    expect(indexNames).toContain('reports_created_at_idx')
    expect(indexNames).toContain('reports_target_idx')
  })
})
