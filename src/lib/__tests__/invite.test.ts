import { describe, it, expect } from 'bun:test'
import { generateRandomInviteCode } from '../invite'

describe('Invite Utility Tests', () => {
  it('generates random uppercase formatted invite codes with WISAL prefix', () => {
    const code1 = generateRandomInviteCode()
    const code2 = generateRandomInviteCode()

    expect(code1).not.toBe(code2)
    expect(/^WISAL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code1)).toBe(true)
    expect(/^WISAL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code2)).toBe(true)
  })
})
