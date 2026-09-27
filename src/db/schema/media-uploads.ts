import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { snowflakeId } from './common'
import { profiles } from './profiles'

export const MEDIA_UPLOAD_STATUSES = ['pending', 'attached', 'deleted', 'purged', 'gc_failed'] as const
export type MediaUploadStatus = (typeof MEDIA_UPLOAD_STATUSES)[number]

export const MEDIA_ENTITY_TYPES = ['post', 'comment', 'avatar'] as const
export type MediaEntityType = (typeof MEDIA_ENTITY_TYPES)[number]

export const mediaUploads = pgTable(
  'media_uploads',
  {
    fileKey: varchar('file_key', { length: 512 }).primaryKey(),
    profileId: snowflakeId('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    entityType: varchar('entity_type', { length: 32 }),
    entityId: snowflakeId('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_media_gc')
      .on(table.status, table.createdAt)
      .where(sql`${table.status} IN ('pending', 'deleted', 'gc_failed')`),
    index('idx_media_purged')
      .on(table.purgedAt)
      .where(sql`${table.status} = 'purged'`),
    index('idx_media_entity').on(table.entityType, table.entityId),
    index('idx_media_profile_id').on(table.profileId),
  ]
)

export const mediaUploadsRelations = relations(mediaUploads, ({ one }) => ({
  profile: one(profiles, {
    fields: [mediaUploads.profileId],
    references: [profiles.id],
  }),
}))

export const insertMediaUploadSchema = createInsertSchema(mediaUploads, {
  status: () => z.enum(MEDIA_UPLOAD_STATUSES).default('pending'),
  entityType: () => z.enum(MEDIA_ENTITY_TYPES).optional(),
})
export const selectMediaUploadSchema = createSelectSchema(mediaUploads)

export type MediaUpload = typeof mediaUploads.$inferSelect
export type NewMediaUpload = typeof mediaUploads.$inferInsert
