import { describe, it, expect } from 'bun:test'
import { isOnboardingCompleted } from '../profile'
import type { ProfileWithIdentity } from '../../db/schema/profiles'

describe('Profile Utility Tests', () => {
  it('correctly validates completed profile with all required fields', () => {
    const validProfile: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: false,
      avatarKey: null,
      description: null,
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    expect(isOnboardingCompleted(validProfile)).toBe(true)
  })

  it('returns false when profile is null or undefined', () => {
    expect(isOnboardingCompleted(null)).toBe(false)
    expect(isOnboardingCompleted(undefined)).toBe(false)
  })

  it('returns false when name is missing or empty', () => {
    const incomplete: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: '  ',
      isMale: true,
      avatarKey: null,
      description: null,
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    expect(isOnboardingCompleted(incomplete)).toBe(false)
  })

  it('returns false when isMale (gender) is null or undefined', () => {
    const incomplete: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: null,
      avatarKey: null,
      description: null,
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    expect(isOnboardingCompleted(incomplete)).toBe(false)
  })

  it('returns false when identity is not attached', () => {
    const incomplete: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: true,
      avatarKey: null,
      description: null,
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: null,
    }

    expect(isOnboardingCompleted(incomplete)).toBe(false)
  })

  it('returns false when identity has no id or is invalid object', () => {
    const incomplete: any = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: true,
      identityId: 100n,
      identity: { id: null, identity: null },
    }

    expect(isOnboardingCompleted(incomplete)).toBe(false)
  })

  it('formatProfileResponse strips identityId and formats identity string', async () => {
    const { formatProfileResponse } = await import('../profile')
    const fullProfile: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: true,
      avatarKey: 'avatar.png',
      description: 'bio',
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 42,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    const formatted = formatProfileResponse(fullProfile)
    expect(formatted).not.toBeNull()
    expect(formatted!.id).toBe(1n)
    expect((formatted as any).identityId).toBeUndefined()
    expect((formatted as any).accountId).toBeUndefined()
    expect(formatted!.identity).toBe('alice')
    expect(formatted!.regularFollowersCount).toBe(42)
  })

  it('formatRestrictedProfileResponse sets regularFollowersCount to 0', async () => {
    const { formatRestrictedProfileResponse } = await import('../profile')
    const fullProfile: ProfileWithIdentity = {
      id: 1n,
      accountId: 10n,
      name: 'Alice',
      isMale: true,
      avatarKey: 'avatar.png',
      description: 'bio',
      contacts: null,
      identityId: 100n,
      regularFollowersCount: 42,
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    const restricted = formatRestrictedProfileResponse(fullProfile, { isBlocked: true })
    expect(restricted).not.toBeNull()
    expect(restricted!.regularFollowersCount).toBe(0)
    expect(restricted!.isBlocked).toBe(true)
  })

  it('checkIdentityAvailable returns false for invalid format or reserved names', async () => {
    const { checkIdentityAvailable } = await import('../profile')
    const invalidShort = await checkIdentityAvailable('ab')
    expect(invalidShort.available).toBe(false)

    const invalidReserved = await checkIdentityAvailable('admin')
    expect(invalidReserved.available).toBe(false)

    const invalidChars = await checkIdentityAvailable('hello-world!')
    expect(invalidChars.available).toBe(false)
  })
})

