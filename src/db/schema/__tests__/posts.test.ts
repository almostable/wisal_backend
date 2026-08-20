import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  posts,
  insertPostSchema,
  selectPostSchema,
  POST_TYPES,
  GENDER_SCOPES,
  ACCESS_LEVELS,
} from '../posts'

describe('Posts Schema Tests', () => {
  it('validates a valid post insertion payload', () => {
    const validData = {
      authorId: 100000000000001n,
      authorGender: true,
      content: 'Hello Wisal community!',
      genderScope: 'same_gender',
      accessLevel: 'followers',
      isPinned: true,
    }

    const parsed = insertPostSchema.parse(validData)
    expect(parsed.authorId).toBe(100000000000001n)
    expect(parsed.authorGender).toBe(true)
    expect(parsed.content).toBe('Hello Wisal community!')
    expect(parsed.genderScope).toBe('same_gender')
    expect(parsed.accessLevel).toBe('followers')
    expect(parsed.isPinned).toBe(true)
    expect(parsed.likesCount).toBeUndefined()
    expect(parsed.type).toBe('text')
    expect(parsed.payload).toEqual({})
  })

  it('rejects empty content in insertPostSchema', () => {
    const invalidData = {
      authorId: 100000000000001n,
      authorGender: false,
      content: '   ',
    }

    expect(() => insertPostSchema.parse(invalidData)).toThrow('Content cannot be empty')
  })

  it('rejects invalid genderScope or accessLevel', () => {
    expect(() =>
      insertPostSchema.parse({
        authorId: 100000000000001n,
        authorGender: true,
        content: 'Valid content',
        genderScope: 'invalid_scope',
      })
    ).toThrow()

    expect(() =>
      insertPostSchema.parse({
        authorId: 100000000000001n,
        authorGender: true,
        content: 'Valid content',
        accessLevel: 'invalid_access',
      })
    ).toThrow()
  })

  it('validates selectPostSchema with all fields including soft delete', () => {
    const now = new Date()
    const record = {
      id: 900000000000001n,
      authorId: 100000000000001n,
      authorGender: true,
      type: 'text',
      payload: {},
      content: 'Sample post',
      genderScope: 'all',
      accessLevel: 'public',
      isPinned: false,
      likesCount: 5,
      commentsCount: 2,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const parsed = selectPostSchema.parse(record)
    expect(parsed.id).toBe(900000000000001n)
    expect(parsed.authorGender).toBe(true)
    expect(parsed.likesCount).toBe(5)
    expect(parsed.commentsCount).toBe(2)
    expect(parsed.deletedAt).toBeNull()
  })

  it('has correct indexes configured on posts table', () => {
    const config = getTableConfig(posts)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('posts_author_id_idx')
    expect(indexNames).toContain('posts_created_at_idx')
    expect(indexNames).toContain('posts_deleted_at_idx')
    expect(indexNames).toContain('posts_gender_scope_idx')
    expect(indexNames).toContain('posts_access_level_idx')
    expect(indexNames).toContain('posts_is_pinned_idx')
    expect(indexNames).toContain('posts_likes_count_idx')
    expect(indexNames).toContain('posts_comments_count_idx')
  })

  it('has expected enum constants defined', () => {
    expect(POST_TYPES).toEqual(['text'])
    expect(GENDER_SCOPES).toEqual(['all', 'same_gender'])
    expect(ACCESS_LEVELS).toEqual(['public', 'followers'])
  })
})
