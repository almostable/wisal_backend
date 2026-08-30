import type { PresignRequestInput, MediaItemInput, MediaPayloadInput } from './schema'

export type { PresignRequestInput, MediaItemInput, MediaPayloadInput }

export interface PresignResponse {
  success: true
  uploadUrl: string
  fileKey: string
  expiresIn: number
}
