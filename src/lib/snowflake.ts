import { Snowflake } from '@sapphire/snowflake'

// Enable BigInt serialization to JSON strings globally
declare global {
  interface BigInt {
    toJSON(): string
  }
}

;(BigInt.prototype as any).toJSON = function (): string {
  return this.toString()
}

/**
 * Wisal Epoch: 2024-01-01T00:00:00.000Z (timestamp in ms)
 */
export const WISAL_EPOCH = 1704067200000n

/**
 * Snowflake ID generator instance configured with project epoch
 */
export const snowflake = new Snowflake(WISAL_EPOCH)

/**
 * Generates a new 64-bit Snowflake ID as a bigint
 */
export function generateSnowflakeId(): bigint {
  return snowflake.generate()
}

/**
 * Converts a Snowflake bigint to a string (safe for JSON transmission)
 */
export function snowflakeToString(id: bigint): string {
  return id.toString()
}

/**
 * Parses a Snowflake string or number to a bigint
 */
export function stringToSnowflake(id: string | number | bigint): bigint {
  return typeof id === 'bigint' ? id : BigInt(id)
}

/**
 * Extracts the generation timestamp (Date) from a Snowflake ID
 */
export function getSnowflakeTimestamp(id: bigint | string): Date {
  const bigId = typeof id === 'bigint' ? id : BigInt(id)
  return new Date(Number(snowflake.timestampFrom(bigId)))
}

/**
 * Validates whether a given value is a valid Snowflake ID
 */
export function isValidSnowflake(id: unknown): boolean {
  if (typeof id === 'bigint') return id > 0n
  if (typeof id === 'string') {
    return /^\d{1,20}$/.test(id)
  }
  return false
}
