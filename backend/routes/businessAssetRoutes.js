const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const controller = require("../controllers/businessAssetController");

// Default Asset Titles
router.get(
  "/titles",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.VIEW),
  controller.getAssetTitles,
);

// All Assets
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.VIEW),
  controller.getAssets,
);

// Single Asset
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.VIEW),
  controller.getAssetById,
);

// Create Asset
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.CREATE),
  controller.createAsset,
);

// Update Asset
router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.EDIT),
  controller.updateAsset,
);

// Restore Asset
router.patch(
  "/:id/restore",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.DELETE),
  controller.restoreAsset,
);

// Delete Asset
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.DELETE),
  controller.deleteAsset,
);

module.exports = router;
