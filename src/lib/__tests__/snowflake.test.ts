import { describe, it, expect } from 'bun:test'
import {
  generateSnowflakeId,
  isValidSnowflake,
} from '../snowflake'
import {
  snowflakeParamSchema,
  MAX_PG_BIGINT,
} from '../../db/schema/common'

describe('Snowflake & BigInt Overflow Protection Tests', () => {
  it('MAX_PG_BIGINT equals signed 64-bit int max (9223372036854775807n)', () => {
    expect(MAX_PG_BIGINT).toBe(9223372036854775807n)
    expect(MAX_PG_BIGINT.toString()).toBe('9223372036854775807')
  })

  it('generateSnowflakeId generates valid 64-bit bigint within MAX_PG_BIGINT', () => {
    const id = generateSnowflakeId()
    expect(typeof id).toBe('bigint')
    expect(id > 0n).toBe(true)
    expect(id <= MAX_PG_BIGINT).toBe(true)
    expect(isValidSnowflake(id)).toBe(true)
    expect(isValidSnowflake(id.toString())).toBe(true)
  })

  it('isValidSnowflake validates numeric snowflake IDs and rejects invalid ones', () => {
    expect(isValidSnowflake('1')).toBe(true)
    expect(isValidSnowflake('123456789012345678')).toBe(true)
    expect(isValidSnowflake('9223372036854775807')).toBe(true)

    // Overflows signed 64-bit BigInt
    expect(isValidSnowflake('9223372036854775808')).toBe(false)
    expect(isValidSnowflake('9999999999999999999')).toBe(false)
    expect(isValidSnowflake('10000000000000000000')).toBe(false) // 20 digits

    // Invalid formats
    expect(isValidSnowflake('-1')).toBe(false)
    expect(isValidSnowflake('abc')).toBe(false)
    expect(isValidSnowflake('')).toBe(false)
    expect(isValidSnowflake('   ')).toBe(false)
  })

  it('snowflakeParamSchema parses valid snowflake param object into BigInt', () => {
    expect(snowflakeParamSchema.parse({ id: '100' })).toEqual({ id: 100n })
    expect(snowflakeParamSchema.parse({ id: '9223372036854775807' })).toEqual({ id: 9223372036854775807n })
  })

  it('snowflakeParamSchema rejects inputs exceeding MAX_PG_BIGINT', () => {
    expect(() => snowflakeParamSchema.parse({ id: '9223372036854775808' })).toThrow()
    expect(() => snowflakeParamSchema.parse({ id: '99999999999999999999999999999999999999999999' })).toThrow()
    expect(() => snowflakeParamSchema.parse({ id: '-5' })).toThrow()
    expect(() => snowflakeParamSchema.parse({ id: 'invalid' })).toThrow()
  })
})
