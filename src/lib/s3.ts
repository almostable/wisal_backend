import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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

export interface PresignedUploadResult {
  uploadUrl: string
  fileKey: string
}

export async function createPresignedUploadUrl(options: {
  ext: string
  contentType: string
  expiresIn?: number
}): Promise<PresignedUploadResult> {
  const normalizedExt = options.ext.toLowerCase().trim()
  const normalizedMime = options.contentType.toLowerCase().trim()

  const allowedMimes = ALLOWED_TYPES[normalizedExt]
  if (!allowedMimes || !allowedMimes.includes(normalizedMime)) {
    throw new HTTPException(400, {
      message: 'Unsupported or mismatched file type and extension',
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const fileId = generateSnowflakeId().toString()
  const fileKey = `media/${today}/${fileId}.${normalizedExt}`

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: fileKey,
    ContentType: normalizedMime,
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: options.expiresIn ?? 600,
  })

  return {
    uploadUrl,
    fileKey,
  }
}
