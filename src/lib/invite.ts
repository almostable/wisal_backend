import { randomBytes } from 'node:crypto'

export function generateRandomInviteCode(): string {
  const bytes = randomBytes(8).toString('hex').toUpperCase()
  return `WISAL-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}`
}
