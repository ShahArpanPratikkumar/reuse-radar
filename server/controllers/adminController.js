// =============================================================================
// REUSE RADAR - ADMIN CONTROLLER (adminController.js)
// Purpose: Admin-only moderation tools for managing campus community trust.
//          All routes require role='admin' (enforced by requireAdmin middleware).
//          Powers the AdminModerationScreen in the app.
// Routes handled:
//   GET /api/admin/reports            — List all reports with filtering + pagination
//   GET /api/admin/reports/:id        — Get single report full details
//   PUT /api/admin/reports/:id        — Update report status + admin notes
//   POST /api/admin/items/:id/hide    — Hide or restore a suspicious listing
//   POST /api/admin/users/:id/suspend — Suspend or restore a user account
//   GET /api/admin/stats              — Moderation dashboard overview statistics
// =============================================================================

// 'mongoose' needed for ObjectId validation
const mongoose = require('mongoose');

// Models for data access
const Report = require('../models/Report'); // Fraud/abuse reports
const Item = require('../models/Item');     // Item listings
const User = require('../models/User');     // User accounts

// =============================================================================
// @desc    Get all reports with status filtering & pagination (Feature 22 Admin)
// @route   GET /api/admin/reports
// @access  Protected / Admin Only (requireAdmin middleware)
// Called by AdminModerationScreen to show the report queue
// =============================================================================

exports.getReports = async (req, res) => {
  try {
    // Extract query parameters for filtering and pagination
    const { status, type, page = 1, limit = 20 } = req.query;

    // Build the MongoDB filter query
    const query = {};
    if (status && status !== 'all') {
      query.status = status; // Filter by: pending, reviewing, resolved, rejected
    }
    if (type && type !== 'all') {
      query.reportType = type; // Filter by: 'item' or 'user' reports
    }

    // Pagination calculations
    const pageNumber = Math.max(1, parseInt(page, 10));                     // Minimum page 1
    const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10)));        // 1-50 per page
    const skip = (pageNumber - 1) * pageSize;                               // Documents to skip

    // Count total matching documents (for pagination UI)
    const total = await Report.countDocuments(query);

    // Fetch paginated reports with all related data populated
    const reports = await Report.find(query)
      .populate('reporter', 'name email collegeName avatar')               // Who filed the report
      .populate('reportedUser', 'name email phone isSuspended suspensionReason avatar') // Target user
      .populate('reportedItem', 'title category condition isHidden hiddenReason status images') // Target item
      .populate('resolvedBy', 'name email')                                // Which admin resolved it
      .sort({ createdAt: -1 })  // Newest reports first (most urgent at top)
      .skip(skip)               // Skip documents for pagination
      .limit(pageSize)          // Return only one page of results
      .lean();

    res.status(200).json({
      success: true,
      total,                                // Total matching reports (for pagination display)
      page: pageNumber,                     // Current page number
      pages: Math.ceil(total / pageSize),   // Total number of pages
      count: reports.length,                // Reports in this page
      reports,
    });
  } catch (error) {
    console.error('[Admin GetReports Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching moderation reports',
    });
  }
};

// =============================================================================
// @desc    Get single report details
// @route   GET /api/admin/reports/:id
// @access  Protected / Admin Only
// Called when admin clicks a report to review its full details
// =============================================================================

exports.getReportById = async (req, res) => {
  try {
    // Load the report with all related data fully populated
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'name email phone collegeName avatar')
      .populate('reportedUser', 'name email phone isSuspended suspensionReason avatar')
      .populate('reportedItem')       // Full item document (not just selected fields)
      .populate('resolvedBy', 'name email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('[Admin GetReportById Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching report details',
    });
  }
};

// =============================================================================
// @desc    Update report status (reviewing, resolved, rejected)
// @route   PUT /api/admin/reports/:id
// @access  Protected / Admin Only
// Admin uses this to progress a report through the moderation pipeline
// =============================================================================

exports.updateReport = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    // Validate the status value
    if (!['pending', 'reviewing', 'resolved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report status',
      });
    }

    // Load the report document
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }

    // Update the status
    report.status = status;

    // Save admin notes if provided (internal notes not shown to the reporter)
    if (adminNotes !== undefined) {
      report.adminNotes = adminNotes.trim();
    }

    // If the report is being closed (resolved or rejected), record who closed it and when
    // This creates an audit trail: who made the moderation decision and when
    if (['resolved', 'rejected'].includes(status)) {
      report.resolvedBy = req.user._id; // Current admin's ID
      report.resolvedAt = new Date();   // Current timestamp
    }

    // Save the updated report to MongoDB
    await report.save();

    res.status(200).json({
      success: true,
      message: `Report marked as ${status}`,
      report,
    });
  } catch (error) {
    console.error('[Admin UpdateReport Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating report',
    });
  }
};

// =============================================================================
// @desc    Moderation: Hide or Restore an Item listing
// @route   POST /api/admin/items/:itemId/hide
// @access  Protected / Admin Only
// Hides suspicious/fraudulent listings from the public marketplace
// Hidden items: not shown in search results, Explore, or HomeScreen
// =============================================================================

exports.toggleHideItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { isHidden, hiddenReason } = req.body;

    // Load the item document
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Toggle: if isHidden is explicitly provided, use it; otherwise flip the current state
    item.isHidden = isHidden !== undefined ? isHidden : !item.isHidden;

    // If hiding, save the reason (shown to item owner when they view their hidden listing)
    if (hiddenReason) {
      item.hiddenReason = hiddenReason.trim();
    } else if (!item.isHidden) {
      // If restoring, clear the hidden reason
      item.hiddenReason = '';
    }

    await item.save();

    res.status(200).json({
      success: true,
      message: item.isHidden ? 'Item listing hidden from marketplace' : 'Item listing restored',
      item,
    });
  } catch (error) {
    console.error('[Admin ToggleHideItem Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error moderating item',
    });
  }
};

// =============================================================================
// @desc    Moderation: Suspend or Unsuspend a User account
// @route   POST /api/admin/users/:userId/suspend
// @access  Protected / Admin Only
// Suspended users cannot perform actions (donate, claim, chat)
// The authMiddleware requireActiveUser() checks isSuspended on every protected request
// =============================================================================

exports.toggleSuspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isSuspended, suspensionReason } = req.body;

    // Safety: prevent an admin from suspending their own account (would lock them out)
    if (req.user._id.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot suspend your own admin account',
      });
    }

    // Load the target user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Toggle: use provided value or flip current state
    targetUser.isSuspended = isSuspended !== undefined ? isSuspended : !targetUser.isSuspended;

    // If suspending, save the reason (shown to user when they try to login/act)
    if (suspensionReason) {
      targetUser.suspensionReason = suspensionReason.trim();
    } else if (!targetUser.isSuspended) {
      // If restoring, clear the suspension reason
      targetUser.suspensionReason = '';
    }

    await targetUser.save();

    // Return only safe fields (no password, no push token)
    res.status(200).json({
      success: true,
      message: targetUser.isSuspended ? 'User account suspended' : 'User account restored',
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        isSuspended: targetUser.isSuspended,
        suspensionReason: targetUser.suspensionReason,
      },
    });
  } catch (error) {
    console.error('[Admin ToggleSuspendUser Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error moderating user',
    });
  }
};

// =============================================================================
// @desc    Moderation Statistics Overview
// @route   GET /api/admin/stats
// @access  Protected / Admin Only
// Called by AdminModerationScreen to populate the dashboard metrics cards
// All 6 count queries run in PARALLEL (not sequential) for performance
// =============================================================================

exports.getAdminStats = async (req, res) => {
  try {
    // Run all 6 count queries simultaneously using Promise.all
    // This takes the time of the SLOWEST query, not the SUM of all queries
    const totalReports = await Report.countDocuments();                          // All reports ever
    const pendingReports = await Report.countDocuments({ status: 'pending' });  // Awaiting review
    const reviewingReports = await Report.countDocuments({ status: 'reviewing' }); // Being reviewed
    const resolvedReports = await Report.countDocuments({ status: 'resolved' }); // Closed/actioned
    const suspendedUsers = await User.countDocuments({ isSuspended: true });     // Active suspensions
    const hiddenItems = await Item.countDocuments({ isHidden: true });           // Hidden listings

    res.status(200).json({
      success: true,
      stats: {
        totalReports,       // e.g., 15 — total complaints filed
        pendingReports,     // e.g., 5  — waiting for admin action (highlight this!)
        reviewingReports,   // e.g., 2  — currently being investigated
        resolvedReports,    // e.g., 8  — handled and closed
        suspendedUsers,     // e.g., 2  — currently banned accounts
        hiddenItems,        // e.g., 3  — currently hidden from marketplace
      },
    });
  } catch (error) {
    console.error('[Admin GetStats Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching moderation statistics',
    });
  }
};
