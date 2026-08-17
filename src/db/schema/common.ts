import { bigint, timestamp } from 'drizzle-orm/pg-core'
import { generateSnowflakeId } from '../../lib/snowflake'

/**
 * Helper for 64-bit integer Snowflake ID primary keys with auto-generation
 */
export const snowflakePrimaryKey = (name = 'id') =>
  bigint(name, { mode: 'bigint' })
    .primaryKey()
    .$defaultFn(() => generateSnowflakeId())

/**
 * Helper for 64-bit integer Snowflake ID columns (e.g. foreign keys)
 */
export const snowflakeId = (name = 'id') => bigint(name, { mode: 'bigint' })

/**
 * Standard timestamp columns with timezone support and automatic update on change
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}
