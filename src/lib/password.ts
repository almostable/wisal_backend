import {
  hash,
  verify,
  needsRehash as argon2NeedsRehash,
  argon2id,
  type HashOptions,
} from 'argon2'

/**
 * OWASP Recommended Argon2id Options
 * - type: argon2id (resistant against both side-channel and GPU cracking attacks)
 * - memoryCost: 64 MiB (65536 KiB)
 * - timeCost: 3 iterations
 * - parallelism: 1 thread
 */
export const ARGON2_OPTIONS: HashOptions & { raw?: false } = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  raw: false,
}

/**
 * Hashes a plaintext password using Argon2id with cryptographically secure salt
 * @param password Plaintext password to hash
 * @returns Argon2id hash string
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

/**
 * Verifies a plaintext password against an Argon2id hash in constant time
 * @param passwordHash The stored password hash
 * @param password The plaintext password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

/**
 * Checks if a hash was created with older parameters and needs rehashing
 * @param passwordHash The stored password hash
 * @returns True if the hash should be re-computed with current options
 */
export function needsRehash(passwordHash: string): boolean {
  return argon2NeedsRehash(passwordHash, {
    memoryCost: ARGON2_OPTIONS.memoryCost,
    timeCost: ARGON2_OPTIONS.timeCost,
    parallelism: ARGON2_OPTIONS.parallelism,
  })
}
