const express = require("express");

const ctrl = require("../controllers/travel/travelPurchaseInvoiceController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requireAllPermissions } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/",
  requireAllPermissions("travel.bookings.view", "travel.vendors.view"),
  ctrl.getTravelPurchaseInvoices,
);

module.exports = router;
