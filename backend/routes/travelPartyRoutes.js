const express = require("express");

const {
  createParty,
  deleteParty,
  getParties,
  getPartyById,
  getPartyDataVersion,
  restoreParty,
  updateParty,
} = require("../controllers/partyController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");
const { MODULE_SCOPES } = require("../utils/moduleScope");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL), (req, res, next) => {
  req.partyModuleScope = MODULE_SCOPES.TRAVEL;
  next();
});

router.get(
  "/",
  requirePermission("travel.parties.view", "travel.parties.manage"),
  getParties,
);

router.get(
  "/data-version",
  requirePermission("travel.parties.view", "travel.parties.manage"),
  getPartyDataVersion,
);

router.post("/", requirePermission("travel.parties.manage"), createParty);

router.post("/:id/restore", requirePermission("travel.parties.manage"), restoreParty);

router.get(
  "/:id",
  requirePermission("travel.parties.view", "travel.parties.manage"),
  getPartyById,
);

router.put("/:id", requirePermission("travel.parties.manage"), updateParty);

router.delete("/:id", requirePermission("travel.parties.manage"), deleteParty);

module.exports = router;
