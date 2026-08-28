import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import { HTTPException } from 'hono/http-exception'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'
import type { Report } from '../../../db/schema/reports'

describe('Reports Feature Route Tests', () => {
  const userAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'reporter@wisal.dev',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const userSession: Session = {
    id: 222222222222222n,
    accountId: userAccount.id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const userProfile: ProfileWithIdentity = {
    id: 333333333333333n,
    accountId: userAccount.id,
    name: 'Reporter User',
    isMale: true,
    avatarKey: null,
    description: 'Reporter bio',
    contacts: null,
    identityId: 444444444444444n,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'reporter_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  const mockReport: Report = {
    id: 999999999999991n,
    reporterId: userAccount.id,
    reportedUserId: 555555555555555n,
    targetType: 'post',
    targetId: 888888888888881n,
    reason: 'spam',
    details: 'Spamming referral links',
    status: 'pending',
    resolveById: null,
    modNote: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('POST /reports creates a report on a post successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async (_reporterId: bigint, input: any) => ({
        ...mockReport,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
      }),
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: '888888888888881',
        reason: 'spam',
        details: 'Spamming referral links',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; report: any }
    expect(body.success).toBe(true)
    expect(body.report.id).toBe('999999999999991')
    expect(body.report.targetType).toBe('post')
    expect(body.report.reason).toBe('spam')
  })

  it('POST /reports creates a report on a user successfully', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async () => ({
        ...mockReport,
        targetType: 'user',
        targetId: 555555555555555n,
        reason: 'toxicity',
      }),
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'user',
        targetId: '555555555555555',
        reason: 'toxicity',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; report: Report }
    expect(body.success).toBe(true)
    expect(body.report.targetType).toBe('user')
  })

  it('POST /reports rejects self-report with 400', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async () => {
        throw new HTTPException(400, {
          message: 'You cannot report yourself or your own content',
        })
      },
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'user',
        targetId: userAccount.id.toString(),
        reason: 'spam',
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You cannot report yourself or your own content')
  })

  it('POST /reports rejects duplicate report with same reason with 409', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async () => {
        throw new HTTPException(409, {
          message: 'You have already reported this target for this reason',
        })
      },
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: '888888888888881',
        reason: 'spam',
      }),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('You have already reported this target for this reason')
  })

  it('POST /reports allows reporting the same target with a different reason', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async (_reporterId: bigint, input: any) => ({
        ...mockReport,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      }),
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: '888888888888881',
        reason: 'toxicity',
      }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { success: boolean; report: any }
    expect(body.success).toBe(true)
    expect(body.report.reason).toBe('toxicity')
  })

  it('POST /reports returns 404 when target entity does not exist', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      createReport: async () => {
        throw new HTTPException(404, {
          message: 'Reported post not found',
        })
      },
    }))

    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_reporter_token',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: '999999999999999',
        reason: 'spam',
      }),
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Reported post not found')
  })

  it('POST /reports returns 401 when token is missing', async () => {
    const res = await app.request('/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetType: 'post',
        targetId: '888888888888881',
        reason: 'spam',
      }),
    })

    expect(res.status).toBe(401)
  })

  it('GET /reports returns paginated list of user reports', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      listUserReports: async () => ({
        reports: [mockReport],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }))

    const res = await app.request('/reports?limit=20&status=pending', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_reporter_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      reports: Report[]
      total: number
      limit: number
      offset: number
    }
    expect(body.success).toBe(true)
    expect(body.reports.length).toBe(1)
    expect(body.total).toBe(1)
  })

  it('GET /reports/:id returns specific report by ID', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserReportById: async () => mockReport,
    }))

    const res = await app.request('/reports/999999999999991', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_reporter_token',
      },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; report: any }
    expect(body.success).toBe(true)
    expect(body.report.id).toBe('999999999999991')
  })

  it('GET /reports/:id returns 404 when report not found', async () => {
    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: userAccount,
        session: userSession,
      }),
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../service', () => ({
      getUserReportById: async () => {
        throw new HTTPException(404, { message: 'Report not found' })
      },
    }))

    const res = await app.request('/reports/999999999999999', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer valid_reporter_token',
      },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Report not found')
  })
})
