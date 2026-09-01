const express = require("express");

const {
  getWhatsAppTemplate,
  updateWhatsAppTemplate,
} = require("../controllers/whatsAppTemplateController");

const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.get("/:moduleScope", protect, getWhatsAppTemplate);

router.put(
  "/trading",
  protect,
  requirePermission("settings.print"),
  (req, res) => {
    req.params.moduleScope = "trading";
    return updateWhatsAppTemplate(req, res);
  },
);

router.put(
  "/travel",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.settings"),
  (req, res) => {
    req.params.moduleScope = "travel";
    return updateWhatsAppTemplate(req, res);
  },
);

module.exports = router;
