import { eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db'
import { profiles, type Profile, type ProfileWithIdentity, type OnboardingInput, type UpdateProfileInput, type Contacts } from '../db/schema/profiles'
import { identities, identityFormatSchema, type Identity } from '../db/schema/identities'

export interface SafeProfile {
  id: bigint
  name: string | null
  isMale: boolean | null
  avatarKey: string | null
  description: string | null
  contacts: Contacts | null
  createdAt: Date
  updatedAt: Date
  identity: string | null
  isFollowing?: boolean
  isBlocked?: boolean
  is_blocked?: boolean
  isHidden?: boolean
  is_hidden?: boolean
}

export function formatProfileResponse(
  profile: (Profile & { identity?: Identity | null | string }) | null,
  flags?: { isFollowing?: boolean }
): SafeProfile | null {
  if (!profile) return null

  const identityStr =
    typeof profile.identity === 'string'
      ? profile.identity
      : profile.identity?.identity ?? null

  const res: SafeProfile = {
    id: profile.id,
    name: profile.name,
    isMale: profile.isMale,
    avatarKey: profile.avatarKey,
    description: profile.description,
    contacts: profile.contacts ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    identity: identityStr,
  }

  if (flags?.isFollowing !== undefined) {
    res.isFollowing = flags.isFollowing
  }

  return res
}

export function formatRestrictedProfileResponse(
  profile: (Profile & { identity?: Identity | null | string }) | null,
  flags: { isBlocked?: boolean; isHidden?: boolean; isFollowing?: boolean }
): SafeProfile | null {
  if (!profile) return null

  const identityStr =
    typeof profile.identity === 'string'
      ? profile.identity
      : profile.identity?.identity ?? null

  const res: SafeProfile = {
    id: profile.id,
    name: profile.name,
    isMale: profile.isMale,
    avatarKey: null,
    description: null,
    contacts: null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    identity: identityStr,
  }

  if (flags.isBlocked) {
    res.isBlocked = true
    res.is_blocked = true
  }
  if (flags.isHidden) {
    res.isHidden = true
    res.is_hidden = true
  }
  if (flags.isFollowing !== undefined) {
    res.isFollowing = flags.isFollowing
  }

  return res
}

export function isOnboardingCompleted(
  profile: (Profile & { identity?: Identity | null | string }) | null | undefined
): boolean {
  if (!profile) return false
  const hasIdentity =
    typeof profile.identity === 'string'
      ? profile.identity.trim().length > 0
      : Boolean(profile.identity && profile.identity.id)

  return (
    typeof profile.name === 'string' &&
    profile.name.trim().length > 0 &&
    typeof profile.isMale === 'boolean' &&
    hasIdentity
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
      identity: result.identity && result.identity.id ? result.identity : null,
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
          contacts: input.contacts ?? null,
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
          contacts: input.contacts ?? null,
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
  return await db.transaction(async (tx) => {
    const [existingResult] = await tx
      .select({
        profile: profiles,
        identity: identities,
      })
      .from(profiles)
      .leftJoin(identities, eq(profiles.identityId, identities.id))
      .where(eq(profiles.accountId, accountId))
      .limit(1)

    if (!existingResult || !existingResult.profile) {
      throw new HTTPException(404, { message: 'Profile not found' })
    }

    const existingProfile: ProfileWithIdentity = {
      ...existingResult.profile,
      identity: existingResult.identity && existingResult.identity.id ? existingResult.identity : null,
    }

    // Gender (is_male) is immutable once set during onboarding
    if (
      existingProfile.isMale !== null &&
      input.isMale !== undefined &&
      input.isMale !== existingProfile.isMale
    ) {
      throw new HTTPException(400, { message: 'Gender (is_male) cannot be modified once set' })
    }

    let updatedIdentity: Identity | null = existingProfile.identity
    const updateData: Partial<typeof profiles.$inferInsert> = {}

    if (input.identity !== undefined) {
      const normalizedIdentity = input.identity.trim().toLowerCase()

      if (!existingProfile.identity || existingProfile.identity.identity.toLowerCase() !== normalizedIdentity) {
        const existingIdentityRecord = await tx.query.identities.findFirst({
          where: eq(sql`lower(${identities.identity})`, normalizedIdentity),
        })

        if (existingIdentityRecord && existingIdentityRecord.id !== existingProfile.identityId) {
          throw new HTTPException(409, { message: `Identity '${input.identity}' is already taken` })
        }

        if (existingProfile.identityId) {
          const [updated] = await tx
            .update(identities)
            .set({ identity: normalizedIdentity })
            .where(eq(identities.id, existingProfile.identityId))
            .returning()
          updatedIdentity = updated
        } else {
          const [created] = await tx
            .insert(identities)
            .values({ identity: normalizedIdentity })
            .returning()
          updatedIdentity = created
          updateData.identityId = created.id
        }
      }
    }

    if (input.name !== undefined) {
      updateData.name = input.name.trim()
    }
    if (input.avatarKey !== undefined) {
      updateData.avatarKey = input.avatarKey
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() ?? null
    }
    if (input.contacts !== undefined) {
      updateData.contacts = input.contacts ?? null
    }
    if (existingProfile.isMale === null && input.isMale !== undefined) {
      updateData.isMale = input.isMale
    }

    let finalProfile: Profile = existingProfile

    if (Object.keys(updateData).length > 0) {
      const [updated] = await tx
        .update(profiles)
        .set(updateData)
        .where(eq(profiles.id, existingProfile.id))
        .returning()
      finalProfile = updated
    }

    return {
      ...finalProfile,
      identity: updatedIdentity,
    }
  })
}

export async function getProfileByIdentity(
  identityHandle: string
): Promise<ProfileWithIdentity | null> {
  const normalized = identityHandle.trim().toLowerCase()

  try {
    const [result] = await db
      .select({
        profile: profiles,
        identity: identities,
      })
      .from(identities)
      .innerJoin(profiles, eq(identities.id, profiles.identityId))
      .where(eq(sql`lower(${identities.identity})`, normalized))
      .limit(1)

    if (!result || !result.profile) {
      return null
    }

    return {
      ...result.profile,
      identity: result.identity,
    }
  } catch (error) {
    console.error('Error fetching profile by identity:', error)
    return null
  }
}

export async function checkIdentityAvailable(
  identityHandle: string
): Promise<{ available: boolean; reason?: string }> {
  const parsed = identityFormatSchema.safeParse(identityHandle)
  if (!parsed.success) {
    return {
      available: false,
      reason: parsed.error.issues[0]?.message ?? 'Invalid identity format',
    }
  }

  const normalized = parsed.data

  const existing = await db.query.identities.findFirst({
    where: eq(sql`lower(${identities.identity})`, normalized),
  })

  if (existing) {
    return { available: false, reason: `Identity '${normalized}' is already taken` }
  }

  return { available: true }
}


