const express = require("express");

const ctrl = require("../controllers/travel/travelServiceCategoryController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/",
  requirePermission("travel.services.view"),
  ctrl.getTravelServiceCategories,
);
router.post(
  "/",
  requirePermission("travel.services.manage"),
  ctrl.createTravelServiceCategory,
);
router.put(
  "/:id",
  requirePermission("travel.services.manage"),
  ctrl.updateTravelServiceCategory,
);
router.patch(
  "/:id/status",
  requirePermission("travel.services.manage"),
  ctrl.updateTravelServiceCategoryStatus,
);
router.delete(
  "/:id",
  requirePermission("travel.services.manage"),
  ctrl.deleteTravelServiceCategory,
);

module.exports = router;
