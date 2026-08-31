const express = require("express");

const ctrl = require("../controllers/travelCurrencyController");
const { protect } = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get("/", requirePermission("travel.settings"), ctrl.getTravelCurrencySettings);
router.put("/", requirePermission("travel.settings"), ctrl.updateTravelCurrencySettings);

module.exports = router;
