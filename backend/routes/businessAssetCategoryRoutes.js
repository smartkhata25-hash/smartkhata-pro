const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const controller = require("../controllers/businessAssetCategoryController");

// تمام Categories
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.VIEW),
  controller.getCategories,
);

// ایک Category
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.VIEW),
  controller.getCategoryById,
);

// نئی Category
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.MANAGE_CATEGORIES),
  controller.createCategory,
);

// Category Update
router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.MANAGE_CATEGORIES),
  controller.updateCategory,
);

// Deleted Category Restore
router.patch(
  "/:id/restore",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.MANAGE_CATEGORIES),
  controller.restoreCategory,
);

// Category Delete
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_ASSETS.MANAGE_CATEGORIES),
  controller.deleteCategory,
);

module.exports = router;
