const express = require('express');
const router = express.Router();
const {
  createWishlist,
  getWishlistFeed,
  getMyWishlists,
  updateWishlistStatus,
  deleteWishlist,
} = require('../controllers/wishlistController');
const { protect, requireActiveUser } = require('../middleware/authMiddleware');

router.get('/', getWishlistFeed);
router.get('/my', protect, getMyWishlists);
router.post('/', protect, requireActiveUser, createWishlist);
router.patch('/:id/status', protect, requireActiveUser, updateWishlistStatus);
router.delete('/:id', protect, requireActiveUser, deleteWishlist);

module.exports = router;
