const express = require('express');
const router = express.Router();
const {
  createRequest,
  getIncomingRequests,
  getOutgoingRequests,
  respondToRequest,
  cancelRequest,
  completeRequest,
  markReturned,
} = require('../controllers/requestController');
const { protect, requireActiveUser } = require('../middleware/authMiddleware');

router.post('/', protect, requireActiveUser, createRequest);
router.get('/incoming', protect, getIncomingRequests);
router.get('/outgoing', protect, getOutgoingRequests);
router.put('/:id/respond', protect, requireActiveUser, respondToRequest);
router.put('/:id/cancel', protect, requireActiveUser, cancelRequest);
router.post('/:id/complete', protect, requireActiveUser, completeRequest);
router.post('/:id/return', protect, requireActiveUser, markReturned);

module.exports = router;
