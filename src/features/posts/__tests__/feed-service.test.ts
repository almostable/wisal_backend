import { describe, it, expect } from 'bun:test'
import '../../../lib/snowflake'
import { feedQuerySchema, createPostSchema, updatePostSchema } from '../schema'

describe('Feed Schemas and Validation Logic', () => {
  it('validates createPostSchema with isFeed or showInFeed', () => {
    const valid1 = createPostSchema.parse({
      content: 'My post for feed that has more than one hundred characters in length to pass the validation rule properly! 1234567890',
      isFeed: true,
    })
    expect(valid1.content).toBe('My post for feed that has more than one hundred characters in length to pass the validation rule properly! 1234567890')
    expect(valid1.isFeed).toBe(true)

    const valid2 = createPostSchema.parse({
      content: 'My post with showInFeed alias that has more than one hundred characters in length to pass the validation rule! 1234567890',
      showInFeed: true,
    })
    expect(valid2.content).toBe('My post with showInFeed alias that has more than one hundred characters in length to pass the validation rule! 1234567890')
    expect(valid2.isFeed).toBe(true)

    // Rejects feed post with < 100 chars
    expect(() =>
      createPostSchema.parse({
        content: 'Short feed text',
        isFeed: true,
      })
    ).toThrow('Posts published to the public feed must contain at least 100 characters')
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

  it('limits post edits to content and removal of media', () => {
    expect(() => updatePostSchema.parse({
      showInFeed: true,
      content: 'Updated post for feed with more than one hundred characters in length to pass the validation properly! 1234567890',
    })).toThrow()
    expect(updatePostSchema.parse({ content: 'Updated content' }).content).toBe('Updated content')
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
