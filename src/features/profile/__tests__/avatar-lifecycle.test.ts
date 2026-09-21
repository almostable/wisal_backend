import { describe, it, expect, mock, afterAll } from 'bun:test'
import '../../../lib/snowflake'

describe('Profile Avatar Lifecycle Integration Tests', () => {
  afterAll(() => {
    mock.restore()
  })

  const accountId = 111111111111111n
  const profileId = 222222222222222n
  const identityId = 333333333333333n

  it('completeOnboarding calls attachMediaFiles when avatarKey is provided', async () => {
    let updatedSet: any = null

    mock.module('../../../db', () => ({
      db: {
        transaction: async (cb: any) => {
          const mockTx = {
            query: {
              identities: {
                findFirst: async () => null,
              },
              profiles: {
                findFirst: async () => null,
              },
            },
            insert: () => ({
              values: () => ({
                returning: async () => [
                  {
                    id: profileId,
                    accountId,
                    name: 'Test',
                    isMale: true,
                    avatarKey: 'media/2026-09-04/avatar.jpg',
                    description: null,
                    contacts: null,
                    identityId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
              }),
            }),
            update: () => ({
              set: (setData: any) => {
                updatedSet = setData
                return {
                  where: () => ({
                    returning: async () => [{ fileKey: 'media/2026-09-04/avatar.jpg' }],
                  }),
                }
              },
            }),
          }
          return await cb(mockTx)
        },
      },
    }))

    const { completeOnboarding } = await import('../../../lib/profile')

    await completeOnboarding(accountId, {
      name: 'Test',
      identity: 'testuser',
      isMale: true,
      avatarKey: 'media/2026-09-04/avatar.jpg',
    })

    expect(updatedSet).toEqual({
      status: 'attached',
      entityType: 'avatar',
      entityId: profileId,
    })
  })

  it('updateProfile calls reconcileEntityMedia when updating avatarKey', async () => {
    let deletedStatusSet: any = null
    let attachedStatusSet: any = null

    mock.module('../../../db', () => ({
      db: {
        transaction: async (cb: any) => {
          const mockTx = {
            select: () => ({
              from: () => ({
                leftJoin: () => ({
                  where: () => ({
                    limit: async () => [
                      {
                        profile: {
                          id: profileId,
                          accountId,
                          name: 'Old Name',
                          isMale: true,
                          avatarKey: 'media/2026-09-04/old-avatar.jpg',
                          description: null,
                          contacts: null,
                          identityId,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        },
                        identity: {
                          id: identityId,
                          identity: 'olduser',
                        },
                      },
                    ],
                  }),
                }),
              }),
            }),
            update: () => ({
              set: (setData: any) => {
                if (setData.status === 'deleted') {
                  deletedStatusSet = setData
                  return { where: async () => [] }
                }
                if (setData.status === 'attached') {
                  attachedStatusSet = setData
                  return {
                    where: () => ({
                      returning: async () => [{ fileKey: 'media/2026-09-04/new-avatar.jpg' }],
                    }),
                  }
                }
                return {
                  where: () => ({
                    returning: async () => [
                      {
                        id: profileId,
                        accountId,
                        name: 'Old Name',
                        isMale: true,
                        avatarKey: 'media/2026-09-04/new-avatar.jpg',
                        description: null,
                        contacts: null,
                        identityId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      },
                    ],
                  }),
                }
              },
            }),
          }
          return await cb(mockTx)
        },
      },
    }))

    const { updateProfile } = await import('../../../lib/profile')

    await updateProfile(accountId, {
      avatarKey: 'media/2026-09-04/new-avatar.jpg',
    })

    expect(deletedStatusSet).toEqual({ status: 'deleted' })
    expect(attachedStatusSet).toEqual({
      status: 'attached',
      entityType: 'avatar',
      entityId: profileId,
    })
  })
})
