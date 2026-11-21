// =============================================================================
// REUSE RADAR - ASYNC STORAGE UTILITY (storage.js)
// Purpose: Wraps React Native's AsyncStorage API in a clean, error-safe interface.
//          AsyncStorage is the mobile equivalent of localStorage — it persists
//          data on the device even after the app is closed/restarted.
// Data stored:
//   @reuseradar_token         — JWT authentication token (required for API calls)
//   @reuseradar_user          — Serialized user object (profile data, cached)
//   @reuseradar_preferences   — User settings (default radius, category filter)
//   @reuseradar_recently_viewed — Array of recently viewed item objects (last 10)
// Features:
//   1. All methods are error-safe with try/catch (AsyncStorage can fail on low memory)
//   2. clearSession() atomically removes both token AND user in a single operation
//   3. getUser() automatically deserializes JSON → plain JS object
//   4. Recently viewed history limited to 10 items (deduplicated by _id)
// =============================================================================

// '@react-native-async-storage/async-storage' is the standard Expo-compatible
// persistent key-value store for React Native applications
import AsyncStorage from '@react-native-async-storage/async-storage';

// =============================================================================
// Storage Keys
// Using constants prevents typo bugs when reading/writing the same key
// Prefixed with '@reuseradar_' to avoid conflicts with other apps' storage
// =============================================================================

const TOKEN_KEY = '@reuseradar_token';           // JWT Bearer token
const USER_KEY = '@reuseradar_user';             // Cached user profile object
const PREFS_KEY = '@reuseradar_preferences';     // User filter preferences
const RECENT_ITEMS_KEY = '@reuseradar_recently_viewed'; // Recently viewed items array

// =============================================================================
// Storage API Object
// All methods are async (AsyncStorage is always asynchronous on mobile)
// =============================================================================

export const storage = {
  // ── Authentication Token ──────────────────────────────────────────────────

  // Read the stored JWT token
  // Used by api.js request interceptor to attach 'Authorization: Bearer <token>' header
  async getToken() {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
      // Returns: JWT string or null if not set
    } catch (e) {
      console.error('[Storage] Error getting token', e);
      return null; // Safe fallback — API will get 401 and handle session expiry
    }
  },

  // Save the JWT token after successful login/register
  // Called by AuthContext.login() and AuthContext.register()
  async setToken(token) {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      // AsyncStorage only stores strings — JWT is already a string
    } catch (e) {
      console.error('[Storage] Error setting token', e);
    }
  },

  // Delete the stored JWT token (called during logout)
  async removeToken() {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.error('[Storage] Error removing token', e);
    }
  },

  // ── User Data ─────────────────────────────────────────────────────────────

  // Read and parse the cached user profile object
  // Used by AuthContext on app boot to restore session state instantly
  async getUser() {
    try {
      const data = await AsyncStorage.getItem(USER_KEY);
      // AsyncStorage stores everything as strings — JSON.parse converts back to object
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('[Storage] Error getting user', e);
      return null;
    }
  },

  // Serialize and save the user profile object
  // Called after login/register and after profile updates
  async setUser(user) {
    try {
      // JSON.stringify converts the user object to a string for AsyncStorage
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('[Storage] Error setting user', e);
    }
  },

  // Delete the cached user profile (called during logout)
  async removeUser() {
    try {
      await AsyncStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('[Storage] Error removing user', e);
    }
  },

  // ── Clear Session (Logout) ────────────────────────────────────────────────

  // Atomically delete BOTH token and user data in a single AsyncStorage call
  // multiRemove() is more efficient than two separate removeItem() calls
  // Called during logout and when api.js detects a 401 Unauthorized response
  async clearSession() {
    try {
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      // Both are removed atomically — no partial state where token exists but user is gone
    } catch (e) {
      console.error('[Storage] Error clearing session', e);
    }
  },

  // ── User Preferences ──────────────────────────────────────────────────────
  // Saves the user's preferred filter settings between app sessions

  // Load user's saved preferences (search radius, default category)
  async getPreferences() {
    try {
      const data = await AsyncStorage.getItem(PREFS_KEY);
      return data ? JSON.parse(data) : { defaultRadius: 10, defaultCategory: 'All' };
      // Returns safe defaults if no preferences have been saved yet
    } catch (e) {
      return { defaultRadius: 10, defaultCategory: 'All' }; // Fallback defaults on error
    }
  },

  // Save user's current filter preferences for next session
  async setPreferences(prefs) {
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.error('[Storage] Error saving preferences', e);
    }
  },

  // ── Recently Viewed Items ─────────────────────────────────────────────────
  // Stores the last 10 items the user viewed (shown as "Recently Viewed" in HomeScreen)

  // Load the array of recently viewed items
  async getRecentlyViewed() {
    try {
      const data = await AsyncStorage.getItem(RECENT_ITEMS_KEY);
      return data ? JSON.parse(data) : []; // Return empty array if none stored yet
    } catch (e) {
      return []; // Safe fallback
    }
  },

  // Add an item to the recently viewed list (called when user opens ItemDetailsScreen)
  async addRecentlyViewed(item) {
    try {
      const current = await this.getRecentlyViewed(); // Load existing list

      // Remove the item if it's already in the list (deduplicate by _id)
      // This prevents duplicates when user views the same item multiple times
      const filtered = current.filter((i) => i._id !== item._id);

      // Add the new item at the FRONT (most recent first) and limit to last 10
      // .slice(0, 10) keeps only the first 10 elements
      const updated = [item, ...filtered].slice(0, 10); // Keep last 10 viewed items

      await AsyncStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('[Storage] Error saving recently viewed', e);
    }
  },
};
