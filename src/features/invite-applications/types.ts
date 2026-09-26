export interface CreateInviteApplicationInput {
  name: string
  about: string
  reason: string
  contact: string
  turnstileToken: string
  website?: string
}

export interface SubmitInviteApplicationResult {
  success: boolean
  message: string
  id: bigint
}

export interface ApplicationSubmissionMetadata {
  ip: string
  userAgent?: string | null
}
