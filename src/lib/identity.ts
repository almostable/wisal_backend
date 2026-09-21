import crypto from 'node:crypto'

export const SAFE_IDENTITY_ALPHABET = '23456789bcdfghjkmnpqrstvwxyz'

export function generateRandomUserIdentity(): string {
  const bytes = crypto.randomBytes(6)
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += SAFE_IDENTITY_ALPHABET[bytes[i] % SAFE_IDENTITY_ALPHABET.length]
  }
  return `user${suffix}`
}
