import { pgTable, timestamp, primaryKey, check, index } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakeId } from './common'
import { profiles } from './profiles'

export const readers = pgTable(
  'readers',
  {
    readerProfileId: snowflakeId('reader_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    authorProfileId: snowflakeId('author_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'date' }),
    lastReadPostId: snowflakeId('last_read_post_id'),
  },
  (table) => [
    primaryKey({
      name: 'readers_reader_profile_id_author_profile_id_pk',
      columns: [table.readerProfileId, table.authorProfileId],
    }),
    check('readers_prevent_self_read_check', sql`${table.readerProfileId} != ${table.authorProfileId}`),
    index('readers_author_profile_id_idx').on(table.authorProfileId),
    index('readers_created_at_idx').on(table.createdAt),
    index('idx_readers_regular_readers').on(table.authorProfileId, table.lastReadAt),
  ]
)

export const readersRelations = relations(readers, ({ one }) => ({
  reader: one(profiles, {
    fields: [readers.readerProfileId],
    references: [profiles.id],
    relationName: 'reader',
  }),
  author: one(profiles, {
    fields: [readers.authorProfileId],
    references: [profiles.id],
    relationName: 'author',
  }),
}))

export const insertReaderSchema = createInsertSchema(readers).refine(
  (data) => data.readerProfileId !== data.authorProfileId,
  {
    message: 'Profiles cannot read themselves',
    path: ['authorProfileId'],
  }
)

export const selectReaderSchema = createSelectSchema(readers)

export type Reader = typeof readers.$inferSelect
export type NewReader = typeof readers.$inferInsert
