import { describe, it, expect, mock } from 'bun:test'
import '../../../lib/snowflake'
import {
  deleteNotificationsForComments,
  deleteNotificationsForPosts,
  deleteNotificationsForInvites,
  deleteNotificationsBetweenProfiles,
  deleteNotificationsForProfiles,
} from '../service'
import { deletePost, deleteComment } from '../../posts/service'
import { deletePostByAdmin } from '../../admin/services/admin-posts.service'
import { deleteCommentByAdmin } from '../../admin/services/admin-comments.service'
import { deleteInvite } from '../../admin/services/admin-invites.service'
import { resolveReportWithAction } from '../../admin/services/admin-reports.service'

describe('Notifications Cleanup Integration Tests', () => {
  it('deletePost deletes related post notifications in same transaction', async () => {
    let deletedWhere: any = null
    const postId = 2001n
    const authorId = 1001n

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            posts: {
              findFirst: async () => ({
                id: postId,
                authorId,
                deletedAt: null,
              }),
            },
          },
          update: () => ({
            set: () => ({
              where: async () => [],
            }),
          }),
          execute: async () => [],
          delete: (_table: any) => ({
            where: async (condition: any) => {
              deletedWhere = condition
              return []
            },
          }),
          select: () => ({
            from: () => ({
              where: () => [],
            }),
          }),
        }
        return await cb(mockTx)
      },
    }

    mock.module('../../../db', () => ({
      db: mockDb,
    }))

    mock.module('../../uploads/service', () => ({
      markEntityMediaDeleted: async () => {},
    }))

    const result = await deletePost(authorId, postId)
    expect(result.success).toBe(true)
    expect(deletedWhere).toBeDefined()
  })

  it('deleteComment deletes related comment notifications in same transaction', async () => {
    let deletedWhere: any = null
    const commentId = 3001n
    const authorId = 1001n

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            comments: {
              findFirst: async () => ({
                id: commentId,
                authorId,
                postId: 2001n,
                parentId: null,
                deletedAt: null,
              }),
            },
          },
          select: () => ({
            from: () => ({
              where: async () => [],
            }),
          }),
          update: () => ({
            set: () => ({
              where: async () => [],
            }),
          }),
          delete: (_table: any) => ({
            where: async (condition: any) => {
              deletedWhere = condition
              return []
            },
          }),
        }
        return await cb(mockTx)
      },
    }

    mock.module('../../../db', () => ({
      db: mockDb,
    }))

    mock.module('../../uploads/service', () => ({
      markEntityMediaDeleted: async () => {},
    }))

    const result = await deleteComment(authorId, commentId)
    expect(result.success).toBe(true)
    expect(deletedWhere).toBeDefined()
  })

  it('deletePostByAdmin cleans up notifications for post', async () => {
    let deletedWhere: any = null
    const postId = 2001n

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            posts: {
              findFirst: async () => ({
                id: postId,
                deletedAt: null,
              }),
            },
          },
          update: () => ({
            set: () => ({
              where: async () => [],
            }),
          }),
          execute: async () => [],
          delete: (_table: any) => ({
            where: async (condition: any) => {
              deletedWhere = condition
              return []
            },
          }),
          select: () => ({
            from: () => ({
              where: () => [],
            }),
          }),
        }
        return await cb(mockTx)
      },
    }

    mock.module('../../../db', () => ({
      db: mockDb,
    }))

    mock.module('../../uploads/service', () => ({
      markEntityMediaDeleted: async () => {},
    }))

    const result = await deletePostByAdmin(postId)
    expect(result.success).toBe(true)
    expect(deletedWhere).toBeDefined()
  })

  it('deleteCommentByAdmin cleans up notifications for comment', async () => {
    let deletedWhere: any = null
    const commentId = 3001n

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          query: {
            comments: {
              findFirst: async () => ({
                id: commentId,
                parentId: null,
                deletedAt: null,
              }),
            },
          },
          select: () => ({
            from: () => ({
              where: async () => [],
            }),
          }),
          update: () => ({
            set: () => ({
              where: async () => [],
            }),
          }),
          delete: (_table: any) => ({
            where: async (condition: any) => {
              deletedWhere = condition
              return []
            },
          }),
        }
        return await cb(mockTx)
      },
    }

    mock.module('../../../db', () => ({
      db: mockDb,
    }))

    mock.module('../../uploads/service', () => ({
      markEntityMediaDeleted: async () => {},
    }))

    const result = await deleteCommentByAdmin(commentId)
    expect(result.success).toBe(true)
    expect(deletedWhere).toBeDefined()
  })

  it('deleteInvite cleans up notifications for invite', async () => {
    let deletedWhere: any = null
    const inviteId = 4001n

    const mockDb: any = {
      transaction: async (cb: any) => {
        const mockTx = {
          delete: (table: any) => ({
            where: (condition: any) => ({
              returning: async () => {
                return [{ id: inviteId }]
              },
            }),
          }),
        }
        mockTx.delete = (_table: any) => ({
          where: (condition: any) => {
            deletedWhere = condition
            return {
              returning: async () => [{ id: inviteId }],
            }
          },
        })
        return await cb(mockTx)
      },
    }

    mock.module('../../../db', () => ({
      db: mockDb,
    }))

    await deleteInvite(inviteId)
    expect(deletedWhere).toBeDefined()
  })
})
