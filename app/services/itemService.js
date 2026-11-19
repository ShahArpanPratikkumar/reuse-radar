// =============================================================================
// REUSE RADAR - ITEM SERVICE (itemService.js)
// Purpose: Wraps all item/listing-related API calls for use across the app.
//          Used by: HomeScreen, ExploreScreen, AddItemScreen, ItemDetailsScreen,
//                   MyItemsScreen, and any screen that deals with item listings.
// API Endpoints covered:
//   GET    /api/items                  — List all items (with filters/search/pagination)
//   GET    /api/items/nearby           — Geospatial "near me" radar query
//   GET    /api/items/:id              — Single item details
//   POST   /api/items                  — Create new listing (with optional images)
//   GET    /api/items/user/my-items    — My own listings
//   PUT    /api/items/:id              — Edit a listing (with optional new images)
//   DELETE /api/items/:id              — Remove a listing
//   PATCH  /api/items/:id/toggle-status — Change availability status
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const itemService = {
  // ── List Items (HomeScreen / ExploreScreen feed) ──────────────────────────
  // params can include: { category, condition, search, listingType, sort, page, limit }
  // Returns: { success: true, items: [...], total, page, pages }
  async getItems(params = {}) {
    return await api.get('/items', { params });
    // params are serialized as query string: /items?category=Books&sort=Newest
  },

  // ── Nearby Radar Query (ExploreScreen map view) ───────────────────────────
  // Uses MongoDB $near geospatial operator to find items within radiusKm of GPS coords.
  // lat, lng = user's current GPS coordinates from expo-location
  // radiusKm = search radius in kilometers (1, 5, 10, or 25)
  // Returns: { success: true, items: [...] } sorted by distance from user
  async getNearbyItems(lat, lng, radiusKm = 10, category = 'All', search = '', condition = 'All', verifiedOnly = false) {
    const params = { lat, lng, radiusKm };

    // Only add optional filters if they're not the "All"/empty default
    if (category && category !== 'All') params.category = category;
    if (condition && condition !== 'All') params.condition = condition;
    if (search && search.trim()) params.search = search.trim();
    if (verifiedOnly) params.verifiedOnly = 'true'; // Show only verified student listings

    return await api.get('/items/nearby', { params });
  },

  // ── Single Item Details (ItemDetailsScreen) ───────────────────────────────
  // Also increments the item's view count on the backend
  async getItemById(id) {
    return await api.get(`/items/${id}`);
  },

  // ── Create New Listing (AddItemScreen) ───────────────────────────────────
  // data can be:
  //   - FormData: when photos are attached (multipart upload)
  //   - JSON object: when no photos (text-only listing)
  async createItem(data) {
    // Check if we're uploading files (FormData) or sending plain JSON
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

    return await api.post('/items', data, isFormData ? {
      headers: {
        // 'multipart/form-data' tells the server to use multer to parse image files
        'Content-Type': 'multipart/form-data',
      },
    } : undefined);
  },

  // ── My Listings (MyItemsScreen / ProfileScreen) ──────────────────────────
  // Returns all items created by the currently authenticated user
  // Protected route: JWT required
  async getMyItems() {
    return await api.get('/items/user/my-items');
  },

  // ── Edit Existing Listing (AddItemScreen in edit mode) ───────────────────
  // id = MongoDB _id of the item to update
  // data can be FormData (with new images) or JSON (text-only changes)
  async updateItem(id, data) {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

    return await api.put(`/items/${id}`, data, isFormData ? {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    } : undefined);
  },

  // ── Delete Listing (MyItemsScreen) ──────────────────────────────────────
  // Permanently removes the item and its uploaded images from the server
  async deleteItem(id) {
    return await api.delete(`/items/${id}`);
  },

  // ── Toggle Item Status (MyItemsScreen) ───────────────────────────────────
  // status can be: 'available', 'reserved', 'completed'
  // Allows owners to pause/resume listings without deleting them
  async toggleStatus(id, status) {
    return await api.patch(`/items/${id}/toggle-status`, { status });
  },
};
