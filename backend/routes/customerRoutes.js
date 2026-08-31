const express = require("express");
const router = express.Router();

const {
  getCustomers,
  getTravelCustomers,
  getCustomerDataVersion,
  addCustomer,
  addTravelCustomer,
  deleteTravelCustomer,
  updateTravelCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  confirmMergeCustomers,
  convertCustomerToParty,
  getCustomerDetailedLedger,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

// Get All Customers
router.get("/", protect, requirePermission("customers.view"), getCustomers);

router.get(
  "/travel-options",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission(
    "travel.bookings.view",
    "travel.bookings.create",
    "travel.customers",
    "travel.payments",
  ),
  getTravelCustomers,
);

router.get(
  "/data-version",
  protect,
  requirePermission("customers.view"),
  getCustomerDataVersion,
);

// Add Customer
router.post("/", protect, requirePermission("customers.create"), addCustomer);

router.post(
  "/travel-quick-add",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.bookings.create"),
  addTravelCustomer,
);

router.put(
  "/travel-options/:id",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.bookings.create", "travel.customers"),
  updateTravelCustomer,
);

router.delete(
  "/travel-options/:id",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.bookings.create", "travel.customers"),
  deleteTravelCustomer,
);

// Confirm Customer Merge
router.post(
  "/merge/confirm",
  protect,
  requirePermission("customers.merge"),
  confirmMergeCustomers,
);

// Restore Hidden Customer
router.post(
  "/:id/restore",
  protect,
  requirePermission("customers.restore"),
  restoreCustomer,
);

// Convert Customer To Party
router.post(
  "/:id/convert-to-party",
  protect,
  requirePermission("customers.convert"),
  convertCustomerToParty,
);

// Customer Detailed Ledger
router.get(
  "/:id/detailed-ledger",
  protect,
  requirePermission("customers.view_ledger"),
  getCustomerDetailedLedger,
);

// Update Customer
router.put(
  "/:id",
  protect,
  requirePermission("customers.edit"),
  updateCustomer,
);

// Delete Customer
router.delete(
  "/:id",
  protect,
  requirePermission("customers.delete"),
  deleteCustomer,
);

module.exports = router;
