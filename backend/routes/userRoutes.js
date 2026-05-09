const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  savePersonalInfo,
  saveBusinessInfo,
  getProfile,
} = require("../controllers/userController");

// ✅ Existing routes (اگر کوئی اور ہے تو رکھیں)

// ✅ Personal Info Save
router.post("/personal-info", authMiddleware, savePersonalInfo);

// ✅ Business Info Save
router.post("/business-info", authMiddleware, saveBusinessInfo);

router.get("/profile", authMiddleware, getProfile);

module.exports = router;
