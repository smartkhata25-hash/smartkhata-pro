const express = require("express");
const router = express.Router();

const ctrl = require("../controllers/supplierController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

// تمام Supplier Routes محفوظ کریں
router.use(protect);

// Get All Suppliers
router.get("/", requirePermission("suppliers.view"), ctrl.getSuppliers);

// Travel vendor view reuses Supplier accounting records with Travel permissions.
router.get(
  "/travel-vendors",
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.vendors.view", "travel.payments"),
  ctrl.getTravelVendors,
);

router.post(
  "/travel-vendors",
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.vendors.manage"),
  ctrl.createTravelVendor,
);

router.put(
  "/travel-vendors/:id",
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.vendors.manage"),
  ctrl.updateSupplierTravelMetadata,
);

router.delete(
  "/travel-vendors/:id",
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.vendors.manage"),
  ctrl.deleteTravelVendor,
);

// Create Supplier
router.post("/", requirePermission("suppliers.create"), ctrl.createSupplier);

// Import Suppliers
router.post(
  "/import",
  requirePermission("suppliers.import"),
  upload.single("file"),
  ctrl.importSuppliers,
);

// Confirm Supplier Merge
router.post(
  "/merge/confirm",
  requirePermission("suppliers.merge"),
  ctrl.confirmMergeSupplier,
);

// Convert Supplier To Party
router.post(
  "/:id/convert-to-party",
  requirePermission("suppliers.convert"),
  ctrl.convertSupplierToParty,
);

// Restore Hidden Supplier
router.post(
  "/:id/restore",
  requirePermission("suppliers.restore"),
  ctrl.restoreSupplier,
);

// Supplier Detailed Ledger
router.get(
  "/:id/detailed-ledger",
  requirePermission("suppliers.view_ledger"),
  ctrl.getSupplierDetailedLedger,
);

// Update Supplier
router.put("/:id", requirePermission("suppliers.edit"), ctrl.updateSupplier);

// Delete Supplier
router.delete(
  "/:id",
  requirePermission("suppliers.delete"),
  ctrl.deleteSupplier,
);

module.exports = router;
