import { describe, it, expect } from 'bun:test'
import {
  profileLinkSchema,
  profileLinksSchema,
  httpsUrlSchema,
  insertProfileSchema,
  selectProfileSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
  descriptionSchema,
} from '../profiles'

describe('Profiles Schema Tests', () => {
  it('validates httpsUrlSchema: auto-prefixes https:// when protocol omitted and rejects non-https', () => {
    expect(httpsUrlSchema.parse('t.me/username')).toBe('https://t.me/username')
    expect(httpsUrlSchema.parse('example.com/path')).toBe('https://example.com/path')
    expect(httpsUrlSchema.parse('https://wisal.dev')).toBe('https://wisal.dev')
    expect(() => httpsUrlSchema.parse('http://insecure.com')).toThrow()
    expect(() => httpsUrlSchema.parse('ftp://files.com')).toThrow()
    expect(() => httpsUrlSchema.parse('invalid url with spaces')).toThrow()
  })

  it('validates profileLinkSchema with title (1-32 chars), url, and showToOppositeGender', () => {
    const valid = {
      title: 'My Portfolio',
      url: 'portfolio.dev',
      showToOppositeGender: true,
    }

    const parsed = profileLinkSchema.parse(valid)
    expect(parsed.title).toBe('My Portfolio')
    expect(parsed.url).toBe('https://portfolio.dev')
    expect(parsed.showToOppositeGender).toBe(true)

    // default showToOppositeGender is false
    const defaultGender = profileLinkSchema.parse({
      title: 'Telegram',
      url: 'https://t.me/johndoe',
    })
    expect(defaultGender.showToOppositeGender).toBe(false)

    // title validation
    expect(() => profileLinkSchema.parse({ title: '', url: 'https://a.com' })).toThrow()
    expect(() => profileLinkSchema.parse({ title: 'a'.repeat(33), url: 'https://a.com' })).toThrow()
    expect(profileLinkSchema.parse({ title: 'a'.repeat(32), url: 'https://a.com' }).title).toBe('a'.repeat(32))
  })

  it('validates profileLinksSchema allows up to 5 links and rejects more than 5', () => {
    const fiveLinks = Array.from({ length: 5 }, (_, i) => ({
      title: `Link ${i + 1}`,
      url: `https://site${i + 1}.com`,
      showToOppositeGender: i % 2 === 0,
    }))

    expect(profileLinksSchema.parse(fiveLinks)).toHaveLength(5)

    const sixLinks = [
      ...fiveLinks,
      { title: 'Link 6', url: 'https://site6.com', showToOppositeGender: false },
    ]
    expect(() => profileLinksSchema.parse(sixLinks)).toThrow()
  })

  it('validates descriptionSchema (1 to 200 chars, spaces allowed, no empty string)', () => {
    expect(descriptionSchema.parse('a')).toBe('a')
    expect(descriptionSchema.parse('Coffee & Code')).toBe('Coffee & Code')
    expect(descriptionSchema.parse('a'.repeat(200))).toBe('a'.repeat(200))
    expect(() => descriptionSchema.parse('')).toThrow()
    expect(() => descriptionSchema.parse('   ')).toThrow()
    expect(() => descriptionSchema.parse('a'.repeat(201))).toThrow()
  })

  it('validates onboardingInputSchema with links', () => {
    const input = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      description: 'Coffee & Code',
      links: [
        {
          title: 'Telegram',
          url: 't.me/johndoe',
          showToOppositeGender: true,
        },
      ],
    }

    const parsed = onboardingInputSchema.parse(input)
    expect(parsed.description).toBe('Coffee & Code')
    expect(parsed.links).toHaveLength(1)
    expect(parsed.links![0].url).toBe('https://t.me/johndoe')
  })

  it('validates onboardingInputSchema with null or omitted optional fields', () => {
    const inputWithNull = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
      description: null,
      links: null,
    }
    const parsedWithNull = onboardingInputSchema.parse(inputWithNull)
    expect(parsedWithNull.description).toBeNull()
    expect(parsedWithNull.links).toBeNull()

    const inputWithoutFields = {
      name: 'John Doe',
      isMale: true,
      identity: 'johndoe',
    }
    const parsedWithout = onboardingInputSchema.parse(inputWithoutFields)
    expect(parsedWithout.description).toBeUndefined()
    expect(parsedWithout.links).toBeUndefined()
  })

  it('validates updateProfileInputSchema with links, identity, and new profile fields', () => {
    const updateInput = {
      identity: 'New_Handle',
      description: 'Solo Dev',
      links: [
        {
          title: 'Website',
          url: 'wisal.dev',
          showToOppositeGender: false,
        },
      ],
    }

    const parsed = updateProfileInputSchema.parse(updateInput)
    expect(parsed.identity).toBe('new_handle')
    expect(parsed.description).toBe('Solo Dev')
    expect(parsed.links![0].url).toBe('https://wisal.dev')
  })

  it('validates insertProfileSchema and selectProfileSchema with links and new fields', () => {
    const insertData = {
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      description: 'Coffee & Code',
      links: [
        {
          title: 'Telegram',
          url: 'https://t.me/johndoe',
          showToOppositeGender: true,
        },
      ],
    }

    const parsedInsert = insertProfileSchema.parse(insertData)
    expect(parsedInsert.description).toBe('Coffee & Code')
    expect(parsedInsert.links).toEqual([
      {
        title: 'Telegram',
        url: 'https://t.me/johndoe',
        showToOppositeGender: true,
      },
    ])

    const selectData = {
      id: 200000000000000n,
      accountId: 100000000000000n,
      name: 'John Doe',
      isMale: true,
      avatarKey: null,
      description: 'Coffee & Code',
      links: null,
      identity: null,
      identityId: null,
      readersCount: 0,
      verifiedAt: null,
      notificationsReadAt: null,
      searchText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const parsedSelect = selectProfileSchema.parse(selectData)
    expect(parsedSelect.description).toBe('Coffee & Code')
    expect(parsedSelect.links).toBeNull()
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

