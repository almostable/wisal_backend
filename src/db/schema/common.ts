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

export const createPaginationSchema = (defaultLimit = 50, maxLimit = 100) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  })

export const paginationQuerySchema = createPaginationSchema(50, 100)

export const snowflakeParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d{1,20}$/, 'Invalid ID format')
    .transform((val) => BigInt(val)),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type SnowflakeParam = z.infer<typeof snowflakeParamSchema>

