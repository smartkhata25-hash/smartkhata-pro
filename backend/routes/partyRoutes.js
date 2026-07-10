const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  createParty,
  getParties,
  getPartyById,
  updateParty,
  deleteParty,
  restoreParty,
  convertPartyToCustomer,
  convertPartyToSupplier,
} = require("../controllers/partyController");

// PARTY ROUTES

// ✅ Protect all party routes
router.use(protect);

// ✅ Get all parties / Create party
router.route("/").get(getParties).post(createParty);

// ✅ Convert Party
router.post("/:id/convert-to-customer", convertPartyToCustomer);
router.post("/:id/convert-to-supplier", convertPartyToSupplier);

// ✅ Restore hidden party
router.post("/:id/restore", restoreParty);

// ✅ Get single / Update / Delete party
router.route("/:id").get(getPartyById).put(updateParty).delete(deleteParty);

module.exports = router;
