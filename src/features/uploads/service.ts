import { createPresignedUploadUrl } from '../../lib/s3'
import type { PresignRequestInput, PresignResponse } from './types'

const PRESIGN_EXPIRATION_SECONDS = 600 // 10 minutes

export async function generateUploadPresignedUrl(
  input: PresignRequestInput
): Promise<PresignResponse> {
  const result = await createPresignedUploadUrl({
    ext: input.ext,
    contentType: input.contentType,
    expiresIn: PRESIGN_EXPIRATION_SECONDS,
  })

  return {
    success: true,
    uploadUrl: result.uploadUrl,
    fileKey: result.fileKey,
    expiresIn: PRESIGN_EXPIRATION_SECONDS,
  }
}
