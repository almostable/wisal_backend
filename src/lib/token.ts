import { createHash, randomBytes } from 'node:crypto'

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function calculateExpiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export function isExpired(expiresAt: Date): boolean {
  return Date.now() >= expiresAt.getTime()
}

