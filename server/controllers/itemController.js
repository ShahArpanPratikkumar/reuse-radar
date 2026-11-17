// =============================================================================
// REUSE RADAR - ITEM CONTROLLER (server/controllers/itemController.js)
// Purpose: Core controller handling reusable item lifecycle on campus.
// Capabilities:
//   1. Listing creation with Multer multi-image upload & geospatial GeoJSON
//   2. Automatic campus wishlist matching & instant push notifications
//   3. Advanced item search, category/condition filtering & pagination
//   4. MongoDB 2dsphere $near geospatial radius discovery with Haversine fallback
//   5. Item details with privacy-conscious donor contact redaction/disclosure
//   6. User inventory retrieval, editing, deletion, and status toggling
//   7. Karma reward point allocation upon creating donations (+10 Karma)
// =============================================================================

// Import the Item Mongoose model (MongoDB schema for items, tags, geo-location, images)
const Item = require('../models/Item');

// Import the User Mongoose model (user profile, karma points, verified badges)
const User = require('../models/User');

// Import the Request Mongoose model (item claim requests, statuses, handover codes)
const Request = require('../models/Request');

// Import the Wishlist Mongoose model (wanted item alerts posted by students)
const Wishlist = require('../models/Wishlist');

// Import the Notification Mongoose model (in-app notifications for matches/claims)
const Notification = require('../models/Notification');

// Import push notifier utility for Expo push notifications to mobile devices
const { sendPushNotification } = require('../utils/pushNotifier');

// =============================================================================
// FIELD PROJECTION CONSTANTS (PRIVACY PROTECTION)
// =============================================================================

// Standard public donor fields: Deliberately EXCLUDES phone number for privacy
// Students browsing public listings can only see basic identity details.
const DONOR_FIELDS =
  'name email avatar karmaPoints collegeName department isVerified enrollmentNumber';

// Extended donor fields: Includes phone number. ONLY shared with a student who
// already has an active (pending / accepted / completed) exchange request with donor.
const DONOR_CONTACT_FIELDS = `${DONOR_FIELDS} phone`;

// =============================================================================
// HELPER: APPLY VERIFIED STUDENT FILTER
// =============================================================================

/**
 * Filter items to only show listings from verified students (if requested)
 * @param {Object} query - The Mongoose query object
 * @param {string|boolean} verifiedOnly - Flag indicating if filter is active
 * @returns {Promise<Object>} Updated query object
 */
const applyVerifiedFilter = async (query, verifiedOnly) => {
  // If the verified filter is not requested, return query unmodified
  if (String(verifiedOnly) !== 'true') return query;

  // Query MongoDB for all users who have isVerified: true, selecting only their _id
  const verifiedIds = await User.find({ isVerified: true }).select('_id').lean();

  // Extract array of ObjectId strings
  const ids = verifiedIds.map((u) => u._id);

  // If a specific donor was already part of the query, intersect with verified IDs
  if (query.donor && typeof query.donor === 'string') {
    query.donor = { $in: ids.filter((id) => String(id) === String(query.donor)) };
  } else {
    // Otherwise restrict donor field to any verified student ID
    query.donor = { $in: ids };
  }

  return query;
};

// =============================================================================
// HELPER: CAMPUS WISHLIST MATCHING & NOTIFICATION TRIGGER
// =============================================================================

/**
 * Scans active campus wishlist requests to notify students when an item
 * matching their requested keywords or category is newly listed.
 * @param {Object} item - Newly created Item document
 */
const notifyMatchingWishlists = async (item) => {
  try {
    // Find all active wishlist requests where requester is NOT the donor themselves
    const activeWishlists = await Wishlist.find({
      status: 'active',
      requester: { $ne: item.donor },
    }).populate('requester', 'name expoPushToken'); // Populate requester name & push token

    // If no active wishlists in database, exit early
    if (!activeWishlists.length) return;

    // Normalize new item title to lowercase for keyword matching
    const itemTitle = String(item.title || '').toLowerCase();

    // Extract search keywords with length >= 4 characters, splitting on non-alphanumeric chars
    const keywords = itemTitle.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);

    // Iterate over active wishlist entries
    for (const wishlist of activeWishlists) {
      // Normalize wishlist title to lowercase
      const wishlistTitle = String(wishlist.title || '').toLowerCase();

      // Check for exact category match
      const categoryMatch = wishlist.category && wishlist.category === item.category;

      // Check for title keyword match (any keyword matches wishlist, or full title substring)
      const titleMatch =
        keywords.some((word) => wishlistTitle.includes(word)) ||
        (wishlistTitle.length >= 4 && itemTitle.includes(wishlistTitle));

      // If neither category nor title match, skip this wishlist item
      if (!categoryMatch && !titleMatch) continue;

      // Create an in-app Notification record in MongoDB for the requester
      await Notification.create({
        recipient: wishlist.requester._id, // User who requested the item
        sender: item.donor,               // Donor who listed the item
        type: 'wishlist_match',           // Notification categorization
        title: 'Wishlist Match Found! 🎉',
        message: `Good news! An item matching your wishlist was just posted: "${item.title}"`,
        relatedItem: item._id,             // Reference to the newly posted item
      });

      // If the requester has an Expo Push Notification token registered on device, send push
      if (wishlist.requester.expoPushToken) {
        sendPushNotification(
          wishlist.requester.expoPushToken,
          'Wishlist Match Found! 🎉',
          'Good news! An item matching your wishlist was just posted.',
          { itemId: item._id }
        );
      }

      // Mark wishlist status as 'matched' to avoid redundant duplicate notifications
      wishlist.status = 'matched';
      wishlist.matchedItem = item._id; // Store link to the matching item
      await wishlist.save();
    }
  } catch (error) {
    // Log any wishlist matching errors to console without failing the listing creation
    console.error('[Wishlist Match Error]', error.message);
  }
};

// =============================================================================
// CREATE NEW ITEM LISTING (POST /api/items)
// =============================================================================

/**
 * @desc    Create a new reusable item listing with images & location
 * @route   POST /api/items
 * @access  Protected (Requires Bearer JWT token)
 */
exports.createItem = async (req, res) => {
  try {
    // Destructure required and optional fields from incoming HTTP request body
    const {
      title,
      description,
      category,
      condition,
      addressText,
      coordinates,
      imageBase64List,
      longitude,
      latitude,
      listingType,
      borrowDays,
      price,
    } = req.body;

    // Validate required fields
    if (!title || !description || !category || !condition || !addressText) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, category, condition, and address are required',
      });
    }

    // Process image paths from Multer multipart upload or fallback JSON fields
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
      // Multer disk storage: map each uploaded file to public URL path
      imagePaths = req.files.map((file) => `/uploads/${file.filename}`);
    } else if (req.body.images) {
      // Legacy JSON images array
      imagePaths = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    } else if (imageBase64List && Array.isArray(imageBase64List)) {
      // Direct base64 image strings
      imagePaths = imageBase64List;
    }

    // Default eco-friendly placeholder image if no images provided
    if (imagePaths.length === 0) {
      imagePaths = ['https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80'];
    }

    // Normalize listing type: 'donation', 'sell', or 'borrow'
    const normalizedListingType = ['sell', 'borrow'].includes(listingType)
      ? listingType
      : 'donation';

    // Parse numeric price for student sale listings
    const parsedPrice = Number(price);

    // Enforce paid marketplace validation: if listing is 'sell', price must be > 0
    if (
      normalizedListingType === 'sell' &&
      (!Number.isFinite(parsedPrice) || parsedPrice <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'A selling price greater than 0 is required for paid listings',
      });
    }

    // Parse geospatial coordinates [longitude, latitude] (GeoJSON standard format)
    let parsedCoords = [72.5714, 23.0225]; // Default Ahmedabad Campus coordinates
    if (longitude && latitude && !isNaN(parseFloat(longitude)) && !isNaN(parseFloat(latitude))) {
      parsedCoords = [parseFloat(longitude), parseFloat(latitude)];
    } else if (coordinates) {
      if (typeof coordinates === 'string') {
        try {
          // Attempt to parse JSON stringified coordinates array
          parsedCoords = JSON.parse(coordinates);
        } catch (e) {
          // Fallback: parse comma-separated string "longitude,latitude"
          const parts = coordinates.split(',').map((n) => parseFloat(n.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            parsedCoords = parts;
          }
        }
      } else if (Array.isArray(coordinates) && coordinates.length === 2) {
        parsedCoords = [Number(coordinates[0]), Number(coordinates[1])];
      }
    }

    // Create and save new Item document in MongoDB
    const item = await Item.create({
      title: title.trim(),
      description: description.trim(),
      category,
      condition,
      images: imagePaths,
      donor: req.user._id, // Authenticated student ID from authMiddleware
      addressText: addressText.trim(),
      listingType: normalizedListingType,
      price: normalizedListingType === 'sell' ? Math.round(parsedPrice) : 0,
      isFree: normalizedListingType !== 'sell',
      borrowDays: normalizedListingType === 'borrow' ? Math.max(1, parseInt(borrowDays, 10) || 7) : 0,
      location: {
        type: 'Point',
        coordinates: parsedCoords, // [lng, lat]
      },
    });

    // Reward student with 10 Karma Points for contributing an item to campus community
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { karmaPoints: 10, itemsDonatedCount: 0 },
    });

    // Trigger campus wishlist notification scanner
    await notifyMatchingWishlists(item);

    // Return HTTP 201 Created with saved item data
    res.status(201).json({
      success: true,
      message: 'Item listed successfully',
      item,
    });
  } catch (error) {
    console.error('[CreateItem Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating item listing',
    });
  }
};

// =============================================================================
// GET ALL ITEMS WITH SEARCH, FILTER, AND PAGINATION (GET /api/items)
// =============================================================================

/**
 * @desc    Get all items with advanced search, filter, and sort
 * @route   GET /api/items
 * @access  Public
 */
exports.getItems = async (req, res) => {
  try {
    // Extract query parameters with sensible default values
    const {
      search,
      category,
      condition,
      status = 'available',
      sort = 'Newest',
      page = 1,
      limit = 20,
      donor,
      verifiedOnly,
      listingType,
    } = req.query;

    // Filter out moderation-hidden items by default
    const query = { isHidden: { $ne: true } };

    // Availability status filter (available, requested, completed)
    if (status && status !== 'all') {
      query.status = status;
    }

    // Category filter (Books, Electronics, Furniture, etc.)
    if (category && category !== 'All') {
      query.category = category;
    }

    // Condition filter (New, Like New, Good, Fair)
    if (condition && condition !== 'All') {
      query.condition = condition;
    }

    // Specific donor filter
    if (donor) {
      query.donor = donor;
    }

    // Listing type filter (donation, sell, borrow)
    if (listingType && listingType !== 'All') {
      query.listingType = listingType;
    }

    // Apply verified students filter if requested
    await applyVerifiedFilter(query, verifiedOnly);

    // Full text regex search across title, description, category, and address
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i'); // Case-insensitive regex
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { addressText: searchRegex },
      ];
    }

    // Configure sort order
    let sortOption = { createdAt: -1 }; // Default: Newest first
    if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'Recently Updated') {
      sortOption = { updatedAt: -1 };
    }

    // Pagination calculations
    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNumber - 1) * pageSize;

    // Count total matching items for pagination metadata
    const total = await Item.countDocuments(query);

    // Query MongoDB with population, sorting, skipping, and limiting
    const items = await Item.find(query)
      .populate('donor', DONOR_FIELDS) // Populate public donor profile
      .sort(sortOption)
      .skip(skip)
      .limit(pageSize)
      .lean(); // Return plain JS objects for higher performance

    // Return HTTP 200 OK with items and pagination details
    res.status(200).json({
      success: true,
      total,
      page: pageNumber,
      pages: Math.ceil(total / pageSize),
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('[GetItems Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching items',
    });
  }
};

// =============================================================================
// HAVERSINE DISTANCE FORMULA (MATHEMATICAL RADIAL COMPUTATION)
// =============================================================================

/**
 * Helper to calculate great-circle Haversine distance in kilometers between two GPS points
 * @param {number} lat1 - Latitude of user
 * @param {number} lon1 - Longitude of user
 * @param {number} lat2 - Latitude of item
 * @param {number} lon2 - Longitude of item
 * @returns {number} Distance in kilometers
 */
const calculateHaversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's mean radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180; // Delta latitude in radians
  const dLon = ((lon2 - lon1) * Math.PI) / 180; // Delta longitude in radians
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// =============================================================================
// GET NEARBY ITEMS USING MONGODB 2DSPHERE $near (GET /api/items/nearby)
// =============================================================================

/**
 * @desc    Get nearby items within radius using MongoDB $near with fallback
 * @route   GET /api/items/nearby
 * @access  Public
 */
exports.getNearbyItems = async (req, res) => {
  try {
    // Extract query parameters for geospatial discovery
    const {
      lat,
      lng,
      radiusKm = 10,
      category,
      condition,
      search,
      status = 'available',
      verifiedOnly,
    } = req.query;

    // Filter out moderation-hidden items
    const query = { isHidden: { $ne: true } };

    // Availability status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // Condition filter
    if (condition && condition !== 'All') {
      query.condition = condition;
    }

    // Search query filter
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
        { addressText: searchRegex },
      ];
    }

    // Apply verified students filter if requested
    await applyVerifiedFilter(query, verifiedOnly);

    // Parse numeric coordinates and radius
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const parsedRadiusKm = parseFloat(radiusKm) || 10;

    let items = [];

    // If valid GPS coordinates are supplied, perform geospatial search
    if (!isNaN(latitude) && !isNaN(longitude)) {
      const radiusInMeters = parsedRadiusKm * 1000; // Convert km to meters for MongoDB
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude], // GeoJSON format: [longitude, latitude]
          },
          $maxDistance: radiusInMeters,
        },
      };

      try {
        // Query MongoDB using 2dsphere index
        items = await Item.find(query)
          .populate('donor', DONOR_FIELDS)
          .limit(50)
          .lean();
      } catch (nearErr) {
        // Fallback: If 2dsphere index fails or is rebuilding, filter in memory
        console.warn('[GetNearbyItems $near fallback]', nearErr.message);
        delete query.location;
        const allCandidates = await Item.find(query)
          .populate('donor', DONOR_FIELDS)
          .limit(100)
          .lean();

        // Filter items within radius using mathematical Haversine formula
        items = allCandidates.filter((it) => {
          if (
            it.location &&
            Array.isArray(it.location.coordinates) &&
            it.location.coordinates.length === 2
          ) {
            const dist = calculateHaversineKm(
              latitude,
              longitude,
              it.location.coordinates[1],
              it.location.coordinates[0]
            );
            return dist <= parsedRadiusKm;
          }
          return false;
        });
      }
    } else {
      // If GPS not provided, return latest items sorted by creation date
      items = await Item.find(query)
        .populate('donor', DONOR_FIELDS)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    }

    // Attach exact distanceKm and user-friendly distanceText (e.g. "0.8 km", "2.3 km")
    const itemsWithDistance = items.map((item) => {
      let distanceKm = null;
      let distanceText = null;

      if (
        !isNaN(latitude) &&
        !isNaN(longitude) &&
        item.location &&
        Array.isArray(item.location.coordinates) &&
        item.location.coordinates.length === 2
      ) {
        const itemLng = item.location.coordinates[0];
        const itemLat = item.location.coordinates[1];
        if (!isNaN(itemLat) && !isNaN(itemLng)) {
          const dist = calculateHaversineKm(latitude, longitude, itemLat, itemLng);
          distanceKm = parseFloat(dist.toFixed(2));
          distanceText = `${dist.toFixed(1)} km`;
        }
      }

      return {
        ...item,
        distanceKm,
        distanceText,
      };
    });

    // Ensure items are strictly sorted from closest to farthest
    if (!isNaN(latitude) && !isNaN(longitude)) {
      itemsWithDistance.sort((a, b) => {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    // Return HTTP 200 OK with radar-discovered items
    res.status(200).json({
      success: true,
      count: itemsWithDistance.length,
      items: itemsWithDistance,
    });
  } catch (error) {
    console.error('[GetNearbyItems Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching nearby items',
    });
  }
};

// =============================================================================
// GET SINGLE ITEM BY ID (GET /api/items/:id)
// =============================================================================

/**
 * @desc    Get detailed item data with privacy protection for contact info
 * @route   GET /api/items/:id
 * @access  Public (Optional auth for contact unlocking)
 */
exports.getItemById = async (req, res) => {
  try {
    // Privacy guard: Contact numbers and private details are unlocked ONLY if
    // an active exchange request exists between current student and donor.
    const activeRequest = req.user
      ? await Request.findOne({
          item: req.params.id,
          status: { $in: ['pending', 'accepted', 'completed'] },
          $or: [{ sender: req.user._id }, { receiver: req.user._id }],
        })
          .select('_id status')
          .lean()
      : null;

    // Populate donor details: If active request exists, unlock phone number; else redact it
    const item = await Item.findById(req.params.id).populate(
      'donor',
      `${activeRequest ? DONOR_CONTACT_FIELDS : DONOR_FIELDS} addressName`
    );

    // If item does not exist, return 404 Not Found
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    // Hide moderation-flagged items from regular visitors
    if (item.isHidden) {
      const isDonor = req.user && item.donor && item.donor._id.equals(req.user._id);
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isDonor && !isAdmin) {
        return res.status(404).json({
          success: false,
          message: 'This item is currently under moderation review.',
        });
      }
    }

    // Increment item view counter asynchronously in background
    Item.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    // Return HTTP 200 OK with populated item details
    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('[GetItemById Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching item details',
    });
  }
};

// =============================================================================
// GET LOGGED-IN USER'S ITEMS (GET /api/items/user/my-items)
// =============================================================================

/**
 * @desc    Get items created by the logged-in student
 * @route   GET /api/items/user/my-items
 * @access  Protected
 */
exports.getMyItems = async (req, res) => {
  try {
    // Find all items where donor matches authenticated user ID
    const items = await Item.find({ donor: req.user._id })
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Return HTTP 200 OK with list of user's uploaded items
    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('[GetMyItems Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching your items',
    });
  }
};

// =============================================================================
// UPDATE ITEM LISTING (PUT /api/items/:id)
// =============================================================================

/**
 * @desc    Update existing item listing details, photos, or pricing
 * @route   PUT /api/items/:id
 * @access  Protected (Donor only)
 */
exports.updateItem = async (req, res) => {
  try {
    // Find target item by MongoDB _id
    const item = await Item.findById(req.params.id);

    // Check if item exists
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Ownership check: Verify that requesting user is the original listing donor
    if (!item.donor.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this item',
      });
    }

    // Destructure editable fields from request body
    const {
      title,
      description,
      category,
      condition,
      status,
      addressText,
      coordinates,
      longitude,
      latitude,
      listingType,
      borrowDays,
      price,
    } = req.body;

    // Apply updates if values were provided
    if (title) item.title = title.trim();
    if (description) item.description = description.trim();
    if (category) item.category = category;
    if (condition) item.condition = condition;
    if (status) item.status = status;
    if (addressText) item.addressText = addressText.trim();

    // Listing type handling
    if (listingType) {
      item.listingType = ['sell', 'borrow'].includes(listingType) ? listingType : 'donation';
      item.borrowDays =
        item.listingType === 'borrow' ? Math.max(1, parseInt(borrowDays, 10) || 7) : 0;
    }

    // Paid marketplace pricing validation
    if (item.listingType === 'sell') {
      const parsedPrice = Number(price !== undefined ? price : item.price);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: 'A selling price greater than 0 is required for paid listings',
        });
      }
      item.price = Math.round(parsedPrice);
      item.isFree = false;
    } else if (listingType || price !== undefined || item.isFree === undefined) {
      item.price = 0;
      item.isFree = true;
    }

    // Merge kept photos (existingImages) with newly uploaded Multer files (up to max 5)
    const rawExistingImages = req.body.existingImages;
    let keptImages = [];
    if (rawExistingImages !== undefined) {
      if (Array.isArray(rawExistingImages)) {
        keptImages = rawExistingImages;
      } else {
        try {
          const parsed = JSON.parse(rawExistingImages);
          keptImages = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          keptImages = [];
        }
      }
    }
    keptImages = keptImages.filter(
      (path) => typeof path === 'string' && path.startsWith('/uploads/')
    );

    // If new files were uploaded via Multer, merge with preserved existing images
    if ((req.files && req.files.length > 0) || rawExistingImages !== undefined) {
      const uploadedImages = req.files
        ? req.files.map((file) => `/uploads/${file.filename}`)
        : [];
      item.images = [...keptImages, ...uploadedImages].slice(0, 5);
    } else if (req.body.images) {
      item.images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    }

    // Handle coordinates update
    if (longitude && latitude && !isNaN(parseFloat(longitude)) && !isNaN(parseFloat(latitude))) {
      item.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    } else if (coordinates) {
      let parsedCoords;
      if (typeof coordinates === 'string') {
        try {
          parsedCoords = JSON.parse(coordinates);
        } catch (e) {
          const parts = coordinates.split(',').map((n) => parseFloat(n.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            parsedCoords = parts;
          }
        }
      } else if (Array.isArray(coordinates) && coordinates.length === 2) {
        parsedCoords = [Number(coordinates[0]), Number(coordinates[1])];
      }
      if (parsedCoords) {
        item.location = {
          type: 'Point',
          coordinates: parsedCoords,
        };
      }
    }

    // Save updated item in MongoDB
    await item.save();

    // Return HTTP 200 OK with updated item data
    res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      item,
    });
  } catch (error) {
    console.error('[UpdateItem Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating item',
    });
  }
};

// =============================================================================
// DELETE ITEM LISTING (DELETE /api/items/:id)
// =============================================================================

/**
 * @desc    Delete item listing and cancel any pending claim requests
 * @route   DELETE /api/items/:id
 * @access  Protected (Donor only)
 */
exports.deleteItem = async (req, res) => {
  try {
    // Find target item
    const item = await Item.findById(req.params.id);

    // Check if item exists
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Ownership check: Verify requester is the owner of the item
    if (!item.donor.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this item',
      });
    }

    // Delete item document from MongoDB
    await Item.findByIdAndDelete(req.params.id);

    // Cancel all open pending requests for this deleted item
    await Request.updateMany(
      { item: req.params.id, status: 'pending' },
      { status: 'cancelled' }
    );

    // Return HTTP 200 OK confirmation
    res.status(200).json({
      success: true,
      message: 'Item deleted successfully',
    });
  } catch (error) {
    console.error('[DeleteItem Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error deleting item',
    });
  }
};

// =============================================================================
// TOGGLE ITEM STATUS (PATCH /api/items/:id/toggle-status)
// =============================================================================

/**
 * @desc    Quickly toggle item availability (available <-> completed)
 * @route   PATCH /api/items/:id/toggle-status
 * @access  Protected (Donor only)
 */
exports.toggleItemStatus = async (req, res) => {
  try {
    // Find target item
    const item = await Item.findById(req.params.id);

    // Check if item exists
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Ownership check: Verify requester is the owner of the item
    if (!item.donor.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this item status',
      });
    }

    // Update status based on body param or toggle between available and completed
    const { status } = req.body;
    if (status && ['available', 'requested', 'completed'].includes(status)) {
      item.status = status;
    } else {
      item.status = item.status === 'available' ? 'completed' : 'available';
    }

    // Save changes
    await item.save();

    // Return HTTP 200 OK with new status
    res.status(200).json({
      success: true,
      message: `Item status updated to ${item.status}`,
      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error changing status',
    });
  }
};
