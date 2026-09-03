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

export const MAX_UPLOAD_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const DEFAULT_PRESIGN_TTL_SECONDS = 900 // 15 minutes

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
  const ttl = options.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS

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

  const command = new DeleteObjectsCommand({
    Bucket: env.R2_BUCKET_NAME,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
      Quiet: false,
    },
  })

  const response = await s3Client.send(command)

  const deleted = (response.Deleted ?? [])
    .map((item) => item.Key)
    .filter((key): key is string => Boolean(key))

  const errors = (response.Errors ?? []).map((err) => ({
    key: err.Key,
    code: err.Code,
    message: err.Message,
  }))

  return { deleted, errors }
}
