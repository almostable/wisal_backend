import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { db, type DbExecutor } from '../../db'
import { accounts } from '../../db/schema/accounts'
import { inviteApplications } from '../../db/schema/invite-applications'
import { verifyTurnstileToken } from '../../lib/turnstile'
import { AppException } from '../../lib/errors'
import { ERROR_CODES } from '../../config/error-codes'
import { normalizeContact } from './schema'
import type {
  CreateInviteApplicationInput,
  SubmitInviteApplicationResult,
  ApplicationSubmissionMetadata,
} from './types'

export async function submitInviteApplication(
  input: CreateInviteApplicationInput,
  metadata: ApplicationSubmissionMetadata,
  executor: DbExecutor = db
): Promise<SubmitInviteApplicationResult> {
  // Honeypot check: reject if hidden bot field is populated
  if (input.website && input.website.trim().length > 0) {
    throw new AppException(400, {
      message: 'Invalid submission',
      code: ERROR_CODES.INVALID_SUBMISSION,
    })
  }

  // Turnstile Captcha verification
  const isCaptchaValid = await verifyTurnstileToken(input.turnstileToken, metadata.ip)
  if (!isCaptchaValid) {
    throw new AppException(400, {
      message: 'Captcha verification failed',
      code: ERROR_CODES.CAPTCHA_FAILED,
    })
  }

  const normalizedContact = normalizeContact(input.contact)
  if (!normalizedContact) {
    throw new AppException(400, {
      message: 'Invalid contact information',
      code: ERROR_CODES.INVALID_CONTACT,
    })
  }

  const submit = async (submissionExecutor: DbExecutor): Promise<SubmitInviteApplicationResult> => {
    // Implicit check: if contact is an email, ensure it's not already registered
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.trim())
    if (isEmail) {
      const existingAccount = await submissionExecutor.query.accounts.findFirst({
        where: eq(sql`lower(${accounts.email})`, normalizedContact),
      })

      if (existingAccount) {
        throw new AppException(400, {
          message: 'Invalid contact information or application cannot be accepted',
          code: ERROR_CODES.CONTACT_ALREADY_EXISTS,
        })
      }
    }

    // IP restrictions: 1 pending application per IP + 24-hour cooldown per IP
    if (metadata.ip && metadata.ip !== 'anonymous') {
      const existingPendingByIp = await submissionExecutor.query.inviteApplications.findFirst({
        where: and(
          eq(inviteApplications.ip, metadata.ip),
          eq(inviteApplications.status, 'pending')
        ),
      })

      if (existingPendingByIp) {
        throw new AppException(409, {
          message: 'An application from this IP address is already pending review',
          code: ERROR_CODES.IP_PENDING_APPLICATION,
          details: {
            status: 'pending',
          },
        })
      }

      const recentApplicationByIp = await submissionExecutor.query.inviteApplications.findFirst({
        where: and(
          eq(inviteApplications.ip, metadata.ip),
          gte(inviteApplications.createdAt, sql`NOW() - INTERVAL '24 HOURS'`)
        ),
        orderBy: [desc(inviteApplications.createdAt)],
      })

      if (recentApplicationByIp) {
        const createdAtMs = recentApplicationByIp.createdAt
          ? new Date(recentApplicationByIp.createdAt).getTime()
          : Date.now()
        const remainingMs = Math.max(0, 24 * 60 * 60 * 1000 - (Date.now() - createdAtMs))
        const retryAfterSeconds = Math.ceil(remainingMs / 1000)

        throw new AppException(429, {
          message: 'Only one application per 24 hours is allowed from this IP address',
          code: ERROR_CODES.IP_COOLDOWN_ACTIVE,
          details: {
            cooldownHours: 24,
            retryAfterSeconds,
          },
        })
      }
    }

    // Deduplication check: prevent duplicate pending applications for the same contact
    const existingPending = await submissionExecutor.query.inviteApplications.findFirst({
      where: and(
        eq(inviteApplications.contactNormalized, normalizedContact),
        eq(inviteApplications.status, 'pending')
      ),
    })

    if (existingPending) {
      throw new AppException(409, {
        message: 'Application with this contact is already pending review',
        code: ERROR_CODES.CONTACT_PENDING_APPLICATION,
        details: {
          status: 'pending',
        },
      })
    }

    const [created] = await submissionExecutor
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
      throw new AppException(500, {
        message: 'Failed to submit application',
        code: ERROR_CODES.APPLICATION_CREATION_FAILED,
      })
    }

    return {
      success: true,
      message: 'Application submitted successfully',
      id: created.id,
    }
  }

  if (executor !== db) return submit(executor)

  return db.transaction(async (tx) => {
    const keys = [`contact:${normalizedContact}`]
    if (metadata.ip && metadata.ip !== 'anonymous') keys.push(`ip:${metadata.ip}`)
    for (const key of keys.sort()) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
    }
    return submit(tx)
  })
}
