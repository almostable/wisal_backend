import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import { FEED_CATEGORIES } from '../../../db/schema/posts'
import { feedQuerySchema, feedNextBatchSchema, createPostSchema } from '../schema'

describe('Feed Schemas and Validation Logic', () => {
  it('validates createPostSchema with feed category', () => {
    const valid = createPostSchema.parse({
      content: 'My thought',
      category: 'thought',
    })
    expect(valid.content).toBe('My thought')
    expect(valid.feedCategory).toBe('thought')
  })

  it('validates createPostSchema with null or omitted feed category', () => {
    const validNull = createPostSchema.parse({
      content: 'Profile only post',
      category: null,
    })
    expect(validNull.feedCategory).toBeNull()

    const validOmitted = createPostSchema.parse({
      content: 'Profile only post omitted',
    })
    expect(validOmitted.feedCategory).toBeUndefined()
  })


  it('validates feedQuerySchema with comma-separated categories', () => {
    const parsed = feedQuerySchema.parse({
      categories: 'thought,project',
      allServed: 'true',
    })
    expect(parsed.categories).toEqual(['thought', 'project'])
    expect(parsed.allServed).toBe(true)
  })

  it('validates feedQuerySchema with array of categories', () => {
    const parsed = feedQuerySchema.parse({
      categories: ['request'],
      allServed: false,
    })
    expect(parsed.categories).toEqual(['request'])
    expect(parsed.allServed).toBe(false)
  })

  it('validates feedQuerySchema with default values', () => {
    const parsed = feedQuerySchema.parse({})
    expect(parsed.categories).toBeUndefined()
    expect(parsed.allServed).toBe(true)
  })

  it('rejects invalid categories in feedQuerySchema', () => {
    expect(() =>
      feedQuerySchema.parse({
        categories: 'invalid_category',
      })
    ).toThrow()
  })

  it('validates feedNextBatchSchema with categories', () => {
    const parsed = feedNextBatchSchema.parse({
      categories: ['thought', 'request'],
    })
    expect(parsed.categories).toEqual(['thought', 'request'])
  })

  it('has expected FEED_CATEGORIES constants', () => {
    expect(FEED_CATEGORIES).toEqual(['thought', 'project', 'request'])
  })
})
