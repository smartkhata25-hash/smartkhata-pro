const express = require("express");

const ctrl = require("../controllers/travel/travelerController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get("/", requirePermission("travel.travelers.view"), ctrl.getTravelers);
router.post(
  "/",
  requirePermission("travel.travelers.manage"),
  ctrl.createTraveler,
);
router.put(
  "/:id",
  requirePermission("travel.travelers.manage"),
  ctrl.updateTraveler,
);
router.patch(
  "/:id/status",
  requirePermission("travel.travelers.manage"),
  ctrl.updateTravelerStatus,
);
router.delete(
  "/:id",
  requirePermission("travel.travelers.manage"),
  ctrl.deleteTraveler,
);

module.exports = router;
