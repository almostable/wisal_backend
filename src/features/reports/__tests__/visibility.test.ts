import { describe, expect, it } from 'bun:test'
import { createReport } from '../service'
import type { DbExecutor } from '../../../db'

const reporterId = 111111111111111n
const authorId = 222222222222222n
function executorForHiddenPost() {
  const post = {
    id: 333333333333333n,
    authorId,
    authorGender: false,
    genderScope: 'same_gender',
    deletedAt: null,
  }
  let inserted = false
  const executor = {
    query: {
      posts: { findFirst: async () => post },
      comments: { findFirst: async () => ({ id: 444444444444444n, postId: post.id, authorId }) },
      reports: { findFirst: async () => null },
    },
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ limit: async () => [{ deletedAt: null, bannedAt: null }] }) }),
        where: () => ({ limit: async () => 'blockerProfileId' in fields ? [] : [{ deletedAt: null, bannedAt: null }] }),
      }),
    }),
    insert: () => {
      inserted = true
      throw new Error('Hidden target should not be reported')
    },
  }
  return { executor: executor as unknown as DbExecutor, wasInserted: () => inserted }
}

describe('report visibility', () => {
  it('rejects a post hidden by gender scope', async () => {
    const { executor, wasInserted } = executorForHiddenPost()
    await expect(createReport(reporterId, {
      targetType: 'post', targetId: 333333333333333n, reason: 'spam',
    }, true, executor)).rejects.toMatchObject({ status: 404 })
    expect(wasInserted()).toBe(false)
  })

  it('rejects a comment on a hidden post', async () => {
    const { executor, wasInserted } = executorForHiddenPost()
    await expect(createReport(reporterId, {
      targetType: 'comment', targetId: 444444444444444n, reason: 'spam',
    }, true, executor)).rejects.toMatchObject({ status: 404 })
    expect(wasInserted()).toBe(false)
  })
})
