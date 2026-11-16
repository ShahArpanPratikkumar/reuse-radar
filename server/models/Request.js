// =============================================================================
// REUSE RADAR - REQUEST MODEL (Request.js)
// Purpose: Defines the MongoDB schema for item claim/exchange requests between students.
//          A Request is created when a student wants to claim, buy, or borrow an item.
// Features:
//   1. Status lifecycle: pending → accepted → completed (or rejected/cancelled)
//   2. handoverCode: 4-digit PIN generated on accept, used to verify physical handover
//   3. Borrow lifecycle: handedOverAt → dueAt (return deadline) → returnedAt
//   4. Compound indexes for fast incoming/outgoing request queries
// =============================================================================

// 'mongoose' is the ODM library for interacting with MongoDB
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// =============================================================================

const requestSchema = new mongoose.Schema(
  {
    // ── Core References ──────────────────────────────────────────────────────

    item: {
      type: mongoose.Schema.Types.ObjectId, // MongoDB ObjectId pointing to an Item document
      ref: 'Item',    // .populate('item') will fetch full item details
      required: true, // Every request must be linked to a specific item
      index: true,    // Index for fast "find all requests for this item" queries
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId, // The student who wants the item (requester)
      ref: 'User',
      required: true,
      index: true, // Index for "find my outgoing requests" queries
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId, // The student who owns the item (donor/seller)
      ref: 'User',
      required: true,
      index: true, // Index for "find incoming requests on my items" queries
    },

    // ── Message from Requester ───────────────────────────────────────────────

    message: {
      type: String,
      default: '',       // Optional message explaining why they want the item
      trim: true,
      maxlength: 500,    // Keeps messages concise (about 3-4 sentences max)
    },

    // ── Status Lifecycle ─────────────────────────────────────────────────────
    // Flow:
    //   1. 'pending'    — Request just submitted, waiting for owner's response
    //   2. 'accepted'   — Owner approved it; handoverCode PIN is generated
    //   3. 'rejected'   — Owner declined the request
    //   4. 'cancelled'  — Requester withdrew the request before acceptance
    //   5. 'completed'  — Physical handover confirmed with the 4-digit PIN

    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
      default: 'pending', // All new requests start in pending state
      index: true,        // Index enables fast status-based filtering in RequestsScreen
    },

    // ── Handover PIN (Anti-Fraud Feature) ────────────────────────────────────
    // When owner accepts a request, a 4-digit code is generated and stored here.
    // The requester must enter this code at the physical meetup to mark it 'completed'.
    // This prevents fake completion claims without an actual meeting.

    handoverCode: {
      type: String,
      default: '', // Empty until owner accepts; then set to a random 4-digit string
    },

    completedAt: {
      type: Date, // Timestamp when the handoverCode was successfully verified
    },

    // ── Borrow / Temporary Lending Lifecycle ─────────────────────────────────
    // These fields only apply to listingType='borrow' requests.

    handedOverAt: {
      type: Date, // Timestamp when the item was physically given to the borrower
    },

    dueAt: {
      type: Date, // Return deadline calculated at handover (handedOverAt + borrowDays)
      // The app shows a countdown timer to remind the borrower
    },

    returnedAt: {
      type: Date, // Timestamp when the owner confirmed the item was returned
      // Once set, the item's status goes back to 'available'
    },
  },
  {
    timestamps: true, // Automatically tracks 'createdAt' and 'updatedAt' on every document
  }
);

// =============================================================================
// Database Indexes
// Compound indexes make complex queries fast without scanning all documents.
// =============================================================================

// Prevents the same sender from submitting multiple requests for the same item
// Also enables fast "check if I already requested this item" queries
requestSchema.index({ item: 1, sender: 1, status: 1 });

// Enables fast loading of all incoming requests for an item owner
// Filtered by status (e.g., pending only vs. all)
requestSchema.index({ receiver: 1, status: 1 });

// Register this schema as the 'Request' model in Mongoose
// MongoDB will store these documents in the 'requests' collection
module.exports = mongoose.model('Request', requestSchema);
