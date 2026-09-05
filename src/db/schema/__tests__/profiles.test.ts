import { describe, it, expect } from 'bun:test'
import {
  contactsSchema,
  insertProfileSchema,
  selectProfileSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
  shortDescriptionSchema,
  countryCodeSchema,
  cityIdSchema,
} from '../profiles'

describe('Profiles Schema Tests', () => {
  it('validates valid contacts object with all fields', () => {
    const contacts = {
      telegram: 'https://t.me/username',
      youtube: 'https://youtube.com/@channel',
      instagram: 'https://instagram.com/profile',
      website: 'https://example.com',
      email: 'user@example.com',
    }

    const parsed = contactsSchema.parse(contacts)
    expect(parsed.telegram).toBe('https://t.me/username')
    expect(parsed.youtube).toBe('https://youtube.com/@channel')
    expect(parsed.instagram).toBe('https://instagram.com/profile')
    expect(parsed.website).toBe('https://example.com')
    expect(parsed.email).toBe('user@example.com')
  })

  it('allows partial and null fields in contacts', () => {
    const partialContacts = {
      telegram: 'https://t.me/username',
      youtube: null,
      website: undefined,
    }

    const parsed = contactsSchema.parse(partialContacts)
    expect(parsed.telegram).toBe('https://t.me/username')
    expect(parsed.youtube).toBeNull()
    expect(parsed.instagram).toBeUndefined()
    expect(parsed.website).toBeUndefined()
    expect(parsed.email).toBeUndefined()
  })

  it('rejects invalid URLs in telegram, youtube, instagram, and website', () => {
    expect(() => contactsSchema.parse({ telegram: 'invalid-url' })).toThrow()
    expect(() => contactsSchema.parse({ youtube: 'not a link' })).toThrow()
    expect(() => contactsSchema.parse({ instagram: 'ftp://invalid-domain' })).not.toThrow() // standard valid URL format
    expect(() => contactsSchema.parse({ instagram: 'not_a_valid_url' })).toThrow()
    expect(() => contactsSchema.parse({ website: 'just_text' })).toThrow()
  })

  it('rejects invalid email format in contacts', () => {
    expect(() => contactsSchema.parse({ email: 'not-an-email' })).toThrow()
  })

  it('validates descriptionSchema (1 to 2000 chars, no empty string)', () => {
    expect(descriptionSchema.parse('a')).toBe('a')
    expect(descriptionSchema.parse('Bio text with spaces')).toBe('Bio text with spaces')
    expect(descriptionSchema.parse('a'.repeat(2000))).toBe('a'.repeat(2000))
    expect(() => descriptionSchema.parse('')).toThrow()
    expect(() => descriptionSchema.parse('   ')).toThrow()
    expect(() => descriptionSchema.parse('a'.repeat(2001))).toThrow()
  })

  it('validates shortDescriptionSchema (1 to 110 chars, spaces allowed)', () => {
    expect(shortDescriptionSchema.parse('a')).toBe('a')
    expect(shortDescriptionSchema.parse('Coffee & Code')).toBe('Coffee & Code')
    expect(shortDescriptionSchema.parse('a'.repeat(110))).toBe('a'.repeat(110))
    expect(() => shortDescriptionSchema.parse('')).toThrow()
    expect(() => shortDescriptionSchema.parse('   ')).toThrow()
    expect(() => shortDescriptionSchema.parse('a'.repeat(111))).toThrow()
  })

  it('validates countryCodeSchema (2 chars, uppercase only)', () => {
    expect(countryCodeSchema.parse('US')).toBe('US')
    expect(countryCodeSchema.parse('KZ')).toBe('KZ')
    expect(countryCodeSchema.parse('DE')).toBe('DE')
    expect(() => countryCodeSchema.parse('us')).toThrow()
    expect(() => countryCodeSchema.parse('USA')).toThrow()
    expect(() => countryCodeSchema.parse('U')).toThrow()
    expect(() => countryCodeSchema.parse('12')).toThrow()
    expect(() => countryCodeSchema.parse('')).toThrow()
  })

  it('validates cityIdSchema (up to 64 chars)', () => {
    expect(cityIdSchema.parse('ny')).toBe('ny')
    expect(cityIdSchema.parse('almaty_central_1')).toBe('almaty_central_1')
    expect(cityIdSchema.parse('a'.repeat(64))).toBe('a'.repeat(64))
    expect(() => cityIdSchema.parse('')).toThrow()
    expect(() => cityIdSchema.parse('a'.repeat(65))).toThrow()
  })

  it('validates onboardingInputSchema with new optional fields', () => {
    const input = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      shortDescription: 'Coffee & Code',
      countryCode: 'US',
      cityId: 'city_123',
      contacts: {
        telegram: 'https://t.me/johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsed = onboardingInputSchema.parse(input)
    expect(parsed.shortDescription).toBe('Coffee & Code')
    expect(parsed.countryCode).toBe('US')
    expect(parsed.cityId).toBe('city_123')
    expect(parsed.contacts?.telegram).toBe('https://t.me/johndoe')
    expect(parsed.contacts?.email).toBe('john@wisal.dev')
  })

  it('validates onboardingInputSchema with null or omitted optional fields', () => {
    const inputWithNull = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      shortDescription: null,
      countryCode: null,
      cityId: null,
      contacts: null,
    }
    const parsedWithNull = onboardingInputSchema.parse(inputWithNull)
    expect(parsedWithNull.shortDescription).toBeNull()
    expect(parsedWithNull.countryCode).toBeNull()
    expect(parsedWithNull.cityId).toBeNull()
    expect(parsedWithNull.contacts).toBeNull()

    const inputWithoutFields = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
    }
    const parsedWithout = onboardingInputSchema.parse(inputWithoutFields)
    expect(parsedWithout.shortDescription).toBeUndefined()
    expect(parsedWithout.countryCode).toBeUndefined()
    expect(parsedWithout.cityId).toBeUndefined()
    expect(parsedWithout.contacts).toBeUndefined()
  })

  it('validates updateProfileInputSchema with contacts, identity, and new profile fields', () => {
    const updateInput = {
      identity: 'New_Handle',
      shortDescription: 'Solo Dev',
      countryCode: 'KZ',
      cityId: 'almaty',
      contacts: {
        website: 'https://wisal.dev',
      },
    }

    const parsed = updateProfileInputSchema.parse(updateInput)
    expect(parsed.identity).toBe('new_handle')
    expect(parsed.shortDescription).toBe('Solo Dev')
    expect(parsed.countryCode).toBe('KZ')
    expect(parsed.cityId).toBe('almaty')
    expect(parsed.contacts?.website).toBe('https://wisal.dev')
  })

  it('validates insertProfileSchema and selectProfileSchema with contacts and new fields', () => {
    const insertData = {
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      shortDescription: 'Coffee & Code',
      countryCode: 'US',
      cityId: 'city_nyc',
      contacts: {
        telegram: 'https://t.me/johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsedInsert = insertProfileSchema.parse(insertData)
    expect(parsedInsert.shortDescription).toBe('Coffee & Code')
    expect(parsedInsert.countryCode).toBe('US')
    expect(parsedInsert.cityId).toBe('city_nyc')
    expect(parsedInsert.contacts).toEqual({
      telegram: 'https://t.me/johndoe',
      email: 'john@wisal.dev',
    })

    const selectData = {
      id: 200000000000000n,
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      avatarKey: null,
      description: null,
      shortDescription: 'Coffee & Code',
      countryCode: 'US',
      cityId: 'city_nyc',
      contacts: null,
      identityId: null,
      regularFollowersCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const parsedSelect = selectProfileSchema.parse(selectData)
    expect(parsedSelect.shortDescription).toBe('Coffee & Code')
    expect(parsedSelect.countryCode).toBe('US')
    expect(parsedSelect.cityId).toBe('city_nyc')
    expect(parsedSelect.contacts).toBeNull()
    expect(parsedSelect.regularFollowersCount).toBe(0)
  })
})

