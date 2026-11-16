// =============================================================================
// REUSE RADAR - NOTIFICATION MODEL (Notification.js)
// Purpose: Stores in-app notification records for every important event that
//          a user should be informed about (request received, accepted, wishlist match, etc.)
// Features:
//   1. 9 notification types covering the full request + message + wishlist lifecycle
//   2. relatedItem and relatedRequest references for deep-linking to context
//   3. isRead flag + indexes for fast unread count queries (notification bell badge)
//   4. sender reference for showing "who triggered this notification"
// =============================================================================

// 'mongoose' is the ODM library for MongoDB
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// Each document is one notification delivered to one recipient
// =============================================================================

const notificationSchema = new mongoose.Schema(
  {
    // ── Recipient ─────────────────────────────────────────────────────────────

    recipient: {
      type: mongoose.Schema.Types.ObjectId, // The user who should see this notification
      ref: 'User',
      required: true,
      index: true, // Index for "get all notifications for user X" queries
    },

    // ── Sender (optional) ─────────────────────────────────────────────────────
    // Null for system-generated notifications (e.g., wishlist match)
    // Populated for user-action notifications (e.g., "Rajan sent you a request")

    sender: {
      type: mongoose.Schema.Types.ObjectId, // The user who triggered this notification
      ref: 'User',
      // Not required — some notifications have no specific sender (system events)
    },

    // ── Notification Type ─────────────────────────────────────────────────────
    // Drives the icon and color shown in NotificationsScreen.
    // Also used to deep-link: 'new_request' → RequestsScreen, 'new_message' → ChatScreen

    type: {
      type: String,
      enum: [
        'new_request',       // Someone sent a request for my item
        'request_accepted',  // My request was accepted by the item owner
        'request_rejected',  // My request was rejected by the item owner
        'request_cancelled', // A request on my item was cancelled by the requester
        'request_completed', // A handover was successfully completed (both sides)
        'new_message',       // Someone sent me a chat message
        'item_update',       // Status of an item I requested has changed
        'wishlist_match',    // An item matching my campus wishlist was just listed
        'borrow_returned',   // A borrowed item has been returned to me
      ],
      required: true, // Every notification must have a type
    },

    // ── Notification Content ──────────────────────────────────────────────────

    title: {
      type: String,
      required: true, // Short headline shown in the notification card (e.g., "Request Accepted!")
      trim: true,
    },

    message: {
      type: String,
      required: true, // Full message body with context (e.g., "Rajan accepted your request for Laptop")
      trim: true,
    },

    // ── Deep Link References ──────────────────────────────────────────────────
    // These optional references let the app navigate to the relevant screen
    // when the user taps the notification.

    relatedItem: {
      type: mongoose.Schema.Types.ObjectId, // Links to the specific item
      ref: 'Item', // .populate() gives full item data for the notification preview
    },

    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId, // Links to the specific request
      ref: 'Request',
    },

    // ── Read Status ───────────────────────────────────────────────────────────

    isRead: {
      type: Boolean,
      default: false, // All new notifications start as unread
      index: true,    // Needed for fast unread count queries (notification bell badge)
    },
  },
  {
    timestamps: true, // 'createdAt' tells us when the notification was generated
  }
);

// =============================================================================
// Database Indexes
// =============================================================================

// Most common query: "get all unread notifications for user X"
// Used by GET /notifications/unread-count to power the bell badge
notificationSchema.index({ recipient: 1, isRead: 1 });

// Notifications are displayed in newest-first order in NotificationsScreen
// -1 = descending order (newest at top)
notificationSchema.index({ createdAt: -1 });

// Register as the 'Notification' model in Mongoose
// Documents stored in 'notifications' MongoDB collection
module.exports = mongoose.model('Notification', notificationSchema);
