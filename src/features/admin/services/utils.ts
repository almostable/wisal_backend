import { MAX_PG_BIGINT } from '../../../db/schema/common'

export function parseSafeBigInt(val: string): bigint | null {
  if (!/^\d{1,19}$/.test(val)) return null
  try {
    const b = BigInt(val)
    return b > 0n && b <= MAX_PG_BIGINT ? b : null
  } catch {
    return null
  }
}
