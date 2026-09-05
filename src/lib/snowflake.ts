import { Snowflake } from '@sapphire/snowflake'

declare global {
  interface BigInt {
    toJSON(): string
  }
}

if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function (): string {
      return this.toString()
    },
    writable: true,
    configurable: true,
  })
}

export const WISAL_EPOCH = 1704067200000n

export const snowflake = new Snowflake(WISAL_EPOCH)

export function generateSnowflakeId(): bigint {
  return snowflake.generate()
}

export function snowflakeToString(id: bigint): string {
  return id.toString()
}

export function stringToSnowflake(id: string | number | bigint): bigint {
  return typeof id === 'bigint' ? id : BigInt(id)
}

export function getSnowflakeTimestamp(id: bigint | string): Date {
  const bigId = typeof id === 'bigint' ? id : BigInt(id)
  return new Date(Number(snowflake.timestampFrom(bigId)))
}

export function isValidSnowflake(id: unknown): boolean {
  if (typeof id === 'bigint') return id > 0n
  if (typeof id === 'string') {
    return /^\d{1,20}$/.test(id)
  }
  return false
}
