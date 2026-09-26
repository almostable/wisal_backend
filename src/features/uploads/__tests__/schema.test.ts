import { describe, it, expect } from 'bun:test'
import { postMediaPayloadSchema, commentMediaPayloadSchema } from '../schema'

describe('Uploads Schema Tests', () => {
  const validItem = {
    fileKey: 'media/2026-09-04/111111111111111.jpg',
    width: 1920,
    height: 1080,
  }

  describe('postMediaPayloadSchema', () => {
    it('accepts 1 to 5 media items', () => {
      const singleItem = { media: [validItem] }
      expect(postMediaPayloadSchema.parse(singleItem)).toEqual(singleItem)

      const fiveItems = {
        media: Array.from({ length: 5 }, (_, i) => ({
          fileKey: `media/2026-09-04/11111111111111${i}.jpg`,
          width: 800,
          height: 600,
        })),
      }
      expect(postMediaPayloadSchema.parse(fiveItems).media).toHaveLength(5)
    })

    it('rejects 0 media items', () => {
      expect(() => postMediaPayloadSchema.parse({ media: [] })).toThrow('At least 1 media item is required')
    })

    it('rejects more than 5 media items', () => {
      const sixItems = {
        media: Array.from({ length: 6 }, (_, i) => ({
          fileKey: `media/2026-09-04/11111111111111${i}.jpg`,
          width: 800,
          height: 600,
        })),
      }
      expect(() => postMediaPayloadSchema.parse(sixItems)).toThrow('At most 5 media items are allowed')
    })
  })

  describe('commentMediaPayloadSchema', () => {
    it('accepts exactly 1 media item', () => {
      const singleItem = { media: [validItem] }
      expect(commentMediaPayloadSchema.parse(singleItem)).toEqual(singleItem)
    })

    it('rejects 0 media items', () => {
      expect(() => commentMediaPayloadSchema.parse({ media: [] })).toThrow('At least 1 media item is required')
    })

    it('rejects more than 1 media item', () => {
      const twoItems = {
        media: [
          validItem,
          {
            fileKey: 'media/2026-09-04/222222222222222.png',
            width: 500,
            height: 500,
          },
        ],
      }
      expect(() => commentMediaPayloadSchema.parse(twoItems)).toThrow('At most 1 media item is allowed')
    })
  })
})
