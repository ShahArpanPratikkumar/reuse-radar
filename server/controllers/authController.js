// =============================================================================
// REUSE RADAR - AUTH CONTROLLER (authController.js)
// Purpose: Handles all user authentication and profile management operations.
//          Register, login, profile view/update, push token sync, public profiles.
// Routes handled:
//   POST /api/auth/register        — Create new student account
//   POST /api/auth/login           — Authenticate and get JWT token
//   GET  /api/auth/me              — Get current user's profile + eco impact stats
//   PUT  /api/auth/profile         — Update profile (name, phone, avatar, location)
//   PUT  /api/auth/push-token      — Sync Expo push notification token
//   GET  /api/auth/users/:id/public-profile — View another student's trust profile
// =============================================================================

// 'mongoose' needed for ObjectId validation in getPublicProfile
const mongoose = require('mongoose');

// 'bcryptjs' provides password hashing (never store plain-text passwords)
const bcrypt = require('bcryptjs');

// 'jsonwebtoken' creates and verifies JWT tokens for session management
const jwt = require('jsonwebtoken');

// Import all relevant models
const User = require('../models/User');       // User accounts
const Item = require('../models/Item');       // Item listings (for stats)
const Request = require('../models/Request'); // Exchange requests (for stats)
const Report = require('../models/Report');   // Fraud reports (for trust score)

// =============================================================================
// Helper: Generate JWT Token
// Called after successful register or login to issue a session token.
// The token encodes the user's _id and expires after 7 days.
// =============================================================================

const generateToken = (id) => {
  return jwt.sign(
    { id }, // Payload: embeds the user's MongoDB _id inside the token
    process.env.JWT_SECRET || 'reuseradar_super_secret_jwt_key_2026', // Secret key from .env
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } // Token expires in 7 days
  );
};

// =============================================================================
// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public (no token required — anyone can register)
// Flow: validate inputs → check duplicates → hash password → save user → return JWT
// =============================================================================

exports.register = async (req, res) => {
  try {
    // Destructure required fields from the request body sent by RegisterScreen
    const { name, email, password, phone, collegeName, addressName, coordinates } = req.body;

    // Basic required field validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Password length check (also enforced in schema, but explicit error message helps UX)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    // Phone validation: strip non-digits, then check for valid Indian mobile number
    // \D matches any non-digit character; replace removes them
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    // Regex: starts with 6, 7, 8, or 9 (Indian mobile), followed by 9 more digits (total 10 digits)
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid 10-digit mobile number is required',
      });
    }

    // Check if a user with this email already exists (email is unique in schema)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // Hash the password before storing it in the database
    // bcrypt.genSalt(10) generates a "salt" with 10 rounds of work (higher = more secure but slower)
    const salt = await bcrypt.genSalt(10);
    // bcrypt.hash() combines the plain password + salt to produce a secure hash
    const hashedPassword = await bcrypt.hash(password, salt);

    // Build the GeoJSON location object from coordinates sent by the app
    const userLocation = {
      type: 'Point', // GeoJSON requires this exact string for point geometry
      // If coordinates array [lng, lat] was provided, use it; otherwise use Bengaluru as default
      coordinates: Array.isArray(coordinates) && coordinates.length === 2
        ? coordinates
        : [77.5946, 12.9716], // Bengaluru default: longitude first (GeoJSON standard)
    };

    // Create and save the user document in MongoDB
    const user = await User.create({
      name,
      email: email.toLowerCase(), // Always store email in lowercase
      password: hashedPassword,   // Store the bcrypt hash, never the plain password
      phone: cleanPhone,          // Store the sanitized 10-digit number
      collegeName: collegeName || 'Campus Community', // Default if not provided
      addressName: addressName || 'College Campus',
      location: userLocation,
      karmaPoints: 50, // Welcome gift karma points — every new user starts with 50
    });

    // Generate a JWT token for this new user
    const token = generateToken(user._id);

    // Return 201 Created with token + user profile data
    // Note: password field is excluded manually from the response
    res.status(201).json({
      success: true,
      token, // JWT token the mobile app stores in AsyncStorage
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        isSuspended: user.isSuspended || false,
        phone: user.phone,
        collegeName: user.collegeName,
        addressName: user.addressName,
        location: user.location,
        avatar: user.avatar,
        karmaPoints: user.karmaPoints,
        itemsDonatedCount: user.itemsDonatedCount,
        itemsClaimedCount: user.itemsClaimedCount,
        department: user.department || '',
        enrollmentNumber: user.enrollmentNumber || '',
        isVerified: Boolean(user.isVerified),
        favorites: user.favorites || [],
      },
    });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
    });
  }
};

// =============================================================================
// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Flow: find user by email → verify password → return JWT
// =============================================================================

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Both fields must be present
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    // Find user by lowercase email (we always store email in lowercase)
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Generic message — don't reveal whether email or password is wrong (security)
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // bcrypt.compare() checks if plain password matches the stored hash
    // This is a timing-safe comparison that prevents brute-force timing attacks
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Password matched — generate and return a JWT
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        isSuspended: user.isSuspended || false,
        phone: user.phone,
        collegeName: user.collegeName,
        addressName: user.addressName,
        location: user.location,
        avatar: user.avatar,
        karmaPoints: user.karmaPoints,
        itemsDonatedCount: user.itemsDonatedCount,
        itemsClaimedCount: user.itemsClaimedCount,
        department: user.department || '',
        enrollmentNumber: user.enrollmentNumber || '',
        isVerified: Boolean(user.isVerified),
        favorites: user.favorites || [],
      },
    });
  } catch (error) {
    console.error('[Login Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login',
    });
  }
};

// =============================================================================
// Green Campus Impact Constants
// Used by buildProfilePayload() to calculate circular economy environmental stats.
// =============================================================================

const MONEY_SAVED_PER_CLAIM = 450;    // Average ₹450 saved per claimed/donated item
const CO2_KG_PER_ITEM = 2.5;         // Every reused item saves ~2.5 kg CO2 from manufacturing
const CO2_KG_PER_TREE_YEAR = 21;     // A mature tree absorbs ~21 kg CO2 per year (reference value)

// =============================================================================
// Helper: buildProfilePayload
// Runs 5 MongoDB count queries IN PARALLEL using Promise.all() (fast — no sequential waits).
// Calculates circular economy impact metrics for the Green Campus Impact Tracker.
// Called by both getMe() and updateProfile() to avoid duplicate logic.
// =============================================================================

exports.buildProfilePayload = async (user) => {
  // Run all count queries simultaneously with Promise.all()
  // This is much faster than 5 sequential await calls
  const [
    listingsCount,       // Total items this user has ever listed
    successfulReuses,    // Items they listed that were successfully completed
    pendingRequests,     // Incoming requests waiting for their response
    completedExchanges,  // Exchanges completed either as sender or receiver
    completedClaims,     // Times this user successfully received an item
  ] = await Promise.all([
    Item.countDocuments({ donor: user._id }),                                   // All my listings
    Item.countDocuments({ donor: user._id, status: 'completed' }),              // My donations completed
    Request.countDocuments({ receiver: user._id, status: 'pending' }),          // Incoming pending
    Request.countDocuments({
      $or: [
        { sender: user._id, status: 'completed' },   // I sent and completed
        { receiver: user._id, status: 'completed' },  // I received and completed
      ],
    }),
    Request.countDocuments({ receiver: user._id, status: 'completed' }),        // I gave away completed
  ]);

  // Convert Mongoose document to plain JS object so we can delete password
  const base = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete base.password; // Never expose password hash in profile responses

  // Count how many items are saved/bookmarked
  const favoritesCount = Array.isArray(base.favorites) ? base.favorites.length : 0;

  // Use the higher of stored count vs. live database count (keeps stats accurate)
  const itemsDonatedCount = Math.max(base.itemsDonatedCount || 0, successfulReuses);
  const itemsClaimedCount = Math.max(base.itemsClaimedCount || 0, completedClaims);

  // Total items reused = donated + claimed (circular economy contribution)
  const totalReused = itemsDonatedCount + itemsClaimedCount;

  // Environmental impact calculation
  // toFixed(1) rounds to 1 decimal place, Number() converts string back to number
  const co2ReducedKg = Number((totalReused * CO2_KG_PER_ITEM).toFixed(1));

  return {
    ...base,              // All user fields
    favoritesCount,       // Count of bookmarked items
    listingsCount,        // Total items ever listed
    successfulReuses,     // Items successfully given away
    pendingRequests,      // Requests waiting for response (badge in profile)
    completedExchanges,   // Total successful exchanges (both as donor and receiver)
    itemsDonatedCount,
    itemsClaimedCount,
    // Green Campus Impact Tracker — displayed on ProfileScreen as eco achievements
    impact: {
      totalReused,
      moneySaved: itemsClaimedCount * MONEY_SAVED_PER_CLAIM, // ₹ saved vs. buying new
      co2ReducedKg,
      treesSaved: Number((co2ReducedKg / CO2_KG_PER_TREE_YEAR).toFixed(1)), // CO2 / 21 kg per tree
    },
  };
};

// =============================================================================
// @desc    Get current user profile & stats (Feature 11)
// @route   GET /api/auth/me
// @access  Protected (requires JWT)
// Called by AuthContext on app boot and after profile updates to refresh state.
// =============================================================================

exports.getMe = async (req, res) => {
  try {
    // req.user is set by protect() middleware; re-fetch to get latest data from DB
    const user = await User.findById(req.user._id).select('-password'); // Exclude password
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Build the full profile including live stats and eco impact
    const profile = await exports.buildProfilePayload(user);

    res.status(200).json({
      success: true,
      user: profile,
    });
  } catch (error) {
    console.error('[GetMe Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching user profile',
    });
  }
};

// =============================================================================
// @desc    Update user profile with optional avatar upload (Feature 11)
// @route   PUT /api/auth/profile
// @access  Protected
// Flow: load user → update changed fields → save → return fresh profile payload
// =============================================================================

exports.updateProfile = async (req, res) => {
  try {
    // Destructure only the fields we allow users to update
    const {
      name,
      phone,
      collegeName,
      addressName,
      department,
      pickupLandmark,
      coordinates,  // [longitude, latitude] from GPS
      avatar,       // Base64 or URL string (fallback when no file uploaded)
      enrollmentNumber,
    } = req.body;

    // Load the user document from MongoDB
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only update fields that were actually provided in the request
    // (undefined check prevents overwriting fields the user didn't intend to change)

    if (name !== undefined) {
      const cleanName = String(name).trim();
      // Name must be at least 3 characters (prevents "A" or "AB" as names)
      if (cleanName.length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Name must be at least 3 characters long',
        });
      }
      user.name = cleanName;
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();
      if (!cleanPhone) {
        return res.status(400).json({
          success: false,
          message: 'A valid 10-digit mobile number is required',
        });
      }
      user.phone = cleanPhone;
    }

    // Simple string field updates — only change if provided in request
    if (collegeName !== undefined) user.collegeName = String(collegeName).trim();
    if (addressName !== undefined) user.addressName = String(addressName).trim();
    if (department !== undefined) user.department = String(department).trim();
    if (pickupLandmark !== undefined) user.pickupLandmark = String(pickupLandmark).trim();

    // Student ID verification: submitting an enrollment number auto-verifies the student
    // This awards them the "Verified Student" badge on their profile
    if (enrollmentNumber !== undefined) {
      user.enrollmentNumber = String(enrollmentNumber).trim();
      if (user.enrollmentNumber.length > 0) {
        user.isVerified = true; // Set verified badge once enrollment number is provided
      }
    }

    // Avatar priority: Multer file upload (req.file) takes precedence over raw string
    // req.file is set by avatarUpload middleware when a file is uploaded
    if (req.file) {
      // Save the relative path (not absolute) — resolved to full URL on frontend
      user.avatar = `/uploads/avatars/${req.file.filename}`;
    } else if (avatar !== undefined) {
      // Fall back to raw avatar string if provided (URL or base64)
      user.avatar = avatar;
    }

    // Update GPS location if new coordinates were sent
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      user.location = {
        type: 'Point', // Required GeoJSON format
        coordinates: [Number(coordinates[0]), Number(coordinates[1])], // Ensure numeric
      };
    }

    // Save all changes to MongoDB
    await user.save();

    // Build and return the fresh profile payload (with updated eco stats)
    const profile = await exports.buildProfilePayload(user);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: profile,
    });
  } catch (error) {
    console.error('[UpdateProfile Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating profile',
    });
  }
};

// =============================================================================
// @desc    Update Expo push notification token (Feature 16)
// @route   PUT /api/auth/push-token
// @access  Protected
// Called by AuthContext when the app boots on a new device or token refreshes.
// The push token is device-specific and needed to send push notifications.
// =============================================================================

exports.updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    // findByIdAndUpdate() updates just the expoPushToken field without loading the full document
    // This is more efficient than findById() + user.save() for a single field update
    await User.findByIdAndUpdate(req.user._id, { expoPushToken: pushToken || '' });

    res.status(200).json({
      success: true,
      message: 'Push token updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating push token',
    });
  }
};

// =============================================================================
// @desc    Public Student Trust & Anti-Fraud profile (no contact details exposed)
// @route   GET /api/auth/users/:id/public-profile
// @access  Public (any logged-in or anonymous user can view)
// Purpose: Allows students to verify if a donor/seller is trustworthy before exchanging.
//          Exposes campus identity + trust stats ONLY — never phone/email/coordinates.
// =============================================================================

exports.getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params; // User ID from URL parameter

    // Validate that the ID is a valid MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID',
      });
    }

    // Fetch only the safe public fields — explicitly exclude private data
    // .select() with field names returns only those fields (privacy by design)
    const user = await User.findById(id).select(
      'name avatar collegeName department enrollmentNumber isVerified karmaPoints createdAt isSuspended'
      // NOT included: email, phone, password, location coordinates, expoPushToken
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Run 4 count queries in parallel to build the trust statistics panel
    const [listings, totalItemsShared, totalItemsReceived, totalComplaints] = await Promise.all([
      // Active public listings by this user (shown as proof they're an active community member)
      Item.find({ donor: user._id, status: 'available', isHidden: false })
        .sort({ createdAt: -1 }) // Newest listings first
        .limit(30)               // Show at most 30 listings in public profile
        .select('title description category condition listingType borrowDays images addressText location status views createdAt')
        .lean(), // .lean() returns plain JS objects (faster than Mongoose documents)

      // How many items has this person successfully given away?
      Item.countDocuments({ donor: user._id, status: 'completed' }),

      // How many times has this person successfully received/claimed items?
      Request.countDocuments({ sender: user._id, status: 'completed' }),

      // How many times has this person been reported? (0 = clean record)
      Report.countDocuments({ reportedUser: user._id }),
    ]);

    // Build a lightweight "public donor" object for each listing
    // ItemCard renders the donor row, so each listing needs donor info
    // IMPORTANT: Only safe fields — no phone, email, or coordinates
    const publicDonor = {
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      isVerified: Boolean(user.isVerified),
    };

    const activeListings = listings.length; // Count of currently active listings

    res.status(200).json({
      success: true,
      // Campus identity profile — no contact info
      profile: {
        _id: user._id,
        name: user.name,
        avatar: user.avatar || '',
        collegeName: user.collegeName || '',
        department: user.department || '',
        enrollmentNumber: user.enrollmentNumber || '',
        isVerified: Boolean(user.isVerified), // ✓ Verified badge
        karmaPoints: user.karmaPoints || 0,
        createdAt: user.createdAt,            // "Member since" date
        isSuspended: Boolean(user.isSuspended),
      },
      // Trust statistics for the anti-fraud verification panel
      stats: {
        totalItemsShared,                            // Items donated/sold successfully
        totalItemsReceived,                          // Items claimed/bought successfully
        completedHandovers: totalItemsShared + totalItemsReceived, // Total successful exchanges
        totalComplaints,                             // Number of reports filed against this user
        activeListings,                              // Currently listed items
        cleanRecord: totalComplaints === 0,          // True = no reports ever filed
      },
      // Active listings shown in public profile tab (each with public donor info attached)
      listings: listings.map((item) => ({ ...item, donor: publicDonor })),
    });
  } catch (error) {
    console.error('[GetPublicProfile Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching student profile',
    });
  }
};
