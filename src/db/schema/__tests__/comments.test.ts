import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  comments,
  insertCommentSchema,
  selectCommentSchema,
  COMMENT_TYPES,
} from '../comments'

describe('Comments Schema Tests', () => {
  it('validates a valid root comment insertion payload', () => {
    const validData = {
      postId: 900000000000001n,
      authorId: 100000000000001n,
      content: 'Great post!',
    }

    const parsed = insertCommentSchema.parse(validData)
    expect(parsed.postId).toBe(900000000000001n)
    expect(parsed.authorId).toBe(100000000000001n)
    expect(parsed.content).toBe('Great post!')
    expect(parsed.parentId).toBeUndefined()
    expect(parsed.type).toBe('text')
    expect(parsed.payload).toEqual({})
  })

  it('validates a valid reply comment insertion payload', () => {
    const validReply = {
      postId: 900000000000001n,
      authorId: 100000000000002n,
      parentId: 800000000000001n,
      content: 'I agree with this comment!',
      type: 'text',
      payload: { key: 'value' },
    }

    const parsed = insertCommentSchema.parse(validReply)
    expect(parsed.postId).toBe(900000000000001n)
    expect(parsed.authorId).toBe(100000000000002n)
    expect(parsed.parentId).toBe(800000000000001n)
    expect(parsed.content).toBe('I agree with this comment!')
    expect(parsed.type).toBe('text')
    expect(parsed.payload).toEqual({ key: 'value' })
  })

  it('rejects empty content in insertCommentSchema', () => {
    const invalidData = {
      postId: 900000000000001n,
      authorId: 100000000000001n,
      content: '   ',
    }

    expect(() => insertCommentSchema.parse(invalidData)).toThrow('Content cannot be empty')
  })

  it('validates selectCommentSchema with all fields including soft delete', () => {
    const now = new Date()
    const record = {
      id: 800000000000001n,
      postId: 900000000000001n,
      authorId: 100000000000001n,
      parentId: null,
      replyToCommentId: null,
      replyToUserId: null,
      type: 'text',
      payload: {},
      content: 'Sample comment',
      repliesCount: 3,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const parsed = selectCommentSchema.parse(record)
    expect(parsed.id).toBe(800000000000001n)
    expect(parsed.postId).toBe(900000000000001n)
    expect(parsed.authorId).toBe(100000000000001n)
    expect(parsed.parentId).toBeNull()
    expect(parsed.replyToCommentId).toBeNull()
    expect(parsed.replyToUserId).toBeNull()
    expect(parsed.content).toBe('Sample comment')
    expect(parsed.repliesCount).toBe(3)
    expect(parsed.deletedAt).toBeNull()
  })

  it('has correct indexes configured on comments table', () => {
    const config = getTableConfig(comments)
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('comments_post_id_idx')
    expect(indexNames).toContain('comments_author_id_idx')
    expect(indexNames).toContain('comments_parent_id_idx')
    expect(indexNames).toContain('comments_reply_to_comment_id_idx')
    expect(indexNames).toContain('comments_reply_to_user_id_idx')
    expect(indexNames).toContain('comments_replies_count_idx')
    expect(indexNames).toContain('comments_created_at_idx')
    expect(indexNames).toContain('comments_deleted_at_idx')
  })

  it('has expected enum constants defined', () => {
    expect(COMMENT_TYPES).toEqual(['text'])
  })
})
