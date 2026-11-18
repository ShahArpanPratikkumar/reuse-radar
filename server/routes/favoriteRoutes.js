const express = require('express');
const router = express.Router();
const {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
} = require('../controllers/favoriteController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getFavorites);
router.post('/:itemId', addFavorite);
router.delete('/:itemId', removeFavorite);
router.get('/check/:itemId', checkFavorite);

module.exports = router;
