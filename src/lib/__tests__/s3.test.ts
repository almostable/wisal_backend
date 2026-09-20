import { describe, it, expect, mock } from 'bun:test'
import {
  isValidFileKey,
  createPresignedUploadUrl,
  deleteObjectsFromR2,
  s3Client,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_TYPES,
  FILE_KEY_REGEX,
  MAX_UPLOAD_FILE_SIZE,
  DEFAULT_PRESIGN_TTL_SECONDS,
} from '../s3'

describe('S3 / R2 Utilities', () => {
  it('validates correct fileKey formats', () => {
    expect(isValidFileKey('media/2026-08-30/723491823749128301.jpg')).toBe(true)
    expect(isValidFileKey('media/2026-08-30/723491823749128301.jpeg')).toBe(true)
    expect(isValidFileKey('media/2026-08-30/723491823749128301.png')).toBe(true)
    expect(isValidFileKey('media/2026-08-30/723491823749128301.webp')).toBe(true)
  })

  it('rejects invalid fileKey formats', () => {
    expect(isValidFileKey('')).toBe(false)
    expect(isValidFileKey(null)).toBe(false)
    expect(isValidFileKey(123)).toBe(false)
    expect(isValidFileKey('http://example.com/image.jpg')).toBe(false)
    expect(isValidFileKey('avatars/photo.jpg')).toBe(false)
    expect(isValidFileKey('../../../etc/passwd')).toBe(false)
    expect(isValidFileKey('media/2026-08-30/abc.jpg')).toBe(false) // not numeric snowflake
  })

  it('generates presigned upload URL with valid extension and mime type and default 15m TTL', async () => {
    const result = await createPresignedUploadUrl({
      ext: 'jpg',
      contentType: 'image/jpeg',
    })

    expect(result.uploadUrl).toBeString()
    expect(result.uploadUrl).toContain('X-Amz-Signature')
    expect(result.fileKey).toMatch(FILE_KEY_REGEX)
    expect(result.fileKey.endsWith('.jpg')).toBe(true)
    expect(result.expiresIn).toBe(900)
  })

  it('generates presigned upload URL with valid size parameter', async () => {
    const result = await createPresignedUploadUrl({
      ext: 'png',
      contentType: 'image/png',
      size: 1024 * 1024,
    })

    expect(result.uploadUrl).toBeString()
    expect(result.uploadUrl).toContain('X-Amz-Signature')
    expect(result.fileKey.endsWith('.png')).toBe(true)
    expect(result.expiresIn).toBe(900)
  })

  it('rejects size <= 0 or exceeding MAX_UPLOAD_FILE_SIZE with 400', async () => {
    await expect(
      createPresignedUploadUrl({
        ext: 'jpg',
        contentType: 'image/jpeg',
        size: 0,
      })
    ).rejects.toThrow('File size must be positive and not exceed 10MB')

    await expect(
      createPresignedUploadUrl({
        ext: 'jpg',
        contentType: 'image/jpeg',
        size: 11 * 1024 * 1024,
      })
    ).rejects.toThrow('File size must be positive and not exceed 10MB')
  })

  it('throws HTTPException for mismatched or unsupported file types', async () => {
    await expect(
      createPresignedUploadUrl({
        ext: 'jpg',
        contentType: 'image/png',
      })
    ).rejects.toThrow('Unsupported or mismatched file type and extension')

    await expect(
      createPresignedUploadUrl({
        ext: 'exe',
        contentType: 'application/octet-stream',
      })
    ).rejects.toThrow('Unsupported or mismatched file type and extension')
  })

  it('deleteObjectsFromR2 returns empty arrays when given empty keys', async () => {
    const result = await deleteObjectsFromR2([])
    expect(result).toEqual({ deleted: [], errors: [] })
  })

  it('deleteObjectsFromR2 sends DeleteObjectsCommand and parses response', async () => {
    const originalSend = s3Client.send
    s3Client.send = (async (command: any) => {
      return {
        Deleted: [
          { Key: 'media/2026-09-04/111.jpg' },
          { Key: 'media/2026-09-04/222.jpg' },
        ],
        Errors: [{ Key: 'media/2026-09-04/333.jpg', Code: 'AccessDenied', Message: 'Denied' }],
      }
    }) as any

    try {
      const result = await deleteObjectsFromR2([
        'media/2026-09-04/111.jpg',
        'media/2026-09-04/222.jpg',
        'media/2026-09-04/333.jpg',
      ])

      expect(result.deleted).toEqual([
        'media/2026-09-04/111.jpg',
        'media/2026-09-04/222.jpg',
      ])
      expect(result.errors).toEqual([
        {
          key: 'media/2026-09-04/333.jpg',
          code: 'AccessDenied',
          message: 'Denied',
        },
      ])
    } finally {
      s3Client.send = originalSend
    }
  })

  it('deleteObjectsFromR2 chunks requests into batches of 1000 keys', async () => {
    const originalSend = s3Client.send
    const sentBatches: any[] = []

    s3Client.send = (async (command: any) => {
      sentBatches.push(command)
      return {
        Deleted: command.input.Delete.Objects.map((o: any) => ({ Key: o.Key })),
        Errors: [],
      }
    }) as any

    try {
      const largeKeyList = Array.from({ length: 2500 }, (_, i) => `media/2026-09-04/${i}.jpg`)
      const result = await deleteObjectsFromR2(largeKeyList)

      expect(sentBatches.length).toBe(3) // 1000 + 1000 + 500
      expect(sentBatches[0].input.Delete.Objects.length).toBe(1000)
      expect(sentBatches[1].input.Delete.Objects.length).toBe(1000)
      expect(sentBatches[2].input.Delete.Objects.length).toBe(500)
      expect(result.deleted.length).toBe(2500)
      expect(result.errors.length).toBe(0)
    } finally {
      s3Client.send = originalSend
    }
  })

  it('has expected image extensions and limits defined', () => {
    expect(ALLOWED_IMAGE_EXTENSIONS).toEqual(['jpg', 'jpeg', 'png', 'webp'])
    expect(ALLOWED_TYPES.jpg).toEqual(['image/jpeg'])
    expect(ALLOWED_TYPES.png).toEqual(['image/png'])
    expect(ALLOWED_TYPES.webp).toEqual(['image/webp'])
    expect(MAX_UPLOAD_FILE_SIZE).toBe(10 * 1024 * 1024)
    expect(DEFAULT_PRESIGN_TTL_SECONDS).toBe(900)
  })
})
