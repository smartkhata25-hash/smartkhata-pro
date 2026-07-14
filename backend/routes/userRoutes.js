const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { ownerOnly } = require("../middleware/permissionMiddleware");

const {
  savePersonalInfo,
  saveBusinessInfo,
  getProfile,
} = require("../controllers/userController");

// Personal Info
router.post("/personal-info", authMiddleware, ownerOnly, savePersonalInfo);

// Business Info
router.post("/business-info", authMiddleware, ownerOnly, saveBusinessInfo);

// Profile (Owner & Staff)
router.get("/profile", authMiddleware, getProfile);

module.exports = router;
