const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const controller = require("../controllers/businessValueController");

// Business Value Options (Presets + Components)
router.get(
  "/options",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_VALUE.VIEW),
  controller.getBusinessValueOptions,
);

// Business Value Summary
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_VALUE.VIEW),
  controller.getBusinessValue,
);

module.exports = router;
