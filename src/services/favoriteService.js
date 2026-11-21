// =============================================================================
// REUSE RADAR - FAVORITE SERVICE (favoriteService.js)
// Purpose: Wraps all favorites/bookmarks API calls.
//          Used by: ItemCard (heart toggle), FavoritesScreen, ItemDetailsScreen.
//          Favorites let students save items they're interested in for later.
// API Endpoints covered:
//   GET    /api/favorites           — Get all my favorited items
//   POST   /api/favorites/:itemId   — Add item to favorites
//   DELETE /api/favorites/:itemId   — Remove item from favorites
//   GET    /api/favorites/check/:itemId — Check if specific item is favorited
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const favoriteService = {
  // ── Get All Favorites (FavoritesScreen) ──────────────────────────────────
  // Returns all items bookmarked by the current user
  // Items are populated with full details for display in the favorites list
  async getFavorites() {
    return await api.get('/favorites');
  },

  // ── Add Item to Favorites (ItemCard heart button / ItemDetailsScreen) ─────
  // itemId = MongoDB _id of the item being bookmarked
  // Backend adds the itemId to the user's favorites array in the User model
  async addFavorite(itemId) {
    return await api.post(`/favorites/${itemId}`);
  },

  // ── Remove Item from Favorites (unfavorite / bookmark toggle) ────────────
  // Backend removes the itemId from the user's favorites array
  async removeFavorite(itemId) {
    return await api.delete(`/favorites/${itemId}`);
  },

  // ── Check if Specific Item is Favorited (ItemDetailsScreen on load) ───────
  // Returns { isFavorited: true/false } for showing the correct heart icon state
  async checkFavorite(itemId) {
    return await api.get(`/favorites/check/${itemId}`);
  },
};
