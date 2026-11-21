// =============================================================================
// REUSE RADAR - AUTH SERVICE (authService.js)
// Purpose: Wraps all authentication-related API calls in a clean service object.
//          Used by AuthContext, LoginScreen, RegisterScreen, EditProfileScreen.
// API Endpoints covered:
//   POST /api/auth/register        — Create account
//   POST /api/auth/login           — Get JWT token
//   GET  /api/auth/me              — Fetch current user profile + stats
//   GET  /api/auth/users/:id/public-profile — View any student's public profile
//   PUT  /api/auth/profile         — Update profile / avatar
//   PUT  /api/auth/push-token      — Sync Expo push notification token
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const authService = {
  // Create a new student account (called by RegisterScreen)
  // data contains: { name, email, password, phone, collegeName, addressName, coordinates }
  async register(data) {
    return await api.post('/auth/register', data);
  },

  // Authenticate an existing user and get JWT token (called by LoginScreen)
  // Returns: { success: true, token: '...', user: { _id, name, email, ... } }
  async login(email, password) {
    return await api.post('/auth/login', { email, password });
  },

  // Fetch the current logged-in user's full profile + live eco impact stats
  // Called by AuthContext on app boot and periodic profile refresh
  // Returns: { success: true, user: { ...profile, impact: { totalReused, ... } } }
  async getMe() {
    return await api.get('/auth/me');
  },

  // Public trust & anti-fraud profile of another student (no contact details)
  // Used by UserProfileScreen to let students verify donors before exchanging
  // userId = MongoDB _id of the student whose profile is being viewed
  async getPublicProfile(userId) {
    return await api.get(`/auth/users/${userId}/public-profile`);
  },

  // Update profile fields (name, phone, college, avatar, location, enrollment number)
  // profileData can be either:
  //   - JSON object: { name, phone, collegeName, ... }
  //   - FormData: when including an avatar image file upload
  async updateProfile(profileData) {
    // Check if we're sending a file upload (FormData) or plain JSON
    const isFormData =
      typeof FormData !== 'undefined' && profileData instanceof FormData;

    return await api.put(
      '/auth/profile',
      profileData,
      // If FormData, override the default 'application/json' content type
      // 'multipart/form-data' tells the server to parse files from the body
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
    );
  },

  // Sync the device's Expo push notification token with the backend
  // Called by AuthContext after notification permission is granted
  // The token is used by notificationController to send push notifications
  async updatePushToken(pushToken) {
    return await api.put('/auth/push-token', { pushToken });
  },
};
