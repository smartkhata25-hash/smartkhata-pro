const express = require("express");

const ctrl = require("../controllers/travel/travelHotelController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get("/", requirePermission("travel.hotels.view"), ctrl.getTravelHotels);
router.post(
  "/",
  requirePermission("travel.hotels.manage"),
  ctrl.createTravelHotel,
);
router.put(
  "/:id",
  requirePermission("travel.hotels.manage"),
  ctrl.updateTravelHotel,
);
router.patch(
  "/:id/status",
  requirePermission("travel.hotels.manage"),
  ctrl.updateTravelHotelStatus,
);
router.delete(
  "/:id",
  requirePermission("travel.hotels.manage"),
  ctrl.deleteTravelHotel,
);

module.exports = router;
