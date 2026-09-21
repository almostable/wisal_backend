import { describe, it, expect } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  mediaUploads,
  insertMediaUploadSchema,
  selectMediaUploadSchema,
  MEDIA_UPLOAD_STATUSES,
  MEDIA_ENTITY_TYPES,
} from '../media-uploads'

describe('Media Uploads Schema Tests', () => {
  it('validates a valid media upload insertion payload with minimal fields', () => {
    const validData = {
      fileKey: 'media/2026-09-04/111111111111111.jpg',
      profileId: 100000000000001n,
    }

    const parsed = insertMediaUploadSchema.parse(validData)
    expect(parsed.fileKey).toBe('media/2026-09-04/111111111111111.jpg')
    expect(parsed.profileId).toBe(100000000000001n)
    expect(parsed.status).toBe('pending')
    expect(parsed.entityType).toBeUndefined()
    expect(parsed.entityId).toBeUndefined()
  })

  it('validates a full media upload insertion payload with all fields', () => {
    const validData = {
      fileKey: 'media/2026-09-04/222222222222222.png',
      profileId: 100000000000001n,
      status: 'attached' as const,
      entityType: 'post' as const,
      entityId: 300000000000003n,
    }

    const parsed = insertMediaUploadSchema.parse(validData)
    expect(parsed.fileKey).toBe('media/2026-09-04/222222222222222.png')
    expect(parsed.profileId).toBe(100000000000001n)
    expect(parsed.status).toBe('attached')
    expect(parsed.entityType).toBe('post')
    expect(parsed.entityId).toBe(300000000000003n)
  })

  it('validates selectMediaUploadSchema with all fields including nullable ones', () => {
    const selectData = {
      fileKey: 'media/2026-09-04/333333333333333.webp',
      profileId: 100000000000001n,
      status: 'purged',
      entityType: null,
      entityId: null,
      createdAt: new Date(),
      purgedAt: new Date(),
    }

    const parsed = selectMediaUploadSchema.parse(selectData)
    expect(parsed.fileKey).toBe('media/2026-09-04/333333333333333.webp')
    expect(parsed.profileId).toBe(100000000000001n)
    expect(parsed.status).toBe('purged')
    expect(parsed.entityType).toBeNull()
    expect(parsed.entityId).toBeNull()
    expect(parsed.purgedAt).toBeInstanceOf(Date)
  })

  it('has primary key on file_key', () => {
    const config = getTableConfig(mediaUploads)
    const primaryKeys = config.columns.filter((c) => c.primary).map((c) => c.name)
    expect(primaryKeys).toEqual(['file_key'])
  })

  it('has required column profile_id in table definition', () => {
    const config = getTableConfig(mediaUploads)
    const profileCol = config.columns.find((c) => c.name === 'profile_id')
    expect(profileCol).toBeDefined()
    expect(profileCol?.notNull).toBe(true)
  })

  it('has partial GC index on (status, created_at) with condition', () => {
    const config = getTableConfig(mediaUploads)
    const gcIndex = config.indexes.find((idx) => idx.config.name === 'idx_media_gc')
    expect(gcIndex).toBeDefined()
    expect(gcIndex?.config.columns.map((c: any) => c.name)).toEqual([
      'status',
      'created_at',
    ])
    expect(gcIndex?.config.where).toBeDefined()
  })

  it('has entity index on (entity_type, entity_id)', () => {
    const config = getTableConfig(mediaUploads)
    const entityIndex = config.indexes.find(
      (idx) => idx.config.name === 'idx_media_entity'
    )
    expect(entityIndex).toBeDefined()
    expect(entityIndex?.config.columns.map((c: any) => c.name)).toEqual([
      'entity_type',
      'entity_id',
    ])
  })

  it('has profile_id index for lookups and deletion cascade', () => {
    const config = getTableConfig(mediaUploads)
    const profileIndex = config.indexes.find(
      (idx) => idx.config.name === 'idx_media_profile_id'
    )
    expect(profileIndex).toBeDefined()
    expect(profileIndex?.config.columns.map((c: any) => c.name)).toEqual(['profile_id'])
  })

  it('has expected enum constants defined', () => {
    expect(MEDIA_UPLOAD_STATUSES).toEqual(['pending', 'attached', 'deleted', 'purged', 'gc_failed'])
    expect(MEDIA_ENTITY_TYPES).toEqual(['post', 'comment', 'avatar'])
  })
})
