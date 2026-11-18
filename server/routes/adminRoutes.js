const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  updateReport,
  toggleHideItem,
  toggleSuspendUser,
  getAdminStats,
} = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// All admin routes require valid token and admin role
router.use(protect);
router.use(requireAdmin);

router.get('/reports', getReports);
router.get('/reports/:id', getReportById);
router.put('/reports/:id', updateReport);
router.post('/items/:itemId/hide', toggleHideItem);
router.post('/users/:userId/suspend', toggleSuspendUser);
router.get('/stats', getAdminStats);

module.exports = router;
