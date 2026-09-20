import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { AdminReportItem } from '../types'

describe('Admin Reports Action and Embed Tests', () => {
  const mockAdmin: SafeAdmin = {
    id: 111111111111111n,
    email: 'admin@wisal.dev',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockAdminSession: AdminSession = {
    id: 222222222222222n,
    adminId: mockAdmin.id,
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockReportWithTarget: AdminReportItem = {
    id: 999999999999991n,
    targetType: 'post',
    targetId: 888888888888881n,
    reason: 'spam',
    details: 'Spamming referral links',
    status: 'pending',
    modNote: null,
    reporter: {
      id: 333333333333333n,
      email: 'reporter@wisal.dev',
      name: 'Reporter',
      identity: 'reporter_user',
      avatarKey: null,
    },
    reportedUser: {
      id: 555555555555555n,
      email: 'spammer@wisal.dev',
      name: 'Spammer',
      identity: 'spammer_user',
      avatarKey: null,
    },
    resolvedBy: null,
    resolvedAt: null,
    target: {
      type: 'post',
      post: {
        id: 888888888888881n,
        authorId: 555555555555555n,
        content: 'Check out this referral link!',
        type: 'text',
        payload: {},
        deletedAt: null,
        author: {
          id: 555555555555555n,
          name: 'Spammer',
          identity: 'spammer_user',
          avatarKey: null,
        },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('GET /admin/reports returns reports enriched with target object', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      listReports: async () => ({
        reports: [mockReportWithTarget],
        total: 1,
        stats: { pending: 1, resolved: 0, rejected: 0 },
        limit: 50,
        offset: 0,
      }),
      getReportById: async () => mockReportWithTarget,
      resolveReportWithAction: async () => ({
        ...mockReportWithTarget,
        status: 'resolved',
        modNote: 'Post deleted and user warned',
      }),
    }))

    const res = await app.request('/admin/reports', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.reports[0].target).toBeDefined()
    expect(body.reports[0].target.type).toBe('post')
    expect(body.reports[0].target.post.content).toBe('Check out this referral link!')
  })

  it('POST /admin/reports/:id/action executes action and resolves report in one call', async () => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async () => ({
        admin: mockAdmin,
        session: mockAdminSession,
      }),
    }))

    mock.module('../service', () => ({
      resolveReportWithAction: async () => ({
        ...mockReportWithTarget,
        status: 'resolved',
        modNote: 'Post removed and user banned',
        resolvedBy: { id: mockAdmin.id, email: mockAdmin.email, role: mockAdmin.role },
      }),
    }))

    const res = await app.request('/admin/reports/999999999999991/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_admin_token',
      },
      body: JSON.stringify({
        status: 'resolved',
        modNote: 'Post removed and user banned',
        action: 'delete_target',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.report.status).toBe('resolved')
    expect(body.report.modNote).toBe('Post removed and user banned')
  })
})
