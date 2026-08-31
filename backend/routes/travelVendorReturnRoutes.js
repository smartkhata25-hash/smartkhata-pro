const express = require("express");

const ctrl = require("../controllers/travel/travelVendorReturnController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/eligible-invoices",
  requirePermission("travel.vendors.view", "travel.bookings.view"),
  ctrl.getTravelVendorReturnInvoices,
);

router.get(
  "/",
  requirePermission("travel.vendors.view"),
  ctrl.getTravelVendorReturns,
);

router.post(
  "/",
  requirePermission("travel.vendors.manage"),
  upload.array("attachments", 3),
  ctrl.createTravelVendorReturn,
);

router.get(
  "/:id",
  requirePermission("travel.vendors.view"),
  ctrl.getTravelVendorReturnById,
);

router.delete(
  "/:id",
  requirePermission("travel.vendors.manage"),
  ctrl.reverseTravelVendorReturn,
);

module.exports = router;
