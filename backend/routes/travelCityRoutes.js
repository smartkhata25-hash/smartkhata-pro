const express = require("express");
const ctrl = require("../controllers/travel/travelCityController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();
router.use(protect, requireModule(MODULE_KEYS.TRAVEL));
router.get("/", requirePermission("travel.hotels.view"), ctrl.getTravelCities);
router.post("/", requirePermission("travel.hotels.manage"), ctrl.createTravelCity);
router.put("/:id", requirePermission("travel.hotels.manage"), ctrl.updateTravelCity);
router.patch("/:id/status", requirePermission("travel.hotels.manage"), ctrl.updateTravelCityStatus);
router.delete("/:id", requirePermission("travel.hotels.manage"), ctrl.deleteTravelCity);

module.exports = router;
