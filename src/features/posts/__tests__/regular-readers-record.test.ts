import { describe, it, expect, mock } from 'bun:test'
import { recordAuthorPostRead, getPostById } from '../service'

describe('Regular Readers - Record Post Read Tests', () => {
  it('recordAuthorPostRead executes conditional update on follows', async () => {
    let capturedWhere: any = null
    let capturedSet: any = null

    const mockExecutor: any = {
      update: (table: any) => ({
        set: (values: any) => {
          capturedSet = values
          return {
            where: (condition: any) => {
              capturedWhere = condition
              return Promise.resolve([])
            },
          }
        },
      }),
    }

    const readerId = 111111111111111n
    const authorId = 222222222222222n

    await recordAuthorPostRead(readerId, authorId, mockExecutor)

    expect(capturedSet).toBeDefined()
    expect(capturedSet.lastReadAt).toBeDefined()
    expect(capturedWhere).toBeDefined()
  })
})
