const express = require("express");

const ctrl = require("../controllers/travel/travelServiceController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get("/", requirePermission("travel.services.view"), ctrl.getTravelServices);
router.post(
  "/",
  requirePermission("travel.services.manage"),
  ctrl.createTravelService,
);
router.put(
  "/:id",
  requirePermission("travel.services.manage"),
  ctrl.updateTravelService,
);
router.patch(
  "/:id/status",
  requirePermission("travel.services.manage"),
  ctrl.updateTravelServiceStatus,
);
router.delete(
  "/:id",
  requirePermission("travel.services.manage"),
  ctrl.deleteTravelService,
);

module.exports = router;
