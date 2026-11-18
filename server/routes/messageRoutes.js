const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getMessages,
  getConversations,
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Inbox — must be declared before the two-segment :itemId/:otherUserId route
router.get('/conversations', protect, getConversations);

router.post('/', protect, sendMessage);
router.get('/:itemId/:otherUserId', protect, getMessages);

module.exports = router;
