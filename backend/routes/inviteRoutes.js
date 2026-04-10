const express = require("express");
const router = express.Router();

const { generateCode } = require("../controllers/inviteController");
const authMiddleware = require("../middleware/authMiddleware");

// 🔐 صرف logged-in user (بعد میں admin restriction add کریں گے)
router.post("/generate", authMiddleware, generateCode);

module.exports = router;
