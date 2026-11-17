const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  getPublicProfile,
  updateProfile,
  updatePushToken,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/avatarUpload');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/users/:id/public-profile', getPublicProfile);
router.put('/profile', protect, uploadAvatar, updateProfile);
router.put('/push-token', protect, updatePushToken);

module.exports = router;
