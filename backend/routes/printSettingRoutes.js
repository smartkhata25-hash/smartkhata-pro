const express = require("express");
const router = express.Router();
const {
  getPrintSetting,
  updatePrintSetting,
  resetPrintSetting,
  uploadPrintLogo,
  removePrintLogo,
} = require("../controllers/printSettingController");

const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

// ✅ Get Settings
router.get("/", authMiddleware, getPrintSetting);

// ✅ Update Settings
router.put("/:type", authMiddleware, updatePrintSetting);

// ✅ Reset Settings (NEW)
router.put("/reset/:type", authMiddleware, resetPrintSetting);

router.post("/:type/logo", authMiddleware, upload.single("logo"), uploadPrintLogo);
router.delete("/:type/logo", authMiddleware, removePrintLogo);

module.exports = router;
