// =============================================================================
// REUSE RADAR - WISHLIST SERVICE (wishlistService.js)
// Purpose: Wraps all Campus Wishlist / "I Need This" API calls.
//          Used by: HomeScreen (campus requests feed), RequestItemScreen (create),
//                   ProfileScreen (my posted requests), MyItemsScreen.
//          A wishlist entry is a public post saying "I need X item" — other
//          students who have that item can donate/sell it to fulfill the need.
// API Endpoints covered:
//   POST   /api/wishlist            — Post a new campus need/request
//   GET    /api/wishlist            — View campus needs feed
//   GET    /api/wishlist/my         — My own posted requests
//   PATCH  /api/wishlist/:id/status — Update status (active/matched/fulfilled)
//   DELETE /api/wishlist/:id        — Remove a posted request
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const wishlistService = {
  // ── Post a Campus Need (RequestItemScreen) ────────────────────────────────
  // data = { title, category, urgency, description }
  // Creates a Wishlist document with status='active', visible in the campus feed
  // Backend also checks for matching available items and sends a notification if found
  async createWishlist(data) {
    return await api.post('/wishlist', data);
  },

  // ── Campus Requests Feed (HomeScreen "What Mates Need" section) ───────────
  // Shows active requests from all campus community members
  // params can include: { category, urgency, page }
  async getWishlistFeed(params = {}) {
    return await api.get('/wishlist', { params });
  },

  // ── My Posted Requests (ProfileScreen / MyItemsScreen) ───────────────────
  // Returns only the wishlist entries posted by the current user
  async getMyWishlists() {
    return await api.get('/wishlist/my');
  },

  // ── Update Request Status ─────────────────────────────────────────────────
  // status = 'active' | 'matched' | 'fulfilled'
  // 'fulfilled' closes the request (hides it from the public feed)
  async updateStatus(id, status) {
    return await api.patch(`/wishlist/${id}/status`, { status });
  },

  // ── Delete a Posted Request ───────────────────────────────────────────────
  // Permanently removes the wishlist entry
  async deleteWishlist(id) {
    return await api.delete(`/wishlist/${id}`);
  },
};
