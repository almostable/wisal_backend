import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'
import '../../../lib/snowflake'
import { app } from '../../../index'
import type { SafeAccount } from '../../../db/schema/accounts'
import type { Session } from '../../../db/schema/sessions'
import type { ProfileWithIdentity } from '../../../db/schema/profiles'

describe('Uploads Feature Route Tests', () => {
  const userAccount: SafeAccount = {
    id: 111111111111111n,
    email: 'uploader@wisal.dev',
    deletedAt: null,
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
    name: 'Uploader User',
    isMale: true,
    avatarKey: null,
    description: 'Bio',
    contacts: null,
    identityId: 444444444444444n,
    regularReadersCount: 0,
    readersCount: 0,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    identity: {
      id: 444444444444444n,
      identity: 'uploader_user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }

  let insertedMediaRecord: any = null

  beforeEach(() => {
    insertedMediaRecord = null

    mock.module('../../../lib/session', () => ({
      validateSessionToken: async (token: string) => {
        if (token === 'valid_token') {
          return {
            account: userAccount,
            session: userSession,
          }
        }
        return null
      },
    }))

    mock.module('../../../lib/profile', () => ({
      getProfileByAccountId: async () => userProfile,
      isOnboardingCompleted: () => true,
    }))

    mock.module('../../../db', () => ({
      db: {
        insert: () => ({
          values: async (vals: any) => {
            insertedMediaRecord = vals
            return [vals]
          },
        }),
      },
    }))
  })

  afterAll(() => {
    mock.restore()
  })

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/jpeg',
      }),
    })

    expect(res.status).toBe(401)
  })

  it('POST /uploads/presign generates a valid presigned URL for jpg image with 15m TTL and creates pending DB record', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/jpeg',
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      success: boolean
      uploadUrl: string
      fileKey: string
      expiresIn: number
    }

    expect(body.success).toBe(true)
    expect(body.uploadUrl).toBeString()
    expect(body.uploadUrl).toContain('X-Amz-Signature')
    expect(body.fileKey).toMatch(/^media\/\d{4}-\d{2}-\d{2}\/\d{1,20}\.jpg$/)
    expect(body.expiresIn).toBe(900)

    expect(insertedMediaRecord).not.toBeNull()
    expect(insertedMediaRecord.fileKey).toBe(body.fileKey)
    expect(insertedMediaRecord.profileId).toBe(userProfile.id)
    expect(insertedMediaRecord.status).toBe('pending')
  })

  it('POST /uploads/presign supports png and webp images', async () => {
    const resPng = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'png',
        contentType: 'image/png',
      }),
    })
    expect(resPng.status).toBe(200)
    const bodyPng = (await resPng.json()) as { fileKey: string }
    expect(bodyPng.fileKey.endsWith('.png')).toBe(true)

    const resWebp = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'webp',
        contentType: 'image/webp',
      }),
    })
    expect(resWebp.status).toBe(200)
    const bodyWebp = (await resWebp.json()) as { fileKey: string }
    expect(bodyWebp.fileKey.endsWith('.webp')).toBe(true)
  })

  it('POST /uploads/presign accepts valid optional size parameter', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/jpeg',
        size: 5 * 1024 * 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; uploadUrl: string }
    expect(body.success).toBe(true)
  })

  it('POST /uploads/presign rejects size exceeding 10MB with 400', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/jpeg',
        size: 15 * 1024 * 1024,
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /uploads/presign rejects non-positive size with 400', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/jpeg',
        size: 0,
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /uploads/presign rejects missing contentType with 400', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpeg',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /uploads/presign rejects mismatched extension and mime type with 400', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'jpg',
        contentType: 'image/png',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('POST /uploads/presign rejects unsupported extension with 400', async () => {
    const res = await app.request('/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid_token',
      },
      body: JSON.stringify({
        ext: 'exe',
        contentType: 'application/octet-stream',
      }),
    })

    expect(res.status).toBe(400)
  })
})
