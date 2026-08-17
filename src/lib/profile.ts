import { eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db'
import { profiles, type Profile, type ProfileWithIdentity, type OnboardingInput, type UpdateProfileInput } from '../db/schema/profiles'
import { identities, type Identity } from '../db/schema/identities'

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

export async function getProfileByAccountId(
  accountId: bigint
): Promise<ProfileWithIdentity | null> {
  try {
    const [result] = await db
      .select({
        profile: profiles,
        identity: identities,
      })
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(profiles.accountId, accountId))
      .limit(1)

    if (!result || !result.profile) {
      return null
    }

    return {
      ...result.profile,
      identity: result.identity ?? null,
    }
  } catch (error) {
    console.error('Error fetching profile for account:', error)
    return null
  }
}

export async function completeOnboarding(
  accountId: bigint,
  input: OnboardingInput
): Promise<ProfileWithIdentity> {
  const normalizedIdentity = input.identity.trim().toLowerCase()

  return await db.transaction(async (tx) => {
    const existingIdentity = await tx.query.identities.findFirst({
      where: eq(sql`lower(${identities.identity})`, normalizedIdentity),
    })

    if (existingIdentity) {
      throw new HTTPException(409, { message: `Identity '${input.identity}' is already taken` })
    }

    const existingProfile = await tx.query.profiles.findFirst({
      where: eq(profiles.accountId, accountId),
    })

    if (existingProfile && existingProfile.identityId) {
      throw new HTTPException(400, { message: 'Onboarding has already been completed for this account' })
    }

    const [createdIdentity] = await tx
      .insert(identities)
      .values({
        identity: normalizedIdentity,
        type: 'user',
      })
      .returning()

    if (!createdIdentity) {
      throw new HTTPException(500, { message: 'Failed to create identity' })
    }

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

export async function updateProfile(
  accountId: bigint,
  input: UpdateProfileInput
): Promise<ProfileWithIdentity> {
  const existingProfile = await getProfileByAccountId(accountId)

  if (!existingProfile) {
    throw new HTTPException(404, { message: 'Profile not found' })
  }

  // Gender (is_male) is immutable once set during onboarding
  if (
    existingProfile.isMale !== null &&
    input.isMale !== undefined &&
    input.isMale !== existingProfile.isMale
  ) {
    throw new HTTPException(400, { message: 'Gender (is_male) cannot be modified once set' })
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
