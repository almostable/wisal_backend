import { bigint, timestamp } from 'drizzle-orm/pg-core'
import { z } from 'zod'
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

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .max(255, 'Email is too long')
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.string().email('Invalid email address'))

