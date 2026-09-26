import { describe, it, expect } from 'bun:test'
import {
  insertInviteApplicationSchema,
  selectInviteApplicationSchema,
  INVITE_APPLICATION_STATUSES,
} from '../invite-applications'

describe('Invite Applications Schema Tests', () => {
  it('validates a valid invite application insert payload', () => {
    const payload = {
      name: 'John Doe',
      about: 'I am a backend engineer working with TypeScript and Go.',
      reason: 'I would like to participate in the Wisal community and share knowledge.',
      contact: '@johndoe',
      contactNormalized: 'johndoe',
    }

    const parsed = insertInviteApplicationSchema.parse(payload)
    expect(parsed.name).toBe('John Doe')
    expect(parsed.about).toContain('backend engineer')
    expect(parsed.reason).toContain('participate')
    expect(parsed.contact).toBe('@johndoe')
    expect(parsed.contactNormalized).toBe('johndoe')
  })

  it('rejects missing required fields in insertInviteApplicationSchema', () => {
    expect(() =>
      insertInviteApplicationSchema.parse({
        name: 'John Doe',
      })
    ).toThrow()
  })

  it('correctly parses selectInviteApplicationSchema with all fields', () => {
    const now = new Date()
    const app = selectInviteApplicationSchema.parse({
      id: 111111111111111n,
      name: 'John Doe',
      about: 'My bio',
      reason: 'Why join',
      contact: 'john@example.com',
      contactNormalized: 'john@example.com',
      status: 'approved',
      reviewedById: 222222222222222n,
      reviewedAt: now,
      reviewNote: 'Looks great',
      inviteId: 333333333333333n,
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      createdAt: now,
      updatedAt: now,
    })

    expect(app.id).toBe(111111111111111n)
    expect(app.status).toBe('approved')
    expect(app.reviewedById).toBe(222222222222222n)
    expect(app.inviteId).toBe(333333333333333n)
  })

  it('correctly parses selectInviteApplicationSchema with pending status and null optional fields', () => {
    const now = new Date()
    const app = selectInviteApplicationSchema.parse({
      id: 111111111111111n,
      name: 'Jane Doe',
      about: 'Designer bio',
      reason: 'Join reason',
      contact: '@janedoe',
      contactNormalized: 'janedoe',
      status: 'pending',
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      inviteId: null,
      ip: null,
      userAgent: null,
      createdAt: now,
      updatedAt: now,
    })

    expect(app.status).toBe('pending')
    expect(app.reviewedById).toBeNull()
    expect(app.inviteId).toBeNull()
  })

  it('has expected status enum constants defined', () => {
    expect(INVITE_APPLICATION_STATUSES).toEqual(['pending', 'approved', 'rejected'])
  })
})
