import { describe, it, expect, mock, beforeEach } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAdmin } from '../../../db/schema/admins'
import type { AdminSession } from '../../../db/schema/admin-sessions'
import type { InviteApplicationItem } from '../types'

describe('Admin Invite Applications Route Tests', () => {
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

  const mockApplication: InviteApplicationItem = {
    id: 333333333333333n,
    name: 'John Doe',
    about: 'Senior backend developer from Berlin.',
    reason: 'I would like to participate in discussions and contribute.',
    contact: '@johndoe',
    contactNormalized: 'johndoe',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    invite: null,
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockApprovedApplication: InviteApplicationItem = {
    ...mockApplication,
    status: 'approved',
    reviewedBy: {
      id: mockAdmin.id,
      email: mockAdmin.email,
      role: mockAdmin.role,
    },
    reviewedAt: new Date(),
    reviewNote: 'Candidate looks solid',
    invite: {
      id: 444444444444444n,
      code: 'WISAL-ABCD-EFGH-1234-5678',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usedAt: null,
      usedBy: null,
    },
  }

  const mockRejectedApplication: InviteApplicationItem = {
    ...mockApplication,
    status: 'rejected',
    reviewedBy: {
      id: mockAdmin.id,
      email: mockAdmin.email,
      role: mockAdmin.role,
    },
    reviewedAt: new Date(),
    reviewNote: 'Insufficient details provided in application',
    invite: null,
  }

  beforeEach(() => {
    mock.module('../../../lib/admin-session', () => ({
      validateAdminSessionToken: async (token: string) => {
        if (token === 'valid_admin_token') {
          return {
            admin: mockAdmin,
            session: mockAdminSession,
          }
        }
        return null
      },
    }))
  })

  it('GET /admin/invite-applications returns 401 without auth token', async () => {
    const res = await app.request('/admin/invite-applications', {
      method: 'GET',
    })
    expect(res.status).toBe(401)
  })

  it('GET /admin/invite-applications returns list of applications and stats', async () => {
    mock.module('../service', () => ({
      listInviteApplications: async () => ({
        applications: [mockApplication],
        total: 1,
        stats: {
          pending: 1,
          approved: 0,
          rejected: 0,
          total: 1,
        },
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/admin/invite-applications?status=pending', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.applications).toHaveLength(1)
    expect(body.applications[0].name).toBe('John Doe')
    expect(body.stats.pending).toBe(1)
  })

  it('GET /admin/invite-applications/:id returns details of a single application', async () => {
    mock.module('../service', () => ({
      getInviteApplicationById: async (id: bigint) => {
        if (id === mockApplication.id) {
          return mockApplication
        }
        throw new HTTPException(404, { message: 'Invite application not found' })
      },
    }))

    const res = await app.request(`/admin/invite-applications/${mockApplication.id}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.application.id).toBe(String(mockApplication.id))
  })

  it('GET /admin/invite-applications/:id returns 404 for unknown application', async () => {
    mock.module('../service', () => ({
      getInviteApplicationById: async () => {
        throw new HTTPException(404, { message: 'Invite application not found' })
      },
    }))

    const res = await app.request('/admin/invite-applications/999999999999999', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_admin_token',
      },
    })

    expect(res.status).toBe(404)
  })

  it('POST /admin/invite-applications/:id/approve approves application and creates invite', async () => {
    mock.module('../service', () => ({
      approveInviteApplication: async () => mockApprovedApplication,
    }))

    const res = await app.request(`/admin/invite-applications/${mockApplication.id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reviewNote: 'Candidate looks solid',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.application.status).toBe('approved')
    expect(body.application.invite).toBeDefined()
    expect(body.application.invite.code).toBe('WISAL-ABCD-EFGH-1234-5678')
    expect(body.application.reviewedBy.email).toBe('admin@wisal.dev')
  })

  it('POST /admin/invite-applications/:id/approve returns 409 if application was already reviewed', async () => {
    mock.module('../service', () => ({
      approveInviteApplication: async () => {
        throw new HTTPException(409, { message: 'Application has already been reviewed' })
      },
    }))

    const res = await app.request(`/admin/invite-applications/${mockApplication.id}/approve`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as any
    expect(body.error).toBe('Application has already been reviewed')
  })

  it('POST /admin/invite-applications/:id/reject rejects application with required reviewNote', async () => {
    mock.module('../service', () => ({
      rejectInviteApplication: async () => mockRejectedApplication,
    }))

    const res = await app.request(`/admin/invite-applications/${mockApplication.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reviewNote: 'Insufficient details provided in application',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.application.status).toBe('rejected')
    expect(body.application.reviewNote).toBe('Insufficient details provided in application')
    expect(body.application.reviewedBy.email).toBe('admin@wisal.dev')
  })

  it('POST /admin/invite-applications/:id/reject validates that reviewNote is at least 5 chars', async () => {
    const res = await app.request(`/admin/invite-applications/${mockApplication.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_admin_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reviewNote: 'No', // too short (< 5 chars)
      }),
    })

    expect(res.status).toBe(400)
  })
})
