const express = require('express');
const router = express.Router();
const {
  reportItem,
  reportUser,
  getMyReports,
} = require('../controllers/reportController');
const { protect, requireActiveUser } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/item/:itemId', requireActiveUser, reportItem);
router.post('/user/:userId', requireActiveUser, reportUser);
router.get('/my-reports', getMyReports);

module.exports = router;
