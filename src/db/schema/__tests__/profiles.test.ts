import { describe, it, expect } from 'bun:test'
import {
  contactsSchema,
  insertProfileSchema,
  selectProfileSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
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
      email: null,
    }

    const parsed = contactsSchema.parse(partialContacts)
    expect(parsed.telegram).toBe('john_doe')
    expect(parsed.youtube).toBeNull()
    expect(parsed.website).toBeUndefined()
    expect(parsed.email).toBeNull()
  })

  it('rejects invalid URLs in youtube and website', () => {
    expect(() => contactsSchema.parse({ youtube: 'not-a-url' })).toThrow()
    expect(() => contactsSchema.parse({ website: 'ftp://not-http' })).not.toThrow()
    expect(() => contactsSchema.parse({ website: 'invalid' })).toThrow()
  })

  it('validates telegramUsernameSchema (4 to 32 chars, no @, spaces, or links)', () => {
    expect(telegramUsernameSchema.parse('durov')).toBe('durov')
    expect(telegramUsernameSchema.parse('user_1234')).toBe('user_1234')
    expect(telegramUsernameSchema.parse('a'.repeat(32))).toBe('a'.repeat(32))
    expect(() => telegramUsernameSchema.parse('abc')).toThrow()
    expect(() => telegramUsernameSchema.parse('a'.repeat(33))).toThrow()
    expect(() => telegramUsernameSchema.parse('@durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('https://t.me/durov')).toThrow()
    expect(() => telegramUsernameSchema.parse('user name')).toThrow()
  })

  it('rejects invalid email format in contacts', () => {
    expect(() => contactsSchema.parse({ email: 'not-an-email' })).toThrow()
  })

  it('validates descriptionSchema (1 to 200 chars, spaces allowed, no empty string)', () => {
    expect(descriptionSchema.parse('a')).toBe('a')
    expect(descriptionSchema.parse('Coffee & Code')).toBe('Coffee & Code')
    expect(descriptionSchema.parse('a'.repeat(200))).toBe('a'.repeat(200))
    expect(() => descriptionSchema.parse('')).toThrow()
    expect(() => descriptionSchema.parse('   ')).toThrow()
    expect(() => descriptionSchema.parse('a'.repeat(201))).toThrow()
  })

  it('validates onboardingInputSchema with new optional fields', () => {
    const input = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      description: 'Coffee & Code',
      contacts: {
        telegram: 'johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsed = onboardingInputSchema.parse(input)
    expect(parsed.description).toBe('Coffee & Code')
    expect(parsed.contacts?.telegram).toBe('johndoe')
    expect(parsed.contacts?.email).toBe('john@wisal.dev')
  })

  it('validates onboardingInputSchema with null or omitted optional fields', () => {
    const inputWithNull = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      description: null,
      contacts: null,
    }
    const parsedWithNull = onboardingInputSchema.parse(inputWithNull)
    expect(parsedWithNull.description).toBeNull()
    expect(parsedWithNull.contacts).toBeNull()

    const inputWithoutFields = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
    }
    const parsedWithout = onboardingInputSchema.parse(inputWithoutFields)
    expect(parsedWithout.description).toBeUndefined()
    expect(parsedWithout.contacts).toBeUndefined()
  })

  it('validates updateProfileInputSchema with contacts, identity, and new profile fields', () => {
    const updateInput = {
      identity: 'New_Handle',
      description: 'Solo Dev',
      contacts: {
        website: 'https://wisal.dev',
      },
    }

    const parsed = updateProfileInputSchema.parse(updateInput)
    expect(parsed.identity).toBe('new_handle')
    expect(parsed.description).toBe('Solo Dev')
    expect(parsed.contacts?.website).toBe('https://wisal.dev')
  })

  it('validates insertProfileSchema and selectProfileSchema with contacts and new fields', () => {
    const insertData = {
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      description: 'Coffee & Code',
      contacts: {
        telegram: 'johndoe',
        email: 'john@wisal.dev',
      },
    }

    const parsedInsert = insertProfileSchema.parse(insertData)
    expect(parsedInsert.description).toBe('Coffee & Code')
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
      description: 'Coffee & Code',
      contacts: null,
      identity: null,
      identityId: null,
      regularReadersCount: 0,
      readersCount: 0,
      verifiedAt: null,
      notificationsReadAt: null,
      searchText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const parsedSelect = selectProfileSchema.parse(selectData)
    expect(parsedSelect.description).toBe('Coffee & Code')
    expect(parsedSelect.contacts).toBeNull()
    expect(parsedSelect.regularReadersCount).toBe(0)
    expect(parsedSelect.readersCount).toBe(0)
    expect(parsedSelect.verifiedAt).toBeNull()
    expect(parsedSelect.notificationsReadAt).toBeNull()
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

