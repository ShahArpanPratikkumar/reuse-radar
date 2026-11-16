// =============================================================================
// REUSE RADAR - MESSAGE MODEL (Message.js)
// Purpose: Stores individual chat messages exchanged between a donor and a requester
//          about a specific item listing.
// Features:
//   1. Item-scoped conversations (messages are always linked to a specific item)
//   2. isRead flag to track unread messages (drives unread badge in MessagesListScreen)
//   3. readAt timestamp for delivery receipt UI
//   4. Compound indexes for fast conversation loading and unread count queries
// =============================================================================

// 'mongoose' is the ODM library for MongoDB
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// Each document in the 'messages' collection represents ONE chat message
// =============================================================================

const messageSchema = new mongoose.Schema(
  {
    // ── Item Reference ───────────────────────────────────────────────────────
    // Chat conversations in ReUse Radar are always about a specific item.
    // This design means two users can have DIFFERENT conversations about DIFFERENT items.

    item: {
      type: mongoose.Schema.Types.ObjectId, // Points to the Item being discussed
      ref: 'Item',    // .populate('item') fetches item title/image for the chat header
      required: true,
      index: true,    // Needed to query "all messages for item X between user A and B"
    },

    // ── Participants ─────────────────────────────────────────────────────────

    sender: {
      type: mongoose.Schema.Types.ObjectId, // Who sent this message
      ref: 'User',
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId, // Who should receive/read this message
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Message Content ───────────────────────────────────────────────────────

    text: {
      type: String,
      required: true,  // A message cannot be empty
      trim: true,      // Strip whitespace before saving
      maxlength: 1000, // Approximately 5–8 sentences; prevents excessively long messages
    },

    // ── Read Status ───────────────────────────────────────────────────────────
    // Used to show unread badges in the Messages tab and MessagesListScreen.

    isRead: {
      type: Boolean,
      default: false, // All messages start as unread when sent
      index: true,    // Index for fast "count unread messages for user X" queries
    },

    readAt: {
      type: Date,
      default: null, // Set to current timestamp when the receiver opens the conversation
    },
  },
  {
    timestamps: true, // Adds 'createdAt' (message sent time) and 'updatedAt' automatically
  }
);

// =============================================================================
// Database Indexes
// These make the most common chat queries fast even with thousands of messages.
// =============================================================================

// Primary conversation query index:
// "Get all messages for item X between sender A and receiver B"
// Used by GET /messages/:itemId/:otherUserId
messageSchema.index({ item: 1, sender: 1, receiver: 1 });

// Time-ordered display index:
// Messages are shown in chronological order in ChatScreen
messageSchema.index({ createdAt: 1 });

// Unread count index:
// "How many unread messages does user X have?" — drives the notification badge
messageSchema.index({ receiver: 1, isRead: 1 });

// Register the schema as the 'Message' model in Mongoose
// Documents stored in 'messages' MongoDB collection
module.exports = mongoose.model('Message', messageSchema);
