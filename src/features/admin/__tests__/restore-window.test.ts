import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { DbExecutor } from '../../../db'
import { posts } from '../../../db/schema/posts'
import { comments } from '../../../db/schema/comments'
import { mediaUploads } from '../../../db/schema/media-uploads'

async function loadRestoreServices() {
  // Route tests mock the service barrel globally, so load the implementations under separate module URLs.
  const postsPath = '../services/admin-posts.service.ts?restore-window'
  const commentsPath = '../services/admin-comments.service.ts?restore-window'
  const postsModule = await import(postsPath) as typeof import('../services/admin-posts.service')
  const commentsModule = await import(commentsPath) as typeof import('../services/admin-comments.service')
  return {
    restorePostByAdmin: postsModule.restorePostByAdmin,
    restoreCommentByAdmin: commentsModule.restoreCommentByAdmin,
  }
}

const postId = 111111111111111n
const commentId = 222222222222222n
const postMedia = { fileKey: 'media/2026-09-27/111111111111111.jpg', width: 800, height: 600 }
const commentMedia = { fileKey: 'media/2026-09-27/222222222222222.jpg', width: 400, height: 300 }
describe('moderation restoration window', () => {
  beforeEach(() => mock.restore())
  it('refuses to restore a post or comment after media retention expires', async () => {
    const { restorePostByAdmin, restoreCommentByAdmin } = await loadRestoreServices()
    const deletedAt = new Date(Date.now() - 15 * 86_400_000)
    const executor = {
      query: {
        posts: { findFirst: async () => ({ id: postId, deletedAt }) },
        comments: { findFirst: async () => ({ id: commentId, deletedAt }) },
      },
    } as unknown as DbExecutor
    await expect(restorePostByAdmin(postId, executor)).rejects.toMatchObject({ status: 409 })
    await expect(restoreCommentByAdmin(commentId, executor)).rejects.toMatchObject({ status: 409 })
  })

  it('restores comments deleted with the post and their media', async () => {
    const { restorePostByAdmin } = await loadRestoreServices()
    const deletedAt = new Date(Date.now() - 86_400_000)
    const updates: { table: unknown; data: Record<string, unknown> }[] = []
    const executor = {
      query: { posts: { findFirst: async () => ({
        id: postId, authorId: 333333333333333n, deletedAt, payload: { media: [postMedia] },
      }) } },
      select: () => ({ from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: async () => [{ id: commentId, parentId: null }] }),
          where: () => ({ limit: async () => [{ deletedAt: null, bannedAt: null }] }),
        }),
      }) }),
      update: (table: unknown) => ({
        set: (data: Record<string, unknown>) => ({
          where: () => {
            updates.push({ table, data })
            return { returning: async () => [{ id: commentId, payload: { media: [commentMedia] } }] }
          },
        }),
      }),
      execute: async () => [],
    } as unknown as DbExecutor

    const result = await restorePostByAdmin(postId, executor)
    expect(result.success).toBe(true)
    expect(updates.some((item) => item.table === comments && item.data.deletedAt === null)).toBe(true)
    expect(updates.filter((item) => item.table === mediaUploads && item.data.status === 'attached')).toHaveLength(2)
    expect(updates.some((item) => item.table === posts && item.data.deletedAt === null)).toBe(true)
  })

  it('restores a root comment together with replies deleted in the same operation', async () => {
    const { restoreCommentByAdmin } = await loadRestoreServices()
    const deletedAt = new Date(Date.now() - 86_400_000)
    const replyId = 444444444444444n
    const updates: { table: unknown; data: Record<string, unknown> }[] = []
    const executor = {
      query: {
        comments: { findFirst: async () => ({
          id: commentId, postId, authorId: 333333333333333n, parentId: null, deletedAt,
          payload: { media: [commentMedia] },
        }) },
        posts: { findFirst: async () => ({ id: postId, deletedAt: null }) },
      },
      select: (fields: Record<string, unknown>) => ({ from: (table: unknown) => table === comments
        ? 'count' in fields
          ? { where: async () => [{ count: 1 }] }
          : { innerJoin: () => ({ innerJoin: () => ({ where: async () => [{ id: replyId, payload: {} }] }) }) }
        : { innerJoin: () => ({ where: () => ({ limit: async () => [{ deletedAt: null, bannedAt: null }] }) }) },
      }),
      update: (table: unknown) => ({ set: (data: Record<string, unknown>) => ({
        where: async () => { updates.push({ table, data }) },
      }) }),
    } as unknown as DbExecutor

    const result = await restoreCommentByAdmin(commentId, executor)
    expect(result.success).toBe(true)
    expect(updates.some((item) => item.table === comments && item.data.deletedAt === null)).toBe(true)
    expect(updates.some((item) => item.table === mediaUploads && item.data.status === 'attached')).toBe(true)
    expect(updates.some((item) => item.table === comments && item.data.repliesCount === 1)).toBe(true)
  })
})
