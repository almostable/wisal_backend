import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { profiles, type Profile, type ProfileWithIdentity, type OnboardingInput, type UpdateProfileInput } from '../db/schema/profiles'
import { identities, type Identity } from '../db/schema/identities'

export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'ALREADY_COMPLETED' | 'IDENTITY_TAKEN' | 'GENDER_IMMUTABLE' | 'VALIDATION_ERROR',
    public readonly status: number = 400
  ) {
    super(message)
    this.name = 'ProfileError'
  }
}

/**
 * Checks if a profile has completed all required onboarding fields
 * (name, is_male, and identity_id are all set)
 */
export function isOnboardingCompleted(
  profile: (Profile & { identity?: Identity | null }) | null | undefined
): boolean {
  if (!profile) return false
  return (
    typeof profile.name === 'string' &&
    profile.name.trim().length > 0 &&
    typeof profile.isMale === 'boolean' &&
    profile.identityId !== null &&
    Boolean(profile.identity)
  )
}

/**
 * Retrieves profile with associated identity by account Snowflake ID
 */
export async function getProfileByAccountId(
  accountId: bigint
): Promise<ProfileWithIdentity | null> {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
      with: {
        identity: true,
      },
    })

    return (profile as ProfileWithIdentity) ?? null
  } catch (error) {
    console.error('Error fetching profile for account:', error)
    return null
  }
}

/**
 * Completes user onboarding in an atomic transaction:
 * 1. Verifies identity uniqueness across users & communities (case-insensitive)
 * 2. Creates the identity record
 * 3. Creates or updates the user profile record
 */
export async function completeOnboarding(
  accountId: bigint,
  input: OnboardingInput
): Promise<ProfileWithIdentity> {
  const normalizedIdentity = input.identity.trim().toLowerCase()

  return await db.transaction(async (tx) => {
    // 1. Check if identity is already taken
    const existingIdentity = await tx.query.identities.findFirst({
      where: eq(sql`lower(${identities.identity})`, normalizedIdentity),
    })

    if (existingIdentity) {
      throw new ProfileError(
        `Identity '${input.identity}' is already taken`,
        'IDENTITY_TAKEN',
        409
      )
    }

    // 2. Check if profile already exists for this account
    const existingProfile = await tx.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
    })

    if (existingProfile && existingProfile.identityId) {
      throw new ProfileError(
        'Onboarding has already been completed for this account',
        'ALREADY_COMPLETED',
        400
      )
    }

    // 3. Create the identity
    const [createdIdentity] = await tx
      .insert(identities)
      .values({
        identity: normalizedIdentity,
        type: 'user',
      })
      .returning()

    if (!createdIdentity) {
      throw new ProfileError('Failed to create identity', 'VALIDATION_ERROR', 500)
    }

    // 4. Create or update the profile
    let finalProfile: Profile

    if (existingProfile) {
      const [updated] = await tx
        .update(profiles)
        .set({
          name: input.name.trim(),
          isMale: input.isMale,
          avatarKey: input.avatarKey ?? null,
          description: input.description?.trim() ?? null,
          identityId: createdIdentity.id,
        })
        .where(eq(profiles.id, existingProfile.id))
        .returning()

      finalProfile = updated
    } else {
      const [inserted] = await tx
        .insert(profiles)
        .values({
          accountId,
          name: input.name.trim(),
          isMale: input.isMale,
          avatarKey: input.avatarKey ?? null,
          description: input.description?.trim() ?? null,
          identityId: createdIdentity.id,
        })
        .returning()

      finalProfile = inserted
    }

    return {
      ...finalProfile,
      identity: createdIdentity,
    }
  })
}

/**
 * Updates an existing profile.
 * ENFORCES IMMUTABLE GENDER: If `is_male` is already set, it cannot be changed.
 */
export async function updateProfile(
  accountId: bigint,
  input: UpdateProfileInput
): Promise<ProfileWithIdentity> {
  const existingProfile = await getProfileByAccountId(accountId)

  if (!existingProfile) {
    throw new ProfileError(
      'Profile not found. Please complete onboarding first.',
      'NOT_FOUND',
      404
    )
  }

  // Enforce the rule: is_male can only be set once and cannot be changed afterwards
  if (
    existingProfile.isMale !== null &&
    input.isMale !== undefined &&
    input.isMale !== existingProfile.isMale
  ) {
    throw new ProfileError(
      'Gender (is_male) cannot be modified once set',
      'GENDER_IMMUTABLE',
      400
    )
  }

  const updateData: Partial<typeof profiles.$inferInsert> = {}

  if (input.name !== undefined) {
    updateData.name = input.name.trim()
  }
  if (input.avatarKey !== undefined) {
    updateData.avatarKey = input.avatarKey
  }
  if (input.description !== undefined) {
    updateData.description = input.description?.trim() ?? null
  }
  // Only update isMale if it wasn't previously set
  if (existingProfile.isMale === null && input.isMale !== undefined) {
    updateData.isMale = input.isMale
  }

  const [updatedProfile] = await db
    .update(profiles)
    .set(updateData)
    .where(eq(profiles.id, existingProfile.id))
    .returning()

  return {
    ...updatedProfile,
    identity: existingProfile.identity,
  }
}
