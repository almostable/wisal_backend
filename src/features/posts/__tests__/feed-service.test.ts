import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import { feedQuerySchema, createPostSchema, updatePostSchema } from '../schema'

describe('Feed Schemas and Validation Logic', () => {
  it('validates createPostSchema with isFeed or showInFeed', () => {
    const valid1 = createPostSchema.parse({
      content: 'My post for feed',
      isFeed: true,
    })
    expect(valid1.content).toBe('My post for feed')
    expect(valid1.isFeed).toBe(true)

    const valid2 = createPostSchema.parse({
      content: 'My post with showInFeed alias',
      showInFeed: true,
    })
    expect(valid2.content).toBe('My post with showInFeed alias')
    expect(valid2.isFeed).toBe(true)
  })

  it('validates createPostSchema with false or omitted isFeed', () => {
    const validFalse = createPostSchema.parse({
      content: 'Profile only post',
      isFeed: false,
    })
    expect(validFalse.isFeed).toBe(false)

    const validOmitted = createPostSchema.parse({
      content: 'Profile only post omitted',
    })
    expect(validOmitted.isFeed).toBeUndefined()
  })

  it('validates updatePostSchema with isFeed', () => {
    const valid = updatePostSchema.parse({
      showInFeed: true,
    })
    expect(valid.isFeed).toBe(true)
  })

  it('validates feedQuerySchema with default values', () => {
    const parsed = feedQuerySchema.parse({})
    expect(parsed.limit).toBe(20)
    expect(parsed.offset).toBe(0)
    expect(parsed.cursor).toBeUndefined()
  })

  it('validates feedQuerySchema with custom limit, offset and cursor', () => {
    const parsed = feedQuerySchema.parse({
      limit: '15',
      offset: '40',
      cursor: '123456789012345678',
    })
    expect(parsed.limit).toBe(15)
    expect(parsed.offset).toBe(40)
    expect(parsed.cursor).toBe('123456789012345678')
  })

  it('rejects invalid cursor format in feedQuerySchema', () => {
    expect(() =>
      feedQuerySchema.parse({
        cursor: 'invalid-cursor-abc',
      })
    ).toThrow()
  })
})
