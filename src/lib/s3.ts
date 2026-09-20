import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HTTPException } from 'hono/http-exception'
import { env } from '../config/env'
import { generateSnowflakeId } from './snowflake'

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
export type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number]

export const ALLOWED_TYPES: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
}

import { MAX_UPLOAD_FILE_SIZE_BYTES, DEFAULT_PRESIGN_TTL_SECONDS } from '../config/constants'

export const MAX_UPLOAD_FILE_SIZE = MAX_UPLOAD_FILE_SIZE_BYTES
export { DEFAULT_PRESIGN_TTL_SECONDS }

export const FILE_KEY_REGEX = /^media\/\d{4}-\d{2}-\d{2}\/\d{1,20}\.[a-zA-Z0-9]+$/

export function isValidFileKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  return FILE_KEY_REGEX.test(key)
}

export const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export interface PresignedUploadOptions {
  ext: string
  contentType: string
  size?: number
  expiresIn?: number
}

export interface PresignedUploadResult {
  uploadUrl: string
  fileKey: string
  expiresIn: number
}

export async function createPresignedUploadUrl(
  options: PresignedUploadOptions
): Promise<PresignedUploadResult> {
  const normalizedExt = options.ext.toLowerCase().trim()
  const normalizedMime = options.contentType.toLowerCase().trim()

  const allowedMimes = ALLOWED_TYPES[normalizedExt]
  if (!allowedMimes || !allowedMimes.includes(normalizedMime)) {
    throw new HTTPException(400, {
      message: 'Unsupported or mismatched file type and extension',
    })
  }

  if (options.size !== undefined) {
    if (options.size <= 0 || options.size > MAX_UPLOAD_FILE_SIZE) {
      throw new HTTPException(400, {
        message: `File size must be positive and not exceed ${MAX_UPLOAD_FILE_SIZE / (1024 * 1024)}MB`,
      })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const fileId = generateSnowflakeId().toString()
  const fileKey = `media/${today}/${fileId}.${normalizedExt}`
  const rawTtl = options.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS
  const ttl = Math.min(Math.max(rawTtl, 1), 604800) // S3 max TTL is 7 days (604800 seconds)

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: fileKey,
    ContentType: normalizedMime,
    ...(options.size !== undefined ? { ContentLength: options.size } : {}),
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: ttl,
  })

  return {
    uploadUrl,
    fileKey,
    expiresIn: ttl,
  }
}

export interface S3DeleteResult {
  deleted: string[]
  errors: Array<{
    key?: string
    code?: string
    message?: string
  }>
}

export async function deleteObjectsFromR2(keys: string[]): Promise<S3DeleteResult> {
  if (keys.length === 0) {
    return { deleted: [], errors: [] }
  }

  const allDeleted: string[] = []
  const allErrors: S3DeleteResult['errors'] = []
  const CHUNK_SIZE = 1000

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE)
    const command = new DeleteObjectsCommand({
      Bucket: env.R2_BUCKET_NAME,
      Delete: {
        Objects: chunk.map((key) => ({ Key: key })),
        Quiet: false,
      },
    })

    try {
      const response = await s3Client.send(command)

      const deleted = (response.Deleted ?? [])
        .map((item) => item.Key)
        .filter((key): key is string => Boolean(key))
      allDeleted.push(...deleted)

      if (response.Errors && response.Errors.length > 0) {
        allErrors.push(
          ...response.Errors.map((err) => ({
            key: err.Key,
            code: err.Code,
            message: err.Message,
          }))
        )
      }
    } catch (err) {
      allErrors.push({
        message: err instanceof Error ? err.message : 'Failed to delete batch from S3/R2',
      })
    }
  }

  return { deleted: allDeleted, errors: allErrors }
}
