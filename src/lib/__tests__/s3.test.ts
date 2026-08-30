import { describe, it, expect } from 'bun:test'
import {
  isValidFileKey,
  createPresignedUploadUrl,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_TYPES,
  FILE_KEY_REGEX,
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

  it('generates presigned upload URL with valid extension and mime type', async () => {
    const result = await createPresignedUploadUrl({
      ext: 'jpg',
      contentType: 'image/jpeg',
    })

    expect(result.uploadUrl).toBeString()
    expect(result.uploadUrl).toContain('X-Amz-Signature')
    expect(result.fileKey).toMatch(FILE_KEY_REGEX)
    expect(result.fileKey.endsWith('.jpg')).toBe(true)
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

  it('has expected image extensions defined', () => {
    expect(ALLOWED_IMAGE_EXTENSIONS).toEqual(['jpg', 'jpeg', 'png', 'webp'])
    expect(ALLOWED_TYPES.jpg).toEqual(['image/jpeg'])
    expect(ALLOWED_TYPES.png).toEqual(['image/png'])
    expect(ALLOWED_TYPES.webp).toEqual(['image/webp'])
  })
})
