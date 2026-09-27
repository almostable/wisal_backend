import { pgTable, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { snowflakePrimaryKey, snowflakeId, timestamps } from './common'
import { admins } from './admins'
import { invites } from './invites'

export const INVITE_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type InviteApplicationStatus = (typeof INVITE_APPLICATION_STATUSES)[number]

export const inviteApplications = pgTable(
  'invite_applications',
  {
    id: snowflakePrimaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    about: text('about').notNull(),
    reason: text('reason').notNull(),
    contact: varchar('contact', { length: 255 }).notNull(),
    contactNormalized: varchar('contact_normalized', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    reviewedById: snowflakeId('reviewed_by_id').references(() => admins.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    inviteId: snowflakeId('invite_id').references(() => invites.id, { onDelete: 'set null' }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    ...timestamps,
  },
  (table) => [
    index('invite_applications_status_idx').on(table.status),
    index('invite_applications_created_at_idx').on(table.createdAt),
    index('invite_applications_contact_norm_idx').on(table.contactNormalized),
    uniqueIndex('invite_applications_pending_contact_unique_idx')
      .on(table.contactNormalized).where(sql`${table.status} = 'pending'`),
    index('invite_applications_invite_id_idx').on(table.inviteId),
    index('invite_applications_reviewed_by_id_idx').on(table.reviewedById),
    index('invite_applications_ip_status_idx').on(table.ip, table.status),
    uniqueIndex('invite_applications_pending_ip_unique_idx')
      .on(table.ip).where(sql`${table.status} = 'pending' AND ${table.ip} IS NOT NULL AND ${table.ip} != 'anonymous'`),
    index('invite_applications_ip_created_at_idx').on(table.ip, table.createdAt),
  ]
)

export const inviteApplicationsRelations = relations(inviteApplications, ({ one }) => ({
  reviewer: one(admins, {
    fields: [inviteApplications.reviewedById],
    references: [admins.id],
  }),
  invite: one(invites, {
    fields: [inviteApplications.inviteId],
    references: [invites.id],
  }),
}))

export const insertInviteApplicationSchema = createInsertSchema(inviteApplications)
export const selectInviteApplicationSchema = createSelectSchema(inviteApplications)

export type InviteApplication = typeof inviteApplications.$inferSelect
export type NewInviteApplication = typeof inviteApplications.$inferInsert
