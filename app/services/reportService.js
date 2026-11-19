// =============================================================================
// REUSE RADAR - REPORT SERVICE (reportService.js)
// Purpose: Wraps all report/moderation API calls for the anti-fraud system (Feature 22).
//          Two groups of functions:
//            1. Regular user functions — report items or users
//            2. Admin-only functions   — view, process, and act on reports
//          Used by: UserProfileScreen (report user), ItemDetailsScreen (report item),
//                   AdminModerationScreen (admin dashboard).
// API Endpoints covered (User):
//   POST /api/reports/item/:itemId     — Report a fraudulent/inappropriate listing
//   POST /api/reports/user/:userId     — Report a bad actor student
//   GET  /api/reports/my-reports       — My submitted reports
// API Endpoints covered (Admin):
//   GET  /api/admin/reports            — All reports with filtering
//   GET  /api/admin/reports/:id        — Single report details
//   PUT  /api/admin/reports/:id        — Update report status + add notes
//   POST /api/admin/items/:id/hide     — Hide/restore a listing
//   POST /api/admin/users/:id/suspend  — Suspend/unsuspend a user account
//   GET  /api/admin/stats              — Moderation dashboard stats
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const reportService = {
  // ── USER FUNCTIONS ─────────────────────────────────────────────────────────

  // Report a suspicious item listing (Feature 22)
  // itemId      = MongoDB _id of the item being reported
  // reason      = Short category (e.g., 'Spam', 'Fake item', 'Inappropriate content')
  // description = Optional detailed explanation (up to 1000 characters)
  async reportItem(itemId, reason, description = '') {
    return await api.post(`/reports/item/${itemId}`, {
      reason,
      description,
    });
  },

  // Report a problematic user (Feature 22)
  // userId      = MongoDB _id of the user being reported
  // reason      = Short category (e.g., 'No show', 'Harassment', 'Scam')
  // description = Optional detailed explanation
  async reportUser(userId, reason, description = '') {
    return await api.post(`/reports/user/${userId}`, {
      reason,
      description,
    });
  },

  // Get all reports submitted BY the current user (for personal report history)
  async getMyReports() {
    return await api.get('/reports/my-reports');
  },

  // ── ADMIN MODERATION FUNCTIONS (require role='admin') ─────────────────────

  // List all reports with optional status/type filtering and pagination
  // status = 'all' | 'pending' | 'reviewing' | 'resolved' | 'rejected'
  // page   = page number for pagination (default 1)
  async getAdminReports(status = 'all', page = 1) {
    return await api.get(`/admin/reports?status=${status}&page=${page}`);
  },

  // Get full details of a single report (for admin review panel)
  async getAdminReportById(id) {
    return await api.get(`/admin/reports/${id}`);
  },

  // Update a report's status and add admin notes
  // status     = 'reviewing' | 'resolved' | 'rejected'
  // adminNotes = Admin's decision rationale (stored internally, not shown to users)
  async updateReportStatus(reportId, status, adminNotes = '') {
    return await api.put(`/admin/reports/${reportId}`, {
      status,
      adminNotes,
    });
  },

  // Hide or restore an item listing from the marketplace
  // isHidden     = true (hide) or false (restore)
  // hiddenReason = Explanation shown to the item owner when their listing is hidden
  async toggleHideItem(itemId, isHidden, hiddenReason = '') {
    return await api.post(`/admin/items/${itemId}/hide`, {
      isHidden,
      hiddenReason,
    });
  },

  // Suspend or unsuspend a user account
  // isSuspended     = true (suspend) or false (restore account)
  // suspensionReason = Shown to user when they try to log in with a suspended account
  async toggleSuspendUser(userId, isSuspended, suspensionReason = '') {
    return await api.post(`/admin/users/${userId}/suspend`, {
      isSuspended,
      suspensionReason,
    });
  },

  // Get overview statistics for the admin moderation dashboard
  // Returns: total reports, pending count, resolved count, active items, suspended users, etc.
  async getAdminStats() {
    return await api.get('/admin/stats');
  },
};
