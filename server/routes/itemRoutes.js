const express = require('express');
const router = express.Router();
const {
  createItem,
  getItems,
  getNearbyItems,
  getItemById,
  getMyItems,
  updateItem,
  deleteItem,
  toggleItemStatus,
} = require('../controllers/itemController');
const { protect, requireActiveUser, upload } = require('../middleware/authMiddleware');

// Wrap multer so an oversized photo set returns a clean 400 instead of a 500.
const itemUpload = (req, res, next) => {
  upload.array('images', 5)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT'
            ? 'You can upload a maximum of 5 photos per listing'
            : error.message || 'Image upload failed',
      });
    }
    return next();
  });
};

router.get('/', getItems);
router.get('/nearby', getNearbyItems);
router.get('/user/my-items', protect, getMyItems);
router.get('/:id', getItemById);

router.post('/', protect, requireActiveUser, itemUpload, createItem);
router.put('/:id', protect, requireActiveUser, itemUpload, updateItem);
router.delete('/:id', protect, requireActiveUser, deleteItem);
router.patch('/:id/toggle-status', protect, requireActiveUser, toggleItemStatus);

module.exports = router;
