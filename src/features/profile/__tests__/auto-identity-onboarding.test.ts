import { describe, it, expect, mock } from 'bun:test'
import { app } from '../../../index'
import { generateRandomUserIdentity } from '../../../lib/identity'

describe('Auto-Generated Identity Onboarding', () => {
  it('successfully generates identity userXXXXXX when identity is omitted in onboarding', async () => {
    const mockAccountId = 555555555555555n
    const mockAccount = {
      id: mockAccountId,
      email: 'autouser@example.com',
      deletedAt: null,
      bannedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mock.module('../../../lib/session', () => ({
      validateSessionToken: async () => ({
        account: mockAccount,
        session: { id: 1n, token: 'valid_token' },
      }),
    }))

    mock.module('../service', () => ({
      completeUserOnboarding: async (accountId: bigint, input: any) => {
        const identityHandle = input.identity || generateRandomUserIdentity()
        return {
          id: 100n,
          accountId,
          name: input.name,
          isMale: input.isMale,
          avatarKey: null,
          description: null,
          contacts: null,
          identity: identityHandle,
          isVerified: false,
        }
      },
    }))

    const res = await app.request('/profile/onboarding', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_user_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'John Doe',
        isMale: true,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.success).toBe(true)
    expect(body.profile.name).toBe('John Doe')
    expect(body.profile.identity).toMatch(/^user[23456789bcdfghjkmnpqrstvwxyz]{6}$/)
  })
})
