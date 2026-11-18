// =============================================================================
// REUSE RADAR - FAVORITE CONTROLLER (favoriteController.js)
// Purpose: Handles bookmarking/favoriting items. Students can save listings
//          they're interested in and view them later in FavoritesScreen.
//          Favorites are stored as an array of ObjectIds in the User document.
// Routes handled:
//   POST   /api/favorites/:itemId        — Add item to favorites
//   DELETE /api/favorites/:itemId        — Remove item from favorites
//   GET    /api/favorites                — Get all favorited items (with full details)
//   GET    /api/favorites/check/:itemId  — Check if a specific item is favorited
// =============================================================================

// 'mongoose' needed for ObjectId validation
const mongoose = require('mongoose');

// User model — favorites array lives inside the User document
const User = require('../models/User');

// Item model — needed to verify item exists before adding to favorites
const Item = require('../models/Item');

// =============================================================================
// @desc    Add item to user's favorites / bookmark (Feature 21)
// @route   POST /api/favorites/:itemId
// @access  Protected (requires JWT)
// Uses MongoDB $addToSet to add item without duplicates
// =============================================================================

exports.addFavorite = async (req, res) => {
  try {
    const { itemId } = req.params; // Item ID from URL: /api/favorites/:itemId

    // Validate that itemId is a proper MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    // Check that the item actually exists and isn't hidden by admin
    const item = await Item.findById(itemId);
    if (!item || item.isHidden) {
      return res.status(404).json({
        success: false,
        message: 'Item not found or unavailable',
      });
    }

    // $addToSet: MongoDB operator that adds the value to the array ONLY if it's not already there
    // This prevents duplicate favorites without needing a separate "check if exists" query
    // returnDocument: 'after' returns the updated document (with the new favorites array)
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,                        // Which user's favorites to update
      { $addToSet: { favorites: item._id } }, // Add item._id to favorites if not present
      { returnDocument: 'after' }          // Return the updated document
    );

    res.status(200).json({
      success: true,
      message: 'Item added to favorites',
      isFavorite: true,
      favoritesCount: updatedUser.favorites.length, // Updated total count
    });
  } catch (error) {
    console.error('[AddFavorite Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error adding favorite',
    });
  }
};

// =============================================================================
// @desc    Remove item from user's favorites / unbookmark (Feature 21)
// @route   DELETE /api/favorites/:itemId
// @access  Protected
// Uses MongoDB $pull to remove item ID from the favorites array
// =============================================================================

exports.removeFavorite = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    // $pull: MongoDB operator that removes all instances of a value from an array
    // No need to load the full user document — just target the array element
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { favorites: itemId } }, // Remove itemId from the favorites array
      { returnDocument: 'after' }
    );

    res.status(200).json({
      success: true,
      message: 'Item removed from favorites',
      isFavorite: false,
      favoritesCount: updatedUser.favorites.length, // Updated count after removal
    });
  } catch (error) {
    console.error('[RemoveFavorite Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error removing favorite',
    });
  }
};

// =============================================================================
// @desc    Get all favorited items of logged-in user (Feature 21)
// @route   GET /api/favorites
// @access  Protected
// Uses nested .populate() to get full item details AND the item's donor details
// =============================================================================

exports.getFavorites = async (req, res) => {
  try {
    // Load user with favorites array populated with full item documents
    // Nested populate: favorites → item details, then item.donor → donor profile
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',          // Populate the favorites array (array of Item refs)
      populate: {
        path: 'donor',           // For each favorited item, also populate its donor
        select: 'name phone email avatar karmaPoints collegeName', // Only safe fields
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Filter out nulls (items that were deleted from DB) and admin-hidden items
    // .populate() returns null for references that no longer exist in the database
    const validFavorites = (user.favorites || []).filter(
      (item) => item && !item.isHidden // Keep only valid, visible items
    );

    // If some favorites pointed to deleted/hidden items, clean up the array in background
    // We don't await this — it's housekeeping, shouldn't delay the response
    if (validFavorites.length !== (user.favorites || []).length) {
      const validIds = validFavorites.map((i) => i._id);
      User.findByIdAndUpdate(req.user._id, { favorites: validIds }).exec(); // Background cleanup
    }

    res.status(200).json({
      success: true,
      count: validFavorites.length,
      items: validFavorites, // Array of full item objects with donor info
    });
  } catch (error) {
    console.error('[GetFavorites Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching favorites',
    });
  }
};

// =============================================================================
// @desc    Check if an item is favorited by the current user (Feature 21)
// @route   GET /api/favorites/check/:itemId
// @access  Protected
// Called by ItemDetailsScreen on load to show correct heart icon (filled/empty)
// =============================================================================

exports.checkFavorite = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID',
      });
    }

    // Only load the favorites array — no need for the full user document
    const user = await User.findById(req.user._id).select('favorites');

    // .some() checks if any element in the array matches — toString() ensures ObjectId comparison works
    const isFavorite = user && user.favorites
      ? user.favorites.some((id) => id.toString() === itemId)
      : false;

    res.status(200).json({
      success: true,
      isFavorite, // true = heart is filled, false = heart is empty
    });
  } catch (error) {
    console.error('[CheckFavorite Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error checking favorite status',
    });
  }
};
