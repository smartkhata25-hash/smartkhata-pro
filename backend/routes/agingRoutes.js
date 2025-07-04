// 📂 backend/routes/agingRoutes.js

const express = require('express');
const router = express.Router();
const { getAgingReport } = require('../controllers/agingController');
const { protect } = require('../middleware/authMiddleware'); // ✅ make sure authMiddleware exists

// ✅ GET /api/aging?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get('/', protect, getAgingReport);

module.exports = router;
