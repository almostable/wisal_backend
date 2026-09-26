import { describe, it, expect } from 'bun:test'
import {
  rejectInviteApplicationSchema,
  approveInviteApplicationSchema,
  listInviteApplicationsQuerySchema,
} from '../schema'

describe('Admin Invite Applications Schema and Validation Unit Tests', () => {
  it('rejectInviteApplicationSchema rejects reviewNote shorter than 5 chars', () => {
    expect(() => rejectInviteApplicationSchema.parse({ reviewNote: 'bad' })).toThrow()
    expect(() => rejectInviteApplicationSchema.parse({ reviewNote: '   ' })).toThrow()
    expect(() => rejectInviteApplicationSchema.parse({})).toThrow()

    const parsed = rejectInviteApplicationSchema.parse({
      reviewNote: 'Candidate does not meet criteria',
    })
    expect(parsed.reviewNote).toBe('Candidate does not meet criteria')
  })

  it('approveInviteApplicationSchema allows optional reviewNote', () => {
    expect(approveInviteApplicationSchema.parse({})).toEqual({})
    expect(approveInviteApplicationSchema.parse({ reviewNote: 'Looks good' })).toEqual({
      reviewNote: 'Looks good',
    })
  })

  it('listInviteApplicationsQuerySchema validates status enum and defaults', () => {
    const parsedDefault = listInviteApplicationsQuerySchema.parse({})
    expect(parsedDefault.status).toBe('all')
    expect(parsedDefault.limit).toBe(50)
    expect(parsedDefault.offset).toBe(0)

    const parsedPending = listInviteApplicationsQuerySchema.parse({ status: 'pending', q: 'alex' })
    expect(parsedPending.status).toBe('pending')
    expect(parsedPending.q).toBe('alex')

    expect(() => listInviteApplicationsQuerySchema.parse({ status: 'invalid_status' })).toThrow()
  })
})
