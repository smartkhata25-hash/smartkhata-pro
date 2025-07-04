const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  savePersonalInfo,
  saveBusinessInfo
  // آپ کے دیگر controller functions یہاں add ہو سکتے ہیں
} = require('../controllers/userController');

// ✅ Existing routes (اگر کوئی اور ہے تو رکھیں)

// ✅ Personal Info Save
router.post('/personal-info', authMiddleware, savePersonalInfo);

// ✅ Business Info Save
router.post('/business-info', authMiddleware, saveBusinessInfo);

// ✅ Add other routes here as needed...

module.exports = router;
