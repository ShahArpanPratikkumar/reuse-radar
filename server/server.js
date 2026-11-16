// =============================================================================
// REUSE RADAR - MAIN EXPRESS BACKEND SERVER ENTRY POINT (server.js)
// Purpose: Initializes the REST API, handles middleware, establishes MongoDB
// connection, registers all routing endpoints, and listens for client requests.
// =============================================================================

// 1. Core Node.js and Third-Party Dependencies
const express = require('express');    // Fast, unopinionated web framework for Node.js
const cors = require('cors');          // Cross-Origin Resource Sharing middleware (allows mobile & web apps to communicate)
const path = require('path');          // Native Node module for resolving filesystem paths
const dotenv = require('dotenv');      // Loads environment variables from .env file into process.env
const mongoose = require('mongoose');  // Object Data Modeling (ODM) library for MongoDB

// 2. Load Environment Variables (.env configuration)
// Reads PORT, MONGO_URI, JWT_SECRET, and EXPO_PUBLIC variables
dotenv.config();

// 3. Database Connection Module
// Connects to MongoDB Atlas Cloud Cluster
const connectDB = require('./config/db');
connectDB();

// 4. Initialize Express Application Instance
const app = express();

// =============================================================================
// GLOBAL MIDDLEWARES
// =============================================================================

// Enable CORS for all incoming client origins (Expo Go, Android, iOS, Web browsers)
app.use(cors());

// Parse incoming request payloads formatted as JSON (up to 10MB for base64 image data)
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data (e.g., standard HTML forms or serialized data)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logger: Logs HTTP Method, endpoint URL, and client IP in real time
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} from ${req.ip}`);
  next(); // Pass control to the next middleware in the pipeline
});

// Static Asset Hosting: Serves uploaded item images and user avatars from disk
// Maps GET requests to '/uploads/...' to the physical directory 'server/uploads/...'
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================================================
// HEALTH CHECK ENDPOINT
// =============================================================================
// Used by mobile app (useNetworkStatus hook) and cloud platforms (Render/AWS)
// to verify backend uptime and database connection status in real time.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    app: 'ReUse Radar API',
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Database Readiness Guard: Blocks API queries if MongoDB is momentarily disconnected
// Prevents requests from hanging indefinitely and returns a clean HTTP 503 Service Unavailable
app.use((req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is not connected yet. Please check MongoDB Atlas Network Access (IP 0.0.0.0/0) or restart the server.',
      });
    }
  }
  next();
});

// =============================================================================
// ROUTE REGISTRATION (API Endpoints)
// =============================================================================
// Mount individual feature routers to their corresponding base URL prefixes:
app.use('/api/auth', require('./routes/authRoutes'));                   // User registration, login, JWT verification, and profiles
app.use('/api/items', require('./routes/itemRoutes'));                 // Reusable item listings, multi-image upload, GeoJSON search
app.use('/api/requests', require('./routes/requestRoutes'));           // Item claim requests, 4-digit handover PIN verification
app.use('/api/notifications', require('./routes/notificationRoutes')); // In-app notification center and unread badges
app.use('/api/messages', require('./routes/messageRoutes'));           // Real-time student-to-student P2P chat messages
app.use('/api/favorites', require('./routes/favoriteRoutes'));         // Saved items / wishlist bookmarking
app.use('/api/reports', require('./routes/reportRoutes'));             // Community moderation, reporting suspicious users/items
app.use('/api/admin', require('./routes/adminRoutes'));                 // Administrative moderation controls
app.use('/api/wishlist', require('./routes/wishlistRoutes'));           // "I Need This" campus demand matching

// =============================================================================
// ERROR HANDLING MIDDLEWARES
// =============================================================================

// Catch-all 404 Route Handler: Catches any unmatched route requests
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found at ${req.originalUrl}`,
  });
});

// Global Error Handler: Catches all unhandled exceptions and returns uniform JSON
app.use((err, req, res, next) => {
  console.error('[Global Server Error]', err);
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// =============================================================================
// SERVER LISTENER INITIALIZATION
// =============================================================================
// Binds server to 0.0.0.0 on PORT 5000 (accessible on LAN for physical phones and cloud hosts)
const parsedPort = Number.parseInt(process.env.PORT, 10);
const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
    ? parsedPort
    : 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 ReUse Radar API Server running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);
});

// Export app instance for automated testing or serverless wrapping
module.exports = app;
