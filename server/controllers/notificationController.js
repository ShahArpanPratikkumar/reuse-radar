// =============================================================================
// REUSE RADAR - NOTIFICATION CONTROLLER (notificationController.js)
// Purpose: Manages in-app database notifications (stored in MongoDB).
//          These are separate from Expo push notifications (device-level alerts).
//          Database notifications persist and are displayed in NotificationsScreen.
// Routes handled:
//   GET  /api/notifications            — Get all notifications for current user
//   PUT  /api/notifications/:id/read   — Mark single notification as read
//   PUT  /api/notifications/mark-all-read — Mark all as read (clear badge)
//   GET  /api/notifications/unread-count  — Get badge count for bell icon
//   DELETE /api/notifications/:id      — Delete single notification
// =============================================================================

// Notification model — documents stored in MongoDB 'notifications' collection
const Notification = require('../models/Notification');

// =============================================================================
// @desc    Get user notifications (Feature 15 - Notification System)
// @route   GET /api/notifications
// @access  Protected (requires JWT)
// Returns up to 50 most recent notifications with populated sender/item details
// =============================================================================

exports.getNotifications = async (req, res) => {
  try {
    // Find all notifications where this user is the recipient
    // .populate() fetches the referenced documents (sender name/avatar, item title/image)
    // .sort({ createdAt: -1 }) = newest first (most recent at top of list)
    // .limit(50) = performance cap (most users won't need more than 50 at once)
    // .lean() = returns plain JS objects instead of Mongoose documents (faster read)
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'name avatar')     // Who triggered the notification
      .populate('relatedItem', 'title images') // Which item it's about (for preview)
      .populate('relatedRequest')            // Which request it relates to (for deep link)
      .sort({ createdAt: -1 })              // Newest notifications first
      .limit(50)                             // Cap at 50 for performance
      .lean();                               // Plain JS objects (no Mongoose overhead)

    // Count unread notifications separately for the badge (included in response)
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false, // Only count unread ones
    });

    res.status(200).json({
      success: true,
      unreadCount,              // Used by AuthContext to update bell badge number
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error('[GetNotifications Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching notifications',
    });
  }
};

// =============================================================================
// @desc    Mark single notification as read (Feature 15)
// @route   PUT /api/notifications/:id/read
// @access  Protected
// Called when user taps a specific notification in NotificationsScreen
// =============================================================================

exports.markAsRead = async (req, res) => {
  try {
    // findOneAndUpdate with { _id, recipient } ensures user can only mark THEIR OWN notifications
    // { new: true } returns the updated document (after the change)
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id }, // Must belong to current user
      { isRead: true },                                 // Set the read flag
      { new: true }                                     // Return updated document
    );

    if (!notification) {
      // Either doesn't exist OR doesn't belong to this user
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({
      success: true,
      notification, // Return updated notification for client-side state sync
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating notification',
    });
  }
};

// =============================================================================
// @desc    Mark ALL notifications as read (Feature 15)
// @route   PUT /api/notifications/mark-all-read
// @access  Protected
// Called by "Mark all as read" button — clears the notification badge
// =============================================================================

exports.markAllAsRead = async (req, res) => {
  try {
    // updateMany() updates all matching documents in a single database operation
    // This is much more efficient than loading all notifications and updating one by one
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false }, // Only update unread notifications
      { isRead: true }                             // Mark them all as read
    );
    // After this, GET /notifications/unread-count will return 0 → badge disappears

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error marking notifications read',
    });
  }
};

// =============================================================================
// @desc    Get unread notifications count (Feature 15)
// @route   GET /api/notifications/unread-count
// @access  Protected
// Called periodically by AuthContext (every 30 seconds) to update bell badge
// =============================================================================

exports.getUnreadCount = async (req, res) => {
  try {
    // countDocuments() is a lightweight query — just returns a number, no document loading
    const count = await Notification.countDocuments({
      recipient: req.user._id, // Only count notifications for this user
      isRead: false,            // Only unread ones (read ones don't affect the badge)
    });

    res.status(200).json({
      success: true,
      unreadCount: count, // This number appears on the notification bell badge
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting unread count',
    });
  }
};

// =============================================================================
// @desc    Delete single notification (Feature 15)
// @route   DELETE /api/notifications/:id
// @access  Protected
// Called when user swipes to delete a notification in NotificationsScreen
// =============================================================================

exports.deleteNotification = async (req, res) => {
  try {
    // findOneAndDelete with { _id, recipient } ensures user can only delete THEIR OWN notifications
    // Security: without the recipient check, any user could delete any notification by ID
    const result = await Notification.findOneAndDelete({
      _id: req.params.id,          // The notification to delete
      recipient: req.user._id,     // Must belong to current user (authorization check)
    });

    if (!result) {
      // Either doesn't exist OR it belongs to another user
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting notification',
    });
  }
};
