// =============================================================================
// REUSE RADAR - REPORT MODEL (Report.js)
// Purpose: Stores fraud/abuse reports submitted by students about items or other users.
//          Powers the Admin Moderation dashboard (Feature 22 - Anti-Fraud System).
// Features:
//   1. Dual report types: 'item' (suspicious listing) or 'user' (bad actor)
//   2. Status lifecycle: pending → reviewing → resolved / rejected
//   3. Admin notes field for recording moderation decisions
//   4. resolvedBy + resolvedAt for audit trail of admin actions
//   5. Compound indexes for admin dashboard filtering and duplicate-check queries
// =============================================================================

// 'mongoose' is the ODM library for MongoDB
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// Each document is one complaint submitted by a student
// =============================================================================

const reportSchema = new mongoose.Schema(
  {
    // ── Who Reported ──────────────────────────────────────────────────────────

    reporter: {
      type: mongoose.Schema.Types.ObjectId, // The student who submitted this report
      ref: 'User',
      required: [true, 'Reporter reference is required'],
      index: true, // Index for "show all reports submitted by this user"
    },

    // ── What Was Reported ─────────────────────────────────────────────────────
    // Only ONE of reportedUser or reportedItem will be set, based on reportType.

    reportedUser: {
      type: mongoose.Schema.Types.ObjectId, // Set when reporting a USER's behavior
      ref: 'User',
      index: true,
    },

    reportedItem: {
      type: mongoose.Schema.Types.ObjectId, // Set when reporting a LISTING as fraudulent
      ref: 'Item',
      index: true,
    },

    // ── Report Category ───────────────────────────────────────────────────────

    reportType: {
      type: String,
      enum: ['item', 'user'], // Determines whether reportedItem or reportedUser is used
      required: [true, 'Report type must be either item or user'],
      index: true, // Enables filtering by type in the admin dashboard
    },

    // ── Reason ────────────────────────────────────────────────────────────────

    reason: {
      type: String,
      required: [true, 'Please select or provide a reason for the report'],
      trim: true,
      maxlength: 120, // Short reason label (e.g., 'Spam listing', 'Harassment')
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000, // Optional detailed description of the problem
      default: '',
    },

    // ── Moderation Status Lifecycle ───────────────────────────────────────────
    // Flow:
    //   'pending'   → Report just submitted, waiting for admin to review
    //   'reviewing' → Admin opened the report and is investigating
    //   'resolved'  → Admin took action (item hidden, user suspended, etc.)
    //   'rejected'  → Admin determined the report was invalid/false

    status: {
      type: String,
      enum: ['pending', 'reviewing', 'resolved', 'rejected'],
      default: 'pending', // All reports start in pending state
      index: true,        // Enables filtering by status in admin dashboard
    },

    // ── Admin Notes ───────────────────────────────────────────────────────────

    adminNotes: {
      type: String,
      trim: true,
      default: '', // Admin writes their decision reasoning here (internal use only)
    },

    // ── Resolution Audit Trail ────────────────────────────────────────────────

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId, // Which admin user took action on this report
      ref: 'User',
    },

    resolvedAt: {
      type: Date, // When the report was resolved — for audit log tracking
    },
  },
  {
    timestamps: true, // 'createdAt' shows when the report was filed
  }
);

// =============================================================================
// Database Indexes
// =============================================================================

// Admin dashboard primary query: sort by status first, then newest reports at top
reportSchema.index({ status: 1, createdAt: -1 });

// Prevents duplicate item reports from the same user
// Also enables "has this user already reported this item?" check
reportSchema.index({ reporter: 1, reportedItem: 1 });

// Same check for user reports — prevents harassment by filing multiple reports
reportSchema.index({ reporter: 1, reportedUser: 1 });

// Register as the 'Report' model in Mongoose
// Documents stored in 'reports' MongoDB collection
module.exports = mongoose.model('Report', reportSchema);
