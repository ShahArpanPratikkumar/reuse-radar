// =============================================================================
// REUSE RADAR - ITEM DATA MODEL (Item.js)
// Purpose: Defines MongoDB Mongoose Schema for all reusable items shared on campus.
// Includes geospatial 2dsphere indexing for radar distance calculations,
// listing types (free giveaway, paid sale, borrow), and full-text search.
// =============================================================================

const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    // Item Title: Short, clear headline (e.g., "Engineering Graphics Drafter")
    title: {
      type: String,
      required: [true, 'Please provide an item title'],
      trim: true,
      maxlength: 100,
    },

    // Detailed Description: Condition details, reason for giving, notes
    description: {
      type: String,
      required: [true, 'Please provide an item description'],
      maxlength: 1000,
    },

    // Category: Filterable taxonomy for campus items
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
      index: true, // B-tree index for lightning-fast category filtering
    },

    // Physical Quality Rating
    condition: {
      type: String,
      required: [true, 'Please select item condition'],
      enum: ['New', 'Like New', 'Good', 'Used'],
      index: true,
    },

    // Listing Mode:
    // 'donation' = 100% Free permanent gift (₹0)
    // 'sell'     = Paid campus sale with custom student price
    // 'borrow'   = Temporary lend with specified return days
    listingType: {
      type: String,
      enum: ['donation', 'sell', 'borrow'],
      default: 'donation',
      index: true,
    },

    // Asking price in Indian Rupees (₹) — only applied when listingType === 'sell'
    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Boolean flag indicating whether item is zero-cost (donations and borrows)
    isFree: {
      type: Boolean,
      default: true,
    },

    // Lending Duration (days) — only applied when listingType === 'borrow'
    borrowDays: {
      type: Number,
      default: 0,
    },

    // Array of stored photo paths (e.g., ["/uploads/item-12345.jpg"])
    images: {
      type: [String],
      default: [],
    },

    // Owner Reference: Foreign Key pointing to the User who posted this item
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Lifecycle Status:
    // 'available' = Currently discoverable on Radar feed
    // 'requested' = An exchange is in progress
    // 'completed' = Successfully handed over with 4-digit PIN
    status: {
      type: String,
      enum: ['available', 'requested', 'completed'],
      default: 'available',
      index: true,
    },

    // Moderation Controls: Admin can soft-hide reported or spam items
    isHidden: {
      type: Boolean,
      default: false,
      index: true,
    },
    hiddenReason: {
      type: String,
      default: '',
    },

    // GeoJSON Point: Standard spherical coordinates for location-based radar discovery
    // Format: [longitude, latitude] in degrees (GeoJSON standard ordering)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        default: [77.5946, 12.9716],
      },
    },

    // Human-readable campus landmark (e.g., "Mechanical Dept, 2nd Floor")
    addressText: {
      type: String,
      required: [true, 'Please provide an address or pickup landmark'],
      trim: true,
    },

    // View counter tracking listing popularity
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt fields
  }
);

// =============================================================================
// DATABASE PERFORMANCE INDEXES
// =============================================================================
// 1. 2dsphere Geospatial Index: Powers MongoDB $near and $geoWithin queries
//    Enables sorting items by exact distance (km/meters) from student's GPS location.
itemSchema.index({ location: '2dsphere' });

// 2. Full-Text Search Index: Enables rapid keyword search across title & description
itemSchema.index({ title: 'text', description: 'text' });

// 3. Compound Indexes: Optimizes multi-field filter queries (e.g., active Electronics within radius)
itemSchema.index({ category: 1, status: 1, isHidden: 1 });
itemSchema.index({ isHidden: 1, createdAt: -1 });
itemSchema.index({ donor: 1, isHidden: 1 });

module.exports = mongoose.model('Item', itemSchema);
