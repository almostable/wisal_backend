import { describe, it, expect } from 'bun:test'
import {
  contactsSchema,
  insertProfileSchema,
  selectProfileSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
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

  it('validates onboardingInputSchema with contacts', () => {
    const input = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      contacts: {
        telegram: 'https://t.me/johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsed = onboardingInputSchema.parse(input)
    expect(parsed.contacts?.telegram).toBe('https://t.me/johndoe')
    expect(parsed.contacts?.email).toBe('john@wisal.dev')
  })

  it('validates onboardingInputSchema with null or omitted contacts', () => {
    const inputWithNull = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      contacts: null,
    }
    expect(onboardingInputSchema.parse(inputWithNull).contacts).toBeNull()

    const inputWithoutContacts = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
    }
    expect(onboardingInputSchema.parse(inputWithoutContacts).contacts).toBeUndefined()
  })

  it('validates updateProfileInputSchema with contacts and identity', () => {
    const updateInput = {
      identity: 'New_Handle',
      contacts: {
        website: 'https://wisal.dev',
      },
    }

    const parsed = updateProfileInputSchema.parse(updateInput)
    expect(parsed.identity).toBe('new_handle')
    expect(parsed.contacts?.website).toBe('https://wisal.dev')
  })

  it('validates insertProfileSchema and selectProfileSchema with contacts', () => {
    const insertData = {
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      contacts: {
        telegram: 'https://t.me/johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsedInsert = insertProfileSchema.parse(insertData)
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
      contacts: null,
      identityId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const parsedSelect = selectProfileSchema.parse(selectData)
    expect(parsedSelect.contacts).toBeNull()
  })
})
