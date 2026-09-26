import type {
  PresignRequestInput,
  MediaItemInput,
  PostMediaPayloadInput,
  CommentMediaPayloadInput,
  MediaPayloadInput,
} from './schema'
import type { MediaUploadStatus, MediaEntityType } from '../../db/schema/media-uploads'

export type {
  PresignRequestInput,
  MediaItemInput,
  PostMediaPayloadInput,
  CommentMediaPayloadInput,
  MediaPayloadInput,
  MediaUploadStatus,
  MediaEntityType,
}

export interface PresignResponse {
  success: true
  uploadUrl: string
  fileKey: string
  expiresIn: number
}

export interface AttachMediaOptions {
  fileKeys: string[]
  profileId: bigint
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
  profileId: bigint
  newFileKeys: string[]
  oldFileKeys: string[]
}
