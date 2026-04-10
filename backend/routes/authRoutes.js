const express = require("express");

// ✅ controllers
const {
  registerUser,
  loginUser,
  forgotPassword,
  verifyOtp,
  resetPassword,
  checkDeviceAuth,
  deactivateDevice,
  activateDevice,
  getAllUsers,
} = require("../controllers/authController");

// ✅ middleware (🔥 اوپر لے آئے)
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ================= AUTH =================
router.post("/register", registerUser);
router.post("/login", loginUser);

// ================= FORGOT PASSWORD =================
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

// ================= DEVICE =================
router.get("/check-device", checkDeviceAuth);

// ✅ admin protected routes
router.post("/deactivate-device", authMiddleware, deactivateDevice);
router.post("/activate-device", authMiddleware, activateDevice);

// ================= ADMIN =================
router.get("/admin/users", authMiddleware, getAllUsers);

module.exports = router;
