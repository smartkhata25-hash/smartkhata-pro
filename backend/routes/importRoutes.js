const express = require("express");
const router = express.Router();

const {
  importCustomers,
  importSuppliers,
  importProducts,
  getImportProgress,
} = require("../controllers/importController");

const upload = require("../middleware/upload");
const { protect } = require("../middleware/authMiddleware");

/* =========================================================
   🔐 FILE VALIDATION MIDDLEWARE
========================================================= */

const validateFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      message: "File is required",
    });
  }

  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ];

  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      message: "Only Excel (.xlsx) or CSV files are allowed",
    });
  }

  next();
};

/* =========================================================
   🧠 CONDITIONAL UPLOAD MIDDLEWARE
   (صرف preview میں file آئے گی)
========================================================= */

const handleUploadIfPreview = (req, res, next) => {
  if (req.query.preview === "true") {
    return upload.single("file")(req, res, (err) => {
      if (err) return next(err);
      return validateFile(req, res, next);
    });
  }
  next();
};

/* =========================================================
   📥 IMPORT ROUTES
========================================================= */

// 👉 Customers
router.post("/customers", protect, handleUploadIfPreview, importCustomers);

// 👉 Suppliers
router.post("/suppliers", protect, handleUploadIfPreview, importSuppliers);

// 👉 Products
router.post("/products", protect, handleUploadIfPreview, importProducts);

// 📊 Progress
router.get("/progress/:jobId", protect, getImportProgress);

module.exports = router;
