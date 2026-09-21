import { describe, it, expect } from 'bun:test'
import * as adminService from '../service'
import * as adminAuth from '../services/admin-auth.service'
import * as adminInvites from '../services/admin-invites.service'
import * as adminUsers from '../services/admin-users.service'
import * as adminPosts from '../services/admin-posts.service'
import * as adminComments from '../services/admin-comments.service'
import * as adminReports from '../services/admin-reports.service'

describe('Admin Service Decomposition & Facade Integrity', () => {
  it('re-exports all sub-service functions through the root facade', () => {
    // Auth service
    expect(adminService.loginAdmin).toBe(adminAuth.loginAdmin)
    expect(adminService.logoutAdmin).toBe(adminAuth.logoutAdmin)
    expect(adminService.listAdmins).toBe(adminAuth.listAdmins)
    expect(adminService.createAdmin).toBe(adminAuth.createAdmin)
    expect(adminService.deleteAdmin).toBe(adminAuth.deleteAdmin)

    // Invites service
    expect(adminService.createInvite).toBe(adminInvites.createInvite)
    expect(adminService.deleteInvite).toBe(adminInvites.deleteInvite)
    expect(adminService.listInvites).toBe(adminInvites.listInvites)

    // Users service
    expect(adminService.listUsers).toBe(adminUsers.listUsers)
    expect(adminService.getUserById).toBe(adminUsers.getUserById)
    expect(adminService.updateUserProfileByAdmin).toBe(adminUsers.updateUserProfileByAdmin)
    expect(adminService.banUserAccount).toBe(adminUsers.banUserAccount)
    expect(adminService.unbanUserAccount).toBe(adminUsers.unbanUserAccount)
    expect(adminService.revokeUserSessions).toBe(adminUsers.revokeUserSessions)

    // Posts service
    expect(adminService.listPostsByAdmin).toBe(adminPosts.listPostsByAdmin)
    expect(adminService.getPostByIdByAdmin).toBe(adminPosts.getPostByIdByAdmin)
    expect(adminService.deletePostByAdmin).toBe(adminPosts.deletePostByAdmin)
    expect(adminService.restorePostByAdmin).toBe(adminPosts.restorePostByAdmin)
    expect(adminService.updatePostByAdmin).toBe(adminPosts.updatePostByAdmin)

    // Comments service
    expect(adminService.listCommentsByAdmin).toBe(adminComments.listCommentsByAdmin)
    expect(adminService.getPostCommentsByAdmin).toBe(adminComments.getPostCommentsByAdmin)
    expect(adminService.deleteCommentByAdmin).toBe(adminComments.deleteCommentByAdmin)
    expect(adminService.restoreCommentByAdmin).toBe(adminComments.restoreCommentByAdmin)

    // Reports service
    expect(adminService.listReports).toBe(adminReports.listReports)
    expect(adminService.getReportById).toBe(adminReports.getReportById)
    expect(adminService.updateReportResolution).toBe(adminReports.updateReportResolution)
    expect(adminService.resolveReportWithAction).toBe(adminReports.resolveReportWithAction)
  })
})
