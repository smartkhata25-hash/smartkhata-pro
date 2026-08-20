const express = require("express");
const router = express.Router();

const {
  getCustomers,
  getCustomerDataVersion,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  confirmMergeCustomers,
  convertCustomerToParty,
  getCustomerDetailedLedger,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

// Get All Customers
router.get("/", protect, requirePermission("customers.view"), getCustomers);

router.get(
  "/data-version",
  protect,
  requirePermission("customers.view"),
  getCustomerDataVersion,
);

// Add Customer
router.post("/", protect, requirePermission("customers.create"), addCustomer);

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
