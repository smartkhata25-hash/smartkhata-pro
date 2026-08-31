const express = require("express");
const ctrl = require("../controllers/travel/travelAirportController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/",
  requirePermission("travel.airports.view"),
  ctrl.getTravelAirports,
);

router.get(
  "/:id",
  requirePermission("travel.airports.view"),
  ctrl.getTravelAirportById,
);

router.post(
  "/",
  requirePermission("travel.airports.manage"),
  ctrl.createTravelAirport,
);

router.put(
  "/:id",
  requirePermission("travel.airports.manage"),
  ctrl.updateTravelAirport,
);

router.patch(
  "/:id/status",
  requirePermission("travel.airports.manage"),
  ctrl.updateTravelAirportStatus,
);

router.delete(
  "/:id",
  requirePermission("travel.airports.manage"),
  ctrl.deleteTravelAirport,
);

router.patch(
  "/:id/restore",
  requirePermission("travel.airports.manage"),
  ctrl.restoreTravelAirport,
);

module.exports = router;
