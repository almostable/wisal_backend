import { describe, it, expect } from 'bun:test'
import {
  contactsSchema,
  insertProfileSchema,
  selectProfileSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
  shortDescriptionSchema,
  telegramUsernameSchema,
} from '../profiles'

describe('Profiles Schema Tests', () => {
  it('validates valid contacts object with all fields', () => {
    const contacts = {
      telegram: 'john_doe',
      youtube: 'https://youtube.com/@channel',
      website: 'https://example.com',
      email: 'user@example.com',
    }

    const parsed = contactsSchema.parse(contacts)
    expect(parsed.telegram).toBe('john_doe')
    expect(parsed.youtube).toBe('https://youtube.com/@channel')
    expect(parsed.website).toBe('https://example.com')
    expect(parsed.email).toBe('user@example.com')
  })

  it('allows partial and null fields in contacts', () => {
    const partialContacts = {
      telegram: 'john_doe',
      youtube: null,
      website: undefined,
    }

    const parsed = contactsSchema.parse(partialContacts)
    expect(parsed.telegram).toBe('john_doe')
    expect(parsed.youtube).toBeNull()
    expect(parsed.website).toBeUndefined()
    expect(parsed.email).toBeUndefined()
  })

  it('rejects invalid URLs in youtube and website', () => {
    expect(() => contactsSchema.parse({ youtube: 'not a link' })).toThrow()
    expect(() => contactsSchema.parse({ website: 'just_text' })).toThrow()
  })

  it('validates telegramUsernameSchema (4 to 32 chars, no @, spaces, or links)', () => {
    // Valid
    expect(telegramUsernameSchema.parse('user')).toBe('user')
    expect(telegramUsernameSchema.parse('durov')).toBe('durov')
    expect(telegramUsernameSchema.parse('john_doe')).toBe('john_doe')
    expect(telegramUsernameSchema.parse('AliceBob')).toBe('AliceBob')
    expect(telegramUsernameSchema.parse('user_123')).toBe('user_123')
    expect(telegramUsernameSchema.parse('a'.repeat(32))).toBe('a'.repeat(32))

    // Rejects @
    expect(() => telegramUsernameSchema.parse('@durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('user@name')).toThrow()

    // Rejects links
    expect(() => telegramUsernameSchema.parse('https://t.me/durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('t.me/durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('durov.me')).toThrow()

    // Rejects spaces
    expect(() => telegramUsernameSchema.parse('user name')).toThrow()
    expect(() => telegramUsernameSchema.parse(' durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('durov ')).toThrow()

    // Rejects special characters
    expect(() => telegramUsernameSchema.parse('user-name')).toThrow()
    expect(() => telegramUsernameSchema.parse('user!name')).toThrow()

    // Rejects length < 4 or > 32
    expect(() => telegramUsernameSchema.parse('abc')).toThrow()
    expect(() => telegramUsernameSchema.parse('')).toThrow()
    expect(() => telegramUsernameSchema.parse('a'.repeat(33))).toThrow()
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

  it('validates onboardingInputSchema with new optional fields', () => {
    const input = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      shortDescription: 'Coffee & Code',
      contacts: {
        telegram: 'johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsed = onboardingInputSchema.parse(input)
    expect(parsed.shortDescription).toBe('Coffee & Code')
    expect(parsed.contacts?.telegram).toBe('johndoe')
    expect(parsed.contacts?.email).toBe('john@wisal.dev')
  })

  it('validates onboardingInputSchema with null or omitted optional fields', () => {
    const inputWithNull = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      shortDescription: null,
      contacts: null,
    }
    const parsedWithNull = onboardingInputSchema.parse(inputWithNull)
    expect(parsedWithNull.shortDescription).toBeNull()
    expect(parsedWithNull.contacts).toBeNull()

    const inputWithoutFields = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
    }
    const parsedWithout = onboardingInputSchema.parse(inputWithoutFields)
    expect(parsedWithout.shortDescription).toBeUndefined()
    expect(parsedWithout.contacts).toBeUndefined()
  })

  it('validates updateProfileInputSchema with contacts, identity, and new profile fields', () => {
    const updateInput = {
      identity: 'New_Handle',
      shortDescription: 'Solo Dev',
      contacts: {
        website: 'https://wisal.dev',
      },
    }

    const parsed = updateProfileInputSchema.parse(updateInput)
    expect(parsed.identity).toBe('new_handle')
    expect(parsed.shortDescription).toBe('Solo Dev')
    expect(parsed.contacts?.website).toBe('https://wisal.dev')
  })

  it('validates insertProfileSchema and selectProfileSchema with contacts and new fields', () => {
    const insertData = {
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      shortDescription: 'Coffee & Code',
      contacts: {
        telegram: 'johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsedInsert = insertProfileSchema.parse(insertData)
    expect(parsedInsert.shortDescription).toBe('Coffee & Code')
    expect(parsedInsert.contacts).toEqual({
      telegram: 'johndoe',
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
      contacts: null,
      identity: null,
      identityId: null,
      regularReadersCount: 0,
      readersCount: 0,
      verifiedAt: null,
      searchText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const parsedSelect = selectProfileSchema.parse(selectData)
    expect(parsedSelect.shortDescription).toBe('Coffee & Code')
    expect(parsedSelect.contacts).toBeNull()
    expect(parsedSelect.regularReadersCount).toBe(0)
    expect(parsedSelect.readersCount).toBe(0)
    expect(parsedSelect.verifiedAt).toBeNull()
    expect(parsedSelect.identity).toBeNull()
    expect(parsedSelect.searchText).toBeNull()
  })

  it('has trigram GIN index on searchText for fast profile search', () => {
    const { getTableConfig } = require('drizzle-orm/pg-core')
    const { profiles } = require('../profiles')
    const config = getTableConfig(profiles)
    const searchIndex = config.indexes.find(
      (idx: any) => idx.config?.name === 'profiles_search_text_trgm_idx'
    )
    expect(searchIndex).toBeDefined()
    expect(searchIndex.config.method).toBe('gin')
  })
})

