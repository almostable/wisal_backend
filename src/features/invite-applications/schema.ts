import { z } from 'zod'

export function normalizeContact(contact: string): string {
  let normalized = contact.trim().toLowerCase()
  if (normalized.startsWith('https://t.me/')) {
    normalized = normalized.replace('https://t.me/', '')
  } else if (normalized.startsWith('http://t.me/')) {
    normalized = normalized.replace('http://t.me/', '')
  } else if (normalized.startsWith('t.me/')) {
    normalized = normalized.replace('t.me/', '')
  }
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1)
  }
  return normalized.trim()
}

export const createInviteApplicationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must be at most 100 characters long'),
  about: z
    .string()
    .trim()
    .min(10, 'About must be at least 10 characters long')
    .max(3000, 'About must be at most 3000 characters long'),
  reason: z
    .string()
    .trim()
    .min(10, 'Reason must be at least 10 characters long')
    .max(3000, 'Reason must be at most 3000 characters long'),
  contact: z
    .string()
    .trim()
    .min(3, 'Contact must be at least 3 characters long')
    .max(255, 'Contact must be at most 255 characters long'),
  turnstileToken: z
    .string()
    .trim()
    .min(1, 'Turnstile captcha token is required'),
  website: z.string().optional(),
})

export type CreateInviteApplicationSchema = z.infer<typeof createInviteApplicationSchema>
