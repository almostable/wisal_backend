import { bigint, timestamp } from 'drizzle-orm/pg-core'
import { generateSnowflakeId } from '../../lib/snowflake'

export const snowflakePrimaryKey = (name = 'id') =>
  bigint(name, { mode: 'bigint' })
    .primaryKey()
    .$defaultFn(() => generateSnowflakeId())

export const snowflakeId = (name = 'id') => bigint(name, { mode: 'bigint' })

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}
