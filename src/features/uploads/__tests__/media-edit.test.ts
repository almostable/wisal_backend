import { describe, expect, it } from 'bun:test'
import { getMediaFileKeys, validateMediaRemoval } from '../media-edit'

const first = { fileKey: 'media/2026-09-27/111111111111111.jpg', width: 800, height: 600 }
const second = { fileKey: 'media/2026-09-27/222222222222222.jpg', width: 400, height: 300 }
const third = { fileKey: 'media/2026-09-27/333333333333333.jpg', width: 200, height: 100 }

describe('media removal during editing', () => {
  it('allows removing one or all existing post images', () => {
    const current = { media: [first, second] }
    expect(validateMediaRemoval(current, { media: [second] }, 'post')).toEqual({
      payload: { media: [second] },
      oldFileKeys: [first.fileKey, second.fileKey],
      newFileKeys: [second.fileKey],
    })
    expect(validateMediaRemoval(current, { media: [] }, 'post').newFileKeys).toEqual([])
  })

  it('rejects new images, metadata changes and reordered images', () => {
    const current = { media: [first, second] }
    expect(() => validateMediaRemoval(current, { media: [first, third] }, 'post')).toThrow()
    expect(() => validateMediaRemoval(current, { media: [{ ...first, width: 1 }] }, 'post')).toThrow()
    expect(() => validateMediaRemoval(current, { media: [second, first] }, 'post')).toThrow()
    expect(() => validateMediaRemoval({}, { media: [first] }, 'post')).toThrow()
  })

  it('allows removing the only comment image', () => {
    expect(validateMediaRemoval({ media: [first] }, { media: [] }, 'comment').newFileKeys).toEqual([])
  })

  it('uses only referenced files when restoring media', () => {
    expect(getMediaFileKeys({ media: [second] })).toEqual([second.fileKey])
    expect(getMediaFileKeys({})).toEqual([])
  })
})
