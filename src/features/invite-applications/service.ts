import { eq, and, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../../db'
import { accounts } from '../../db/schema/accounts'
import { inviteApplications } from '../../db/schema/invite-applications'
import { verifyTurnstileToken } from '../../lib/turnstile'
import { normalizeContact } from './schema'
import type {
  CreateInviteApplicationInput,
  SubmitInviteApplicationResult,
  ApplicationSubmissionMetadata,
} from './types'

export async function submitInviteApplication(
  input: CreateInviteApplicationInput,
  metadata: ApplicationSubmissionMetadata
): Promise<SubmitInviteApplicationResult> {
  // Honeypot check: reject if hidden bot field is populated
  if (input.website && input.website.trim().length > 0) {
    throw new HTTPException(400, { message: 'Invalid submission' })
  }

  // Turnstile Captcha verification
  const isCaptchaValid = await verifyTurnstileToken(input.turnstileToken, metadata.ip)
  if (!isCaptchaValid) {
    throw new HTTPException(400, { message: 'Captcha verification failed' })
  }

  const normalizedContact = normalizeContact(input.contact)
  if (!normalizedContact) {
    throw new HTTPException(400, { message: 'Invalid contact information' })
  }

  // Implicit check: if contact is an email, ensure it's not already registered
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.trim())
  if (isEmail) {
    const existingAccount = await db.query.accounts.findFirst({
      where: eq(sql`lower(${accounts.email})`, normalizedContact),
    })

    if (existingAccount) {
      throw new HTTPException(400, {
        message: 'Invalid contact information or application cannot be accepted',
      })
    }
  }

  // Deduplication check: prevent duplicate pending applications for the same contact
  const existingPending = await db.query.inviteApplications.findFirst({
    where: and(
      eq(inviteApplications.contactNormalized, normalizedContact),
      eq(inviteApplications.status, 'pending')
    ),
  })

  if (existingPending) {
    throw new HTTPException(409, {
      message: 'Application with this contact is already pending review',
    })
  }

  const [created] = await db
    .insert(inviteApplications)
    .values({
      name: input.name.trim(),
      about: input.about.trim(),
      reason: input.reason.trim(),
      contact: input.contact.trim(),
      contactNormalized: normalizedContact,
      status: 'pending',
      ip: metadata.ip,
      userAgent: metadata.userAgent ?? null,
    })
    .returning()

  if (!created) {
    throw new HTTPException(500, { message: 'Failed to submit application' })
  }

  return {
    success: true,
    message: 'Application submitted successfully',
    id: created.id,
  }
}
