import { describe, it, expect } from 'bun:test'
import {
  generateUploadPresignedUrl,
  attachMediaFiles,
  markEntityMediaDeleted,
  reconcileEntityMedia,
} from '../service'
import { HTTPException } from 'hono/http-exception'

describe('Uploads Service Unit Tests', () => {
  const userId = 100000000000001n
  const otherUserId = 200000000000002n
  const postId = 300000000000003n

  it('generateUploadPresignedUrl inserts a pending record into media_uploads', async () => {
    let insertedValues: any = null
    const mockExecutor: any = {
      insert: () => ({
        values: async (vals: any) => {
          insertedValues = vals
          return [vals]
        },
      }),
    }

    const result = await generateUploadPresignedUrl(
      { ext: 'jpg', contentType: 'image/jpeg' },
      userId,
      mockExecutor
    )

    expect(result.success).toBe(true)
    expect(result.expiresIn).toBe(900)
    expect(result.fileKey).toBeString()
    expect(insertedValues).not.toBeNull()
    expect(insertedValues.fileKey).toBe(result.fileKey)
    expect(insertedValues.profileId).toBe(userId)
    expect(insertedValues.status).toBe('pending')
  })

  it('attachMediaFiles attaches pending files successfully', async () => {
    const fileKeys = [
      'media/2026-09-04/111111111111111.jpg',
      'media/2026-09-04/222222222222222.jpg',
    ]

    let updatedSet: any = null
    const mockExecutor: any = {
      update: () => ({
        set: (setData: any) => {
          updatedSet = setData
          return {
            where: () => ({
              returning: async () => fileKeys.map((k) => ({ fileKey: k })),
            }),
          }
        },
      }),
    }

    await attachMediaFiles(mockExecutor, {
      fileKeys,
      profileId: userId,
      entityType: 'post',
      entityId: postId,
    })

    expect(updatedSet).toEqual({
      status: 'attached',
      entityType: 'post',
      entityId: postId,
    })
  })

  it('attachMediaFiles throws 400 when duplicate keys are provided', async () => {
    const duplicateKeys = [
      'media/2026-09-04/111111111111111.jpg',
      'media/2026-09-04/111111111111111.jpg',
    ]

    const mockExecutor: any = {}

    await expect(
      attachMediaFiles(mockExecutor, {
        fileKeys: duplicateKeys,
        profileId: userId,
        entityType: 'post',
        entityId: postId,
      })
    ).rejects.toThrow('Duplicate media file keys provided')
  })

  it('attachMediaFiles throws 400 when updated rows do not match requested keys (IDOR protection)', async () => {
    const fileKeys = [
      'media/2026-09-04/111111111111111.jpg',
      'media/2026-09-04/999999999999999.jpg', // unowned or missing
    ]

    const mockExecutor: any = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ fileKey: fileKeys[0] }], // only 1 of 2 matched
          }),
        }),
      }),
    }

    try {
      await attachMediaFiles(mockExecutor, {
        fileKeys,
        profileId: userId,
        entityType: 'post',
        entityId: postId,
      })
      expect(true).toBe(false) // should not reach here
    } catch (err: any) {
      expect(err).toBeInstanceOf(HTTPException)
      expect(err.status).toBe(400)
      expect(err.message).toContain('Invalid media files')
    }
  })

  it('markEntityMediaDeleted sets status to deleted for entity files', async () => {
    let updatedSet: any = null
    const mockExecutor: any = {
      update: () => ({
        set: (setData: any) => {
          updatedSet = setData
          return {
            where: async () => [{ count: 2 }],
          }
        },
      }),
    }

    await markEntityMediaDeleted(mockExecutor, {
      entityType: 'post',
      entityId: postId,
    })

    expect(updatedSet).toEqual({ status: 'deleted' })
  })

  it('reconcileEntityMedia detaches removed keys and attaches new keys', async () => {
    const oldKeys = ['media/2026-09-04/1.jpg', 'media/2026-09-04/2.jpg']
    const newKeys = ['media/2026-09-04/2.jpg', 'media/2026-09-04/3.jpg']

    let deletedKeysQueried: boolean = false
    let attachedKeysQueried: boolean = false

    const mockExecutor: any = {
      update: () => ({
        set: (setData: any) => {
          if (setData.status === 'deleted') {
            deletedKeysQueried = true
            return {
              where: async () => [{ count: 1 }],
            }
          }
          if (setData.status === 'attached') {
            attachedKeysQueried = true
            return {
              where: () => ({
                returning: async () => [{ fileKey: 'media/2026-09-04/3.jpg' }],
              }),
            }
          }
          return { where: async () => [] }
        },
      }),
    }

    await reconcileEntityMedia(mockExecutor, {
      entityType: 'post',
      entityId: postId,
      profileId: userId,
      newFileKeys: newKeys,
      oldFileKeys: oldKeys,
    })

    expect(deletedKeysQueried).toBe(true)
    expect(attachedKeysQueried).toBe(true)
  })
})
