const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  createParty,
  getParties,
  getPartyDataVersion,
  getPartyById,
  updateParty,
  deleteParty,
  restoreParty,
  convertPartyToCustomer,
  convertPartyToSupplier,
} = require("../controllers/partyController");

// تمام Routes محفوظ کریں
router.use(protect);

// Get All Parties
router.get("/", requirePermission("parties.view"), getParties);

router.get(
  "/data-version",
  requirePermission("parties.view"),
  getPartyDataVersion,
);

// Create Party
router.post("/", requirePermission("parties.create"), createParty);

// Convert Party To Customer
router.post(
  "/:id/convert-to-customer",
  requirePermission("parties.convert"),
  convertPartyToCustomer,
);

// Convert Party To Supplier
router.post(
  "/:id/convert-to-supplier",
  requirePermission("parties.convert"),
  convertPartyToSupplier,
);

// Restore Hidden Party
router.post("/:id/restore", requirePermission("parties.restore"), restoreParty);

// Get Single Party
router.get("/:id", requirePermission("parties.view"), getPartyById);

// Update Party
router.put("/:id", requirePermission("parties.edit"), updateParty);

// Delete Party
router.delete("/:id", requirePermission("parties.delete"), deleteParty);

module.exports = router;
