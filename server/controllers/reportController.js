// =============================================================================
// REUSE RADAR - REPORT CONTROLLER (reportController.js)
// Purpose: Anti-Fraud system (Feature 22) — lets students report suspicious
//          listings or bad actors. All reports go to admin moderation queue.
//          Built-in protections: prevent self-report, prevent duplicate reports.
// Routes handled:
//   POST /api/reports/item/:itemId     — Report a suspicious listing
//   POST /api/reports/user/:userId     — Report a bad actor student
//   GET  /api/reports/my-reports       — View my submitted reports history
// =============================================================================

// 'mongoose' needed for ObjectId validation
const mongoose = require('mongoose');

// Report model — stores every submitted complaint
const Report = require('../models/Report');

// Item model — needed to verify item exists and check ownership
const Item = require('../models/Item');

// User model — needed to verify target user exists
const User = require('../models/User');

// =============================================================================
// @desc    Report an inappropriate or spam item listing (Feature 22)
// @route   POST /api/reports/item/:itemId
// @access  Protected
// Flow: validate → check item exists → check not own item → check no duplicate → create report
// =============================================================================

exports.reportItem = async (req, res) => {
  try {
    const { itemId } = req.params;              // Item being reported
    const { reason, description } = req.body;  // Report details from the form

    // Validate that itemId is a proper MongoDB ObjectId (prevents injection)
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    // A reason must be provided (dropdown selection in the report modal)
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please select a reason for reporting this item',
      });
    }

    // Verify the item actually exists in the database
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found or already deleted',
      });
    }

    // Prevent users from reporting their own listing (self-report makes no sense)
    // item.donor is an ObjectId; .equals() does proper ObjectId comparison
    if (item.donor.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own item listing',
      });
    }

    // Check if this user already submitted an active report for this item
    // $in checks if status is in the array ['pending', 'reviewing']
    // We allow re-reporting once an old report is resolved/rejected
    const existingReport = await Report.findOne({
      reporter: req.user._id,
      reportedItem: item._id,
      status: { $in: ['pending', 'reviewing'] }, // Only check for active/open reports
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted a report for this item. Our moderation team is reviewing it.',
      });
    }

    // Create the report document in MongoDB
    const report = await Report.create({
      reporter: req.user._id,       // Who filed the report
      reportedItem: item._id,       // Which item is being reported
      reportedUser: item.donor,     // The item's owner is implicitly also being reported
      reportType: 'item',           // Type: 'item' (vs 'user' for user reports)
      reason: reason.trim(),        // Short reason label
      description: (description || '').trim(), // Optional detailed description
      status: 'pending',            // All reports start in pending state for admin review
    });

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Thank you for helping keep our campus community safe.',
      reportId: report._id,
    });
  } catch (error) {
    console.error('[ReportItem Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error submitting item report',
    });
  }
};

// =============================================================================
// @desc    Report an abusive or suspicious user (Feature 22)
// @route   POST /api/reports/user/:userId
// @access  Protected
// Flow: validate → check not self → verify user exists → check no duplicate → create report
// =============================================================================

exports.reportUser = async (req, res) => {
  try {
    const { userId } = req.params;             // The user being reported
    const { reason, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please select a reason for reporting this user',
      });
    }

    // Prevent self-reporting (users cannot report themselves)
    // req.user._id is a Mongoose ObjectId; .equals() compares correctly
    if (req.user._id.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own account',
      });
    }

    // Verify the target user exists in the database
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check for existing active report on this specific user by this reporter
    const existingReport = await Report.findOne({
      reporter: req.user._id,
      reportedUser: targetUser._id,
      reportType: 'user',
      status: { $in: ['pending', 'reviewing'] }, // Only active reports count
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted a report for this user.',
      });
    }

    // Create the user report
    const report = await Report.create({
      reporter: req.user._id,
      reportedUser: targetUser._id, // The user being reported
      reportType: 'user',           // Type: 'user' (not 'item')
      reason: reason.trim(),
      description: (description || '').trim(),
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      message: 'User report submitted successfully. Our campus moderation team will review this.',
      reportId: report._id,
    });
  } catch (error) {
    console.error('[ReportUser Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error submitting user report',
    });
  }
};

// =============================================================================
// @desc    Get reports submitted by logged-in user (Feature 22)
// @route   GET /api/reports/my-reports
// @access  Protected
// Called from ProfileScreen to show report history to the user
// =============================================================================

exports.getMyReports = async (req, res) => {
  try {
    // Find all reports where this user is the reporter (filed BY them)
    const reports = await Report.find({ reporter: req.user._id })
      // Populate item details for display in report history
      .populate('reportedItem', 'title category images status isHidden')
      // Populate user details for display in report history
      .populate('reportedUser', 'name email collegeName avatar')
      .sort({ createdAt: -1 }) // Newest reports first
      .lean();

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    console.error('[GetMyReports Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching your reports',
    });
  }
};
