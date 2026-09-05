import { eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db'
import { profiles, type Profile, type ProfileWithIdentity, type OnboardingInput, type UpdateProfileInput, type Contacts } from '../db/schema/profiles'
import { identities, identityFormatSchema, createIdentityFormatSchema, type Identity } from '../db/schema/identities'
import { attachMediaFiles, reconcileEntityMedia } from '../features/uploads/service'

export interface SafeProfile {
  id: bigint
  name: string | null
  isMale: boolean | null
  avatarKey: string | null
  description: string | null
  shortDescription: string | null
  countryCode: string | null
  cityId: string | null
  contacts: Contacts | null
  identity: string | null
  regularFollowersCount: number
  followersCount?: number
  isVerified: boolean
  isFollowing?: boolean
  isBlocked?: boolean
  isHidden?: boolean
}

export type ProfileRecord = Omit<Profile, 'identity' | 'searchText'> & {
  identity?: Identity | null | string
  searchText?: string | null
}

export function formatProfileResponse(
  profile: ProfileRecord | null,
  flags?: { isFollowing?: boolean; includeFollowersCount?: boolean }
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
    shortDescription: profile.shortDescription ?? null,
    countryCode: profile.countryCode ?? null,
    cityId: profile.cityId ?? null,
    contacts: profile.contacts ?? null,
    identity: identityStr,
    regularFollowersCount: profile.regularFollowersCount ?? 0,
    isVerified: Boolean(profile.verifiedAt),
  }

  if (flags?.includeFollowersCount) {
    res.followersCount = profile.followersCount ?? 0
  }

  if (flags?.isFollowing !== undefined) {
    res.isFollowing = flags.isFollowing
  }

  return res
}

export function formatRestrictedProfileResponse(
  profile: ProfileRecord | null,
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
    shortDescription: null,
    countryCode: null,
    cityId: null,
    contacts: null,
    identity: identityStr,
    regularFollowersCount: 0,
    isVerified: Boolean(profile.verifiedAt),
  }

  if (flags.isBlocked) {
    res.isBlocked = true
  }
  if (flags.isHidden) {
    res.isHidden = true
  }
  if (flags.isFollowing !== undefined) {
    res.isFollowing = flags.isFollowing
  }

  return res
}

export function isOnboardingCompleted(
  profile: ProfileRecord | null | undefined
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

    const isVerified = Boolean(existingProfile?.verifiedAt)
    const minLength = isVerified ? 3 : 5
    if (normalizedIdentity.length < minLength) {
      throw new HTTPException(400, {
        message: `Identity must be at least ${minLength} characters long`,
      })
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
          identity: normalizedIdentity,
          isMale: input.isMale,
          avatarKey: input.avatarKey ?? null,
          description: input.description?.trim() ?? null,
          shortDescription: input.shortDescription?.trim() ?? null,
          countryCode: input.countryCode ?? null,
          cityId: input.cityId?.trim() ?? null,
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
          identity: normalizedIdentity,
          isMale: input.isMale,
          avatarKey: input.avatarKey ?? null,
          description: input.description?.trim() ?? null,
          shortDescription: input.shortDescription?.trim() ?? null,
          countryCode: input.countryCode ?? null,
          cityId: input.cityId?.trim() ?? null,
          contacts: input.contacts ?? null,
          identityId: createdIdentity.id,
        })
        .returning()

      finalProfile = inserted
    }

    if (input.avatarKey) {
      await attachMediaFiles(tx, {
        fileKeys: [input.avatarKey],
        userId: accountId,
        entityType: 'avatar',
        entityId: accountId,
      })
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
      const isVerified = Boolean(existingProfile.verifiedAt)
      const minLength = isVerified ? 3 : 5
      if (normalizedIdentity.length < minLength) {
        throw new HTTPException(400, {
          message: `Identity must be at least ${minLength} characters long`,
        })
      }

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
          updateData.identity = normalizedIdentity
        } else {
          const [created] = await tx
            .insert(identities)
            .values({ identity: normalizedIdentity })
            .returning()
          updatedIdentity = created
          updateData.identityId = created.id
          updateData.identity = normalizedIdentity
        }
      }
    }

    if (input.name !== undefined) {
      updateData.name = input.name.trim()
    }
    if (input.avatarKey !== undefined) {
      updateData.avatarKey = input.avatarKey
      const oldAvatarKeys = existingProfile.avatarKey ? [existingProfile.avatarKey] : []
      const newAvatarKeys = input.avatarKey ? [input.avatarKey] : []
      if (oldAvatarKeys.length > 0 || newAvatarKeys.length > 0) {
        await reconcileEntityMedia(tx, {
          entityType: 'avatar',
          entityId: accountId,
          userId: accountId,
          newFileKeys: newAvatarKeys,
          oldFileKeys: oldAvatarKeys,
        })
      }
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() ?? null
    }
    if (input.shortDescription !== undefined) {
      updateData.shortDescription = input.shortDescription?.trim() ?? null
    }
    if (input.countryCode !== undefined) {
      updateData.countryCode = input.countryCode ?? null
    }
    if (input.cityId !== undefined) {
      updateData.cityId = input.cityId?.trim() ?? null
    }
    if (input.contacts !== undefined) {
      updateData.contacts = input.contacts ?? null
    }
    if (existingProfile.isMale === null && input.isMale !== undefined) {
      updateData.isMale = input.isMale
    }

    let updatedProfile: Profile | null = null

    if (Object.keys(updateData).length > 0) {
      const [updated] = await tx
        .update(profiles)
        .set(updateData)
        .where(eq(profiles.id, existingProfile.id))
        .returning()
      updatedProfile = updated
    }

    return {
      ...existingProfile,
      ...(updatedProfile ?? {}),
      identity: updatedIdentity,
    }
  })
}

export async function getProfileByIdentity(
  identityHandle: string
): Promise<ProfileWithIdentity | null> {
  const normalized = identityHandle.trim().toLowerCase()

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
}

export async function checkIdentityAvailable(
  identityHandle: string,
  isVerified: boolean = false
): Promise<{ available: boolean; reason?: string }> {
  const schema = createIdentityFormatSchema(isVerified)
  const parsed = schema.safeParse(identityHandle)
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


