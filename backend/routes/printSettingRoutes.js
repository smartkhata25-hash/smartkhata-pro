const express = require("express");
const router = express.Router();
const {
  getPrintSetting,
  updatePrintSetting,
  resetPrintSetting,
} = require("../controllers/printSettingController");

const authMiddleware = require("../middleware/authMiddleware");

// ✅ Get Settings
router.get("/", authMiddleware, getPrintSetting);

// ✅ Update Settings
router.put("/:type", authMiddleware, updatePrintSetting);

// ✅ Reset Settings (NEW)
router.put("/reset/:type", authMiddleware, resetPrintSetting);

module.exports = router;
