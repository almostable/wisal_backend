import type { PresignRequestInput, MediaItemInput, MediaPayloadInput } from './schema'
import type { MediaUploadStatus, MediaEntityType } from '../../db/schema/media-uploads'

export type { PresignRequestInput, MediaItemInput, MediaPayloadInput, MediaUploadStatus, MediaEntityType }

export interface PresignResponse {
  success: true
  uploadUrl: string
  fileKey: string
  expiresIn: number
}

export interface AttachMediaOptions {
  fileKeys: string[]
  userId: bigint
  entityType: MediaEntityType
  entityId: bigint
}

export interface MarkEntityMediaDeletedOptions {
  entityType: MediaEntityType
  entityId: bigint
}

export interface ReconcileMediaOptions {
  entityType: MediaEntityType
  entityId: bigint
  userId: bigint
  newFileKeys: string[]
  oldFileKeys: string[]
}
