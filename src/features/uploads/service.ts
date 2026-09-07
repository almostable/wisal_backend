import { and, eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { mediaUploads } from '../../db/schema/media-uploads'
import { createPresignedUploadUrl, DEFAULT_PRESIGN_TTL_SECONDS } from '../../lib/s3'
import type {
  PresignRequestInput,
  PresignResponse,
  AttachMediaOptions,
  MarkEntityMediaDeletedOptions,
  ReconcileMediaOptions,
} from './types'

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function generateUploadPresignedUrl(
  input: PresignRequestInput,
  profileId: bigint,
  executor: DbExecutor = db
): Promise<PresignResponse> {
  const result = await createPresignedUploadUrl({
    ext: input.ext,
    contentType: input.contentType,
    size: input.size,
    expiresIn: DEFAULT_PRESIGN_TTL_SECONDS,
  })

  await executor.insert(mediaUploads).values({
    fileKey: result.fileKey,
    profileId,
    status: 'pending',
  })

  return {
    success: true,
    uploadUrl: result.uploadUrl,
    fileKey: result.fileKey,
    expiresIn: result.expiresIn,
  }
}

export async function attachMediaFiles(
  executor: DbExecutor,
  options: AttachMediaOptions
): Promise<void> {
  const { fileKeys, profileId, entityType, entityId } = options
  if (fileKeys.length === 0) return

  const uniqueKeys = Array.from(new Set(fileKeys))
  if (uniqueKeys.length !== fileKeys.length) {
    throw new HTTPException(400, {
      message: 'Duplicate media file keys provided',
    })
  }

  const updatedRows = await executor
    .update(mediaUploads)
    .set({
      status: 'attached',
      entityType,
      entityId,
    })
    .where(
      and(
        inArray(mediaUploads.fileKey, uniqueKeys),
        eq(mediaUploads.profileId, profileId),
        eq(mediaUploads.status, 'pending')
      )
    )
    .returning({ fileKey: mediaUploads.fileKey })

  if (updatedRows.length !== uniqueKeys.length) {
    throw new HTTPException(400, {
      message:
        'Invalid media files: one or more files are invalid, already attached, or do not belong to you',
    })
  }
}

export async function markEntityMediaDeleted(
  executor: DbExecutor,
  options: MarkEntityMediaDeletedOptions
): Promise<void> {
  await executor
    .update(mediaUploads)
    .set({ status: 'deleted' })
    .where(
      and(
        eq(mediaUploads.entityType, options.entityType),
        eq(mediaUploads.entityId, options.entityId),
        eq(mediaUploads.status, 'attached')
      )
    )
}

export async function reconcileEntityMedia(
  executor: DbExecutor,
  options: ReconcileMediaOptions
): Promise<void> {
  const toDelete = options.oldFileKeys.filter((k) => !options.newFileKeys.includes(k))
  const toAdd = options.newFileKeys.filter((k) => !options.oldFileKeys.includes(k))

  if (toDelete.length > 0) {
    await executor
      .update(mediaUploads)
      .set({ status: 'deleted' })
      .where(
        and(
          inArray(mediaUploads.fileKey, toDelete),
          eq(mediaUploads.entityType, options.entityType),
          eq(mediaUploads.entityId, options.entityId),
          eq(mediaUploads.status, 'attached')
        )
      )
  }

  if (toAdd.length > 0) {
    await attachMediaFiles(executor, {
      fileKeys: toAdd,
      profileId: options.profileId,
      entityType: options.entityType,
      entityId: options.entityId,
    })
  }
}
