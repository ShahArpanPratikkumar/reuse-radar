// =============================================================================
// REUSE RADAR - WISHLIST MODEL (Wishlist.js)
// Purpose: Represents a "campus request" — a student publicly posts something
//          they urgently need (e.g., "Need a calculator for exams").
//          When a matching item is listed by another student, the platform
//          automatically notifies the requester (wishlist_match notification).
// Features:
//   1. Category-based matching with the Item model's category enum
//   2. Urgency levels: 'High' or 'Medium' (shown with priority badge in UI)
//   3. Status lifecycle: active → matched → fulfilled
//   4. matchedItem reference for tracking which item fulfilled the request
//   5. Indexes for fast feed queries and my-requests lookups
// =============================================================================

// 'mongoose' is the ODM library for MongoDB
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// Campus Wishlist / Request Item — a student posts something they urgently need,
// and the platform notifies them when a matching listing is published.
// =============================================================================

const wishlistSchema = new mongoose.Schema(
  {
    // ── Who Needs It ──────────────────────────────────────────────────────────

    requester: {
      type: mongoose.Schema.Types.ObjectId, // The student who posted this need
      ref: 'User',
      required: true,
      index: true, // Index for "show my campus requests" queries
    },

    // ── What They Need ────────────────────────────────────────────────────────

    title: {
      type: String,
      required: [true, 'Please describe the item you need'],
      trim: true,
      maxlength: 100, // Keep titles concise (e.g., "HP scientific calculator")
    },

    // Category must match the Item model's category enum for matching to work
    category: {
      type: String,
      required: [true, 'Please select a category'],
      enum: [
        'Books',
        'Electronics',
        'Furniture',
        'Clothes',
        'Bags',
        'Cycles',
        'Study Material',
        'Toys',
        'Household',
        'Other',
      ],
      index: true, // Index for category-based matching queries
    },

    // ── Urgency Level ─────────────────────────────────────────────────────────
    // 'High' items are shown with a red badge to encourage faster donations

    urgency: {
      type: String,
      enum: ['High', 'Medium'],
      default: 'Medium',
      index: true, // Index enables sorting by urgency in the campus feed
    },

    description: {
      type: String,
      required: [true, 'Please add a short description'],
      trim: true,
      maxlength: 500, // Additional context (e.g., "Need it before Monday's exam")
    },

    // ── Status Lifecycle ──────────────────────────────────────────────────────
    // Flow:
    //   'active'    — Need is still unmet; shown in campus request feed
    //   'matched'   — A matching item was found; notification sent to requester
    //   'fulfilled' — Requester confirmed their need was met (closes the request)

    status: {
      type: String,
      enum: ['active', 'matched', 'fulfilled'],
      default: 'active', // All new requests are shown publicly as active
      index: true,       // Index for filtering active-only requests in the feed
    },

    // ── Matched Item Reference ────────────────────────────────────────────────
    // Set automatically when itemController finds a matching listing

    matchedItem: {
      type: mongoose.Schema.Types.ObjectId, // The item that matched this wishlist request
      ref: 'Item', // .populate('matchedItem') gives the matched item's details
      // Optional: only populated after a match is found
    },
  },
  { timestamps: true } // 'createdAt' shows how long ago the need was posted
);

// =============================================================================
// Database Indexes
// =============================================================================

// Campus feed primary sort: show active requests, newest first
wishlistSchema.index({ status: 1, createdAt: -1 });

// "My Requests" screen: load all requests posted by me, by status
wishlistSchema.index({ requester: 1, status: 1 });

// Register as the 'Wishlist' model in Mongoose
// Documents stored in 'wishlists' MongoDB collection
module.exports = mongoose.model('Wishlist', wishlistSchema);
