const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getMessages,
  getConversations,
  deleteMessage,
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Inbox — must be declared before the two-segment :itemId/:otherUserId route
router.get('/conversations', protect, getConversations);

router.post('/', protect, sendMessage);
router.get('/:itemId/:otherUserId', protect, getMessages);
router.delete('/:messageId', protect, deleteMessage);

module.exports = router;
