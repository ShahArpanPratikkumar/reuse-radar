// =============================================================================
// REUSE RADAR - AVATAR UPLOAD MIDDLEWARE (avatarUpload.js)
// Purpose: Dedicated Multer configuration for profile picture (avatar) uploads.
//          Saves avatar images to server/uploads/avatars/ (separate from item images).
//          Returns clean JSON 400 errors instead of raw Multer exception crashes.
// Features:
//   1. Dedicated avatars subfolder (separate from item images)
//   2. Unique filenames with userId embedded (easy to identify owner)
//   3. JPEG/PNG/WebP only, 5MB max size
//   4. JSON error wrapper — prevents Multer errors from crashing the response
// =============================================================================

// 'multer' handles multipart/form-data requests that contain file attachments
const multer = require('multer');

// 'path' provides cross-platform utilities for constructing file paths
const path = require('path');

// 'fs' lets us check if the directory exists and create it if needed
const fs = require('fs');

// =============================================================================
// Step 1: Create the avatars storage directory if it doesn't exist
// server/uploads/avatars/ is separate from server/uploads/ (item images)
// =============================================================================

// __dirname = this file's folder (middleware/)
// Go up one level to server/, then into uploads/avatars/
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');

// Check if the avatars directory already exists on disk
if (!fs.existsSync(avatarDir)) {
  // Create it (and any parent directories) automatically
  fs.mkdirSync(avatarDir, { recursive: true });
}

// =============================================================================
// Step 2: Configure Multer disk storage for avatar files
// =============================================================================

const storage = multer.diskStorage({
  // Tell Multer where to save avatar files
  destination: function (req, file, cb) {
    cb(null, avatarDir); // Save all avatars to the dedicated avatars folder
  },

  // Control the filename of saved avatar files
  filename: function (req, file, cb) {
    // Get file extension (.jpg, .png, etc.) — fallback to .jpg if originalname is missing
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';

    // Unique timestamp + random number prevents two uploads getting the same filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    // Embed the user's MongoDB _id in the filename so we can identify whose avatar it is
    // req.user is set by the protect() middleware before this middleware runs
    // Example: avatar-6afcc61bddcde2470e8fb775-1795175877671-455463133.jpeg
    cb(null, `avatar-${req.user ? req.user._id : 'user'}-${uniqueSuffix}${ext}`);
  },
});

// =============================================================================
// Step 3: File type filter — only allow image files
// =============================================================================

const fileFilter = (req, file, cb) => {
  // List of accepted image MIME types
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    // Reject files that are not images (e.g., PDFs, executables)
    cb(new Error('Only JPEG, PNG, and WebP image files are allowed'), false);
  }
};

// =============================================================================
// Step 4: Create the Multer instance
// .single('avatar') means we expect exactly ONE file uploaded with field name 'avatar'
// =============================================================================

const avatarUpload = multer({
  storage,     // Our custom disk storage configuration
  fileFilter,  // Only allow image file types
  limits: {
    fileSize: 5 * 1024 * 1024, // Max 5MB per avatar image
    fieldSize: 25 * 1024 * 1024,
  },
}).single('avatar'); // 'avatar' is the form field name the mobile app uses

// =============================================================================
// Step 5: JSON error wrapper
// Without this wrapper, Multer errors (file too large, wrong type)
// would crash the response with an unformatted error.
// This wrapper catches Multer errors and returns a clean JSON 400 response.
// =============================================================================

const uploadAvatar = (req, res, next) => {
  // Run the actual Multer middleware
  avatarUpload(req, res, (error) => {
    if (error) {
      // Any Multer error (size limit exceeded, invalid file type, etc.)
      // is returned as a structured JSON error with HTTP 400 Bad Request
      return res.status(400).json({
        success: false,
        message: error.message || 'Avatar upload failed',
      });
    }
    // No error — file is saved to disk, available as req.file
    return next();
  });
};

// Export the wrapped upload function and the directory path
// avatarDir is exported so authController can reference it when saving the avatar URL
module.exports = { uploadAvatar, avatarDir };
