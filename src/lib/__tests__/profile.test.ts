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
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        type: 'user',
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
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        type: 'user',
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
      createdAt: new Date(),
      updatedAt: new Date(),
      identity: {
        id: 100n,
        identity: 'alice',
        type: 'user',
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
})
