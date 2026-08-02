const express = require("express");

const router = express.Router();

const {
  getProductPerformanceReport,
  getProductPerformanceDetails,
} = require("../controllers/productPerformanceController");

const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const {
  validateProductPerformanceQuery,
  validateProductPerformanceProductId,
} = require("../validators/productPerformanceValidator");

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.REPORTS.PRODUCT_PERFORMANCE),
  validateProductPerformanceQuery,
  getProductPerformanceReport,
);

// 🔍 GET SINGLE PRODUCT PERFORMANCE DETAILS

router.get(
  "/:productId/details",
  protect,
  requirePermission(PERMISSIONS.REPORTS.PRODUCT_PERFORMANCE),
  validateProductPerformanceProductId,
  getProductPerformanceDetails,
);

module.exports = router;
