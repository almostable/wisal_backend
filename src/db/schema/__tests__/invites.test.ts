import { describe, it, expect } from 'bun:test'
import { insertInviteSchema, selectInviteSchema, inviteCodeSchema } from '../invites'

describe('Invites Schema Tests', () => {
  it('validates a valid invite code (min 8 chars) and insert payload', () => {
    expect(inviteCodeSchema.parse('INVITE-2026')).toBe('INVITE-2026')

    const parsed = insertInviteSchema.parse({
      code: 'INVITE-XYZ-1234',
      createdById: 123456789012345n,
      expiresAt: new Date(Date.now() + 86400000),
    })

    expect(parsed.code).toBe('INVITE-XYZ-1234')
    expect(parsed.createdById).toBe(123456789012345n)
    expect(parsed.expiresAt).toBeInstanceOf(Date)
    expect(parsed.usedById).toBeUndefined()
    expect(parsed.usedAt).toBeUndefined()
  })

  it('rejects invite codes shorter than 8 characters', () => {
    expect(() => inviteCodeSchema.parse('1234567')).toThrow()
    expect(inviteCodeSchema.parse('12345678')).toBe('12345678')
  })

  it('allows optional/nullable createdById and supports inviterId in insertInviteSchema', () => {
    const withoutCreator = insertInviteSchema.parse({
      code: 'AUTO-GEN-1234',
      expiresAt: new Date(),
    })
    expect(withoutCreator.code).toBe('AUTO-GEN-1234')
    expect(withoutCreator.createdById).toBeUndefined()
    expect(withoutCreator.inviterId).toBeUndefined()

    const withInviter = insertInviteSchema.parse({
      code: 'USER-REF-1234',
      inviterId: 55555n,
      expiresAt: new Date(),
    })
    expect(withInviter.code).toBe('USER-REF-1234')
    expect(withInviter.inviterId).toBe(55555n)
    expect(withInviter.createdById).toBeUndefined()
  })

  it('rejects missing expiresAt in insertInviteSchema', () => {
    expect(() =>
      insertInviteSchema.parse({
        code: 'VALID-CODE-123',
        createdById: 123456789012345n,
      })
    ).toThrow()
  })

  it('correctly parses selectInviteSchema with all fields', () => {
    const now = new Date()
    const invite = selectInviteSchema.parse({
      id: 99999n,
      code: 'INVITE-TEST',
      expiresAt: now,
      createdById: 11111n,
      inviterId: 33333n,
      usedById: 22222n,
      usedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    expect(invite.code).toBe('INVITE-TEST')
    expect(invite.usedById).toBe(22222n)
    expect(invite.createdById).toBe(11111n)
    expect(invite.inviterId).toBe(33333n)
  })

  it('correctly parses selectInviteSchema with null createdById and null inviterId', () => {
    const now = new Date()
    const invite = selectInviteSchema.parse({
      id: 99999n,
      code: 'INVITE-SYSTEM',
      expiresAt: now,
      createdById: null,
      inviterId: null,
      usedById: null,
      usedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    expect(invite.code).toBe('INVITE-SYSTEM')
    expect(invite.createdById).toBeNull()
    expect(invite.inviterId).toBeNull()
    expect(invite.usedById).toBeNull()
  })
})
