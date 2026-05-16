// 📂 backend/routes/agingRoutes.js

const express = require("express");
const router = express.Router();
const { getAgingReport } = require("../controllers/agingController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getAgingReport);

module.exports = router;
