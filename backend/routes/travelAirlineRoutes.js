const express = require("express");

const ctrl = require("../controllers/travel/travelAirlineController");

const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/",
  requirePermission("travel.airlines.view"),
  ctrl.getTravelAirlines,
);

router.get(
  "/:id",
  requirePermission("travel.airlines.view"),
  ctrl.getTravelAirlineById,
);

router.post(
  "/",
  requirePermission("travel.airlines.manage"),
  ctrl.createTravelAirline,
);

router.put(
  "/:id",
  requirePermission("travel.airlines.manage"),
  ctrl.updateTravelAirline,
);

router.patch(
  "/:id/status",
  requirePermission("travel.airlines.manage"),
  ctrl.updateTravelAirlineStatus,
);

router.delete(
  "/:id",
  requirePermission("travel.airlines.manage"),
  ctrl.deleteTravelAirline,
);

router.patch(
  "/:id/restore",
  requirePermission("travel.airlines.manage"),
  ctrl.restoreTravelAirline,
);

module.exports = router;
