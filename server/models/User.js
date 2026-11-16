// =============================================================================
// REUSE RADAR - USER MODEL (User.js)
// Purpose: Defines the MongoDB schema (structure) for every registered student
//          on the ReUse Radar campus marketplace platform.
// Fields cover: identity, authentication, location, gamification, and push notifications.
// Features:
//   1. Email uniqueness enforcement + regex validation
//   2. Phone number required (10-digit Indian mobile)
//   3. GeoJSON location for campus proximity matching
//   4. Karma Points gamification system (starts at 50)
//   5. Expo push token for real-time notifications (Feature 16)
//   6. 2dsphere geographic index for $near queries
//   7. Admin/User role-based access control
// =============================================================================

// 'mongoose' is the ODM (Object-Document Mapper) library for MongoDB in Node.js
const mongoose = require('mongoose');

// =============================================================================
// Schema Definition
// mongoose.Schema describes the shape of documents stored in the 'users' collection
// =============================================================================

const userSchema = new mongoose.Schema(
  {
    // ── Identity Fields ──────────────────────────────────────────────────────

    name: {
      type: String,
      required: [true, 'Please provide a name'], // Validation error message if missing
      trim: true,     // Removes leading/trailing whitespace automatically
      maxlength: 60,  // Names cannot be longer than 60 characters
    },

    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,       // No two users can share the same email (MongoDB unique index)
      lowercase: true,    // Always stored in lowercase (case-insensitive login)
      trim: true,
      // Regex validation: requires format like user@domain.com
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,        // Creates a MongoDB index on email for fast lookups during login
    },

    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,       // Minimum 6 characters enforced at schema level
      // Note: Password is stored as a bcrypt hash, never plain text
    },

    // ── Authorization ────────────────────────────────────────────────────────

    role: {
      type: String,
      enum: ['user', 'admin'], // Only two allowed values; 'admin' gives moderation access
      default: 'user',         // All new registrations start as regular users
      index: true,             // Index enables fast admin-role filtering queries
    },

    isSuspended: {
      type: Boolean,
      default: false,  // Accounts start active; admin can suspend for guideline violations
      index: true,     // Indexed for efficient suspended-user lookup
    },

    suspensionReason: {
      type: String,
      default: '', // Stores the admin-provided reason (e.g., "spam listings")
    },

    // ── Contact ──────────────────────────────────────────────────────────────

    phone: {
      type: String,
      required: [true, 'Mobile number is required'], // Mandatory since the number-required feature was added
      trim: true,
      // 10-digit Indian mobile number; validated in authController before save
    },

    // ── Campus Identity ──────────────────────────────────────────────────────

    collegeName: {
      type: String,
      default: 'Campus Community', // Default shows before user fills their profile
      trim: true,
    },

    // ── Geographic Location (GeoJSON format) ─────────────────────────────────
    // MongoDB requires GeoJSON format for geospatial queries ($near, $geoWithin).
    // 'Point' is the GeoJSON type for a single latitude/longitude location.

    location: {
      type: {
        type: String,
        enum: ['Point'], // GeoJSON spec: for a single point, type must be 'Point'
        default: 'Point',
      },
      coordinates: {
        type: [Number], // Array format: [longitude, latitude] (NOTE: GeoJSON uses lng FIRST)
        default: [77.5946, 12.9716], // Default: Bengaluru coordinates (fallback if GPS unavailable)
      },
    },

    addressName: {
      type: String,
      default: 'College Campus', // Human-readable location label shown on profile
      trim: true,
    },

    // ── Academic Profile ─────────────────────────────────────────────────────

    department: {
      type: String,
      default: '', // e.g., 'Computer Science', 'Mechanical Engineering'
      trim: true,
    },

    enrollmentNumber: {
      type: String,
      default: '', // Student ID number; submitting this triggers isVerified = true
      trim: true,
    },

    // Student ID verification badge (defaults to true so dev/test accounts work immediately)
    isVerified: {
      type: Boolean,
      default: true, // Set to true when enrollmentNumber is provided in profile update
    },

    pickupLandmark: {
      type: String,
      default: '', // Directions for item handover (e.g., 'Near Main Gate Library')
      trim: true,
    },

    // ── Profile Photo ─────────────────────────────────────────────────────────

    avatar: {
      type: String,
      default: '', // Relative path stored: '/uploads/avatars/avatar-<id>-<ts>.jpg'
      // Full URL is constructed on the frontend using getImageBaseUrl() + avatar path
    },

    // ── Gamification System ───────────────────────────────────────────────────
    // Karma Points encourage active participation in the campus circular economy.

    karmaPoints: {
      type: Number,
      default: 50, // Every new user starts with 50 karma as a welcome gift
      // Points increase when user donates items or completes successful exchanges
    },

    itemsDonatedCount: {
      type: Number,
      default: 0, // Incremented each time the user donates an item (status: completed)
    },

    itemsClaimedCount: {
      type: Number,
      default: 0, // Incremented each time the user successfully claims/receives an item
    },

    // ── Favorites List ────────────────────────────────────────────────────────
    // Array of Item ObjectIds that this user has bookmarked/favorited

    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId, // Reference to the Item model
        ref: 'Item', // 'ref' enables .populate() to fetch full item details
      },
    ],

    // ── Push Notifications (Feature 16) ──────────────────────────────────────
    // Expo's push notification service requires a unique device token.
    // This token is registered when the user grants notification permission.

    expoPushToken: {
      type: String,
      default: '', // Format: 'ExponentPushToken[xxxxxx]'
      trim: true,
    },
  },
  {
    timestamps: true, // Automatically adds 'createdAt' and 'updatedAt' fields to every document
  }
);

// =============================================================================
// Database Indexes
// Indexes dramatically speed up MongoDB queries by creating sorted lookup structures.
// =============================================================================

// 2dsphere index: required for MongoDB geospatial queries ($near, $geoWithin)
// Without this, the app cannot do "find items within X km of user's GPS location"
userSchema.index({ location: '2dsphere' });

// Compound index: speeds up admin dashboard queries filtering by role AND suspension status
userSchema.index({ role: 1, isSuspended: 1 });

// Index: speeds up queries for verified students (e.g., verifiedOnly filter in Explore)
userSchema.index({ isVerified: 1 });

// Register the schema as a Mongoose model named 'User'
// Mongoose will store documents in the MongoDB collection named 'users' (auto-pluralized)
module.exports = mongoose.model('User', userSchema);
