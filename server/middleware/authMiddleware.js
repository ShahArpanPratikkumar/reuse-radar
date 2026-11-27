// =============================================================================
// REUSE RADAR - AUTH MIDDLEWARE (authMiddleware.js)
// Purpose: Protects private API routes by verifying JWT tokens and checking
//          user account status (active/suspended/admin).
//          Also configures Multer for item image uploads.
// Features:
//   1. protect()          - Verifies Bearer JWT before allowing route access
//   2. requireActiveUser() - Blocks suspended accounts from performing actions
//   3. requireAdmin()     - Restricts admin-only routes to role='admin' users
//   4. upload (multer)    - Handles multipart/form-data image uploads (5MB limit)
// =============================================================================

// 'jsonwebtoken' is used to sign and verify JWT tokens (JSON Web Tokens)
const jwt = require('jsonwebtoken');

// 'multer' is a middleware for handling multipart/form-data (file uploads)
const multer = require('multer');

// 'path' provides utilities for working with file and directory paths
const path = require('path');

// 'fs' (File System) lets us check and create directories on the server disk
const fs = require('fs');

// Import the User model so we can look up the user by ID from the JWT payload
const User = require('../models/User');

// =============================================================================
// Mechanism 1: JWT PROTECTION MIDDLEWARE
// Every protected route calls this middleware FIRST.
// If the token is valid → req.user is populated → next() continues the request.
// If invalid/expired  → 401 Unauthorized is returned immediately.
// =============================================================================

const protect = async (req, res, next) => {
  let token; // Will hold the extracted JWT string

  // Check if the HTTP Authorization header exists AND starts with 'Bearer'
  // Authorization header format: "Bearer eyJhbGciOiJIUzI1NiIsInR..."
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Split "Bearer <token>" and take the second part (index 1) which is the actual token
      token = req.headers.authorization.split(' ')[1];

      // jwt.verify() decodes the token and validates its signature using the secret key
      // If the token was tampered with or expired, this will throw an error
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'reuseradar_super_secret_jwt_key_2026'
        // JWT_SECRET is loaded from .env file; fallback string used in development
      );

      // Use the 'id' embedded in the JWT payload to find the user in MongoDB
      // .select('-password') excludes the hashed password from the returned document (security)
      const user = await User.findById(decoded.id).select('-password');

      // If the user was deleted from the database after their token was issued
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists. Please log in again.',
        });
      }

      // Attach the user document to the request object so downstream controllers
      // can access it as req.user (e.g., req.user._id, req.user.role)
      req.user = user;

      // Call next() to pass control to the actual route handler
      return next();
    } catch (error) {
      // Token was invalid (tampered), expired, or malformed
      console.error('[Auth Middleware] Token error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please log in again.',
      });
    }
  }

  // If no token was found in the Authorization header at all
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.',
    });
  }
};

// =============================================================================
// Mechanism 2: ACTIVE USER CHECK
// Called AFTER protect() — req.user is already populated at this point.
// Prevents suspended accounts from completing any action (donate, claim, chat).
// =============================================================================

const requireActiveUser = (req, res, next) => {
  // Check if the authenticated user has been suspended by an admin
  if (req.user && req.user.isSuspended) {
    // Return 403 Forbidden with the specific reason stored in the user document
    return res.status(403).json({
      success: false,
      message:
        'Your account has been suspended: ' +
        (req.user.suspensionReason || 'Violation of campus community guidelines. Contact admin for assistance.'),
    });
  }
  // User is active — allow the request to continue
  next();
};

// =============================================================================
// Mechanism 3: ADMIN ROLE CHECK
// Restricts routes like /api/admin/* to users with role='admin' only.
// Called AFTER protect() so req.user is guaranteed to be set.
// =============================================================================

const requireAdmin = (req, res, next) => {
  // req.user.role is loaded from MongoDB (set during registration, default 'user')
  if (!req.user || req.user.role !== 'admin') {
    // 403 Forbidden: user is authenticated but does not have admin privileges
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Administrator privileges required to access this resource.',
    });
  }
  // User is an admin — allow access to the admin route
  next();
};

// =============================================================================
// Mechanism 4: MULTER FILE UPLOAD CONFIGURATION (Item Images)
// Multer handles multipart/form-data requests (file uploads).
// Files are saved to server/uploads/ directory on disk.
// =============================================================================

// Build the absolute path to the uploads directory
// __dirname = current folder (middleware/), go up one level to server/, then uploads/
const uploadDir = path.join(__dirname, '..', 'uploads');

// If the uploads folder does not exist yet, create it automatically
// { recursive: true } means it won't throw an error if parent dirs are missing
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure where and how to store uploaded files on disk
const storage = multer.diskStorage({
  // 'destination' tells Multer which folder to save files in
  destination: function (req, file, cb) {
    cb(null, uploadDir); // null = no error, uploadDir = save here
  },

  // 'filename' controls what name the saved file gets on disk
  filename: function (req, file, cb) {
    // Get the file extension (e.g., .jpg, .png) from the original filename, lowercased
    const ext = path.extname(file.originalname).toLowerCase();

    // Create a unique suffix combining current timestamp + random 9-digit number
    // This prevents filename collisions when two users upload files at the same time
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    // Final filename example: item-1795123456789-834512345.jpg
    cb(null, `item-${uniqueSuffix}${ext}`);
  },
});

// File type filter — only allow image file types
const fileFilter = (req, file, cb) => {
  // List of allowed MIME types (image formats only)
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

  if (allowedTypes.includes(file.mimetype)) {
    // null = no error, true = accept this file
    cb(null, true);
  } else {
    // Reject the file with an error message
    cb(new Error('Only JPEG, PNG, and WebP image files are allowed'), false);
  }
};

// Create the Multer instance with our custom storage, filter, and size limit
const upload = multer({
  storage: storage,       // Where and how to save files
  fileFilter: fileFilter, // Which file types to allow
  limits: {
    fileSize: 5 * 1024 * 1024,    // Maximum file size: 5MB
    fieldSize: 25 * 1024 * 1024,  // Allow large Base64 Data URIs in existingImages field
  },
});

// Export all three middleware functions + the multer upload instance
// Routes use them like: router.post('/items', protect, requireActiveUser, upload.array('images', 5), createItem)
module.exports = { protect, requireActiveUser, requireAdmin, upload };
