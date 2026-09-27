import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import { formatProfileResponse } from '../../../lib/profile'
import { updateUserProfileByAdmin } from '../services/admin-users.service'

describe('Admin user profile links retention', () => {
  const sampleLinks = [
    {
      title: 'Public Link',
      url: 'https://example.com/public',
      showToOppositeGender: true,
    },
    {
      title: 'Private Link',
      url: 'https://example.com/private',
      showToOppositeGender: false,
    },
  ]

  it('formatProfileResponse preserves all links when isAdmin: true is specified', () => {
    const profile = {
      id: 100n,
      accountId: 200n,
      name: 'Test User',
      isMale: true,
      avatarKey: null,
      description: 'Bio',
      links: sampleLinks,
      identityId: 300n,
      readersCount: 0,
      notificationsReadAt: null,
      verifiedAt: null,
      identity: 'testuser',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const adminView = formatProfileResponse(profile, { isAdmin: true })
    expect(adminView).not.toBeNull()
    expect(adminView!.links).toEqual(sampleLinks)
    expect(adminView!.links).toHaveLength(2)

    // Unauthenticated guest receives null
    const guestView = formatProfileResponse(profile)
    expect(guestView!.links).toBeNull()

    // Opposite gender viewer receives only links with showToOppositeGender === true
    const oppositeGenderView = formatProfileResponse(profile, { viewerGender: false })
    expect(oppositeGenderView!.links).toHaveLength(1)
    expect(oppositeGenderView!.links![0].showToOppositeGender).toBe(true)
  })

  it('updateUserProfileByAdmin returns profile with all links intact for admin', async () => {
    const existingProfile = {
      id: 3001n,
      accountId: 2001n,
      identityId: 4001n,
      name: 'Existing User',
      isMale: true,
      identity: 'existing_user',
      links: sampleLinks,
      verifiedAt: null,
      avatarKey: null,
      description: 'Existing bio',
      readersCount: 0,
      notificationsReadAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockTx: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                limit: async () => [
                  {
                    account: {
                      id: 2001n,
                      email: 'user@wisal.dev',
                      bannedAt: null,
                      deletedAt: null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                    profile: existingProfile,
                    identity: { id: 4001n, identity: 'existing_user' },
                  },
                ],
              }),
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [
              {
                ...existingProfile,
                description: 'Updated bio',
              },
            ],
          }),
        }),
      }),
    }

    const result = await updateUserProfileByAdmin(
      2001n,
      { description: 'Updated bio' },
      mockTx
    )

    expect(result.profile).not.toBeNull()
    expect(result.profile?.links).toEqual(sampleLinks)
    expect(result.profile?.links).toHaveLength(2)
  })
})
