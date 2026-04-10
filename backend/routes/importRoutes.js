const express = require("express");
const router = express.Router();

const {
  importCustomers,
  importSuppliers,
  importProducts,
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
   📥 IMPORT ROUTES (WITH PREVIEW SUPPORT)
========================================================= */

// 👉 Customers
router.post(
  "/customers",
  protect,
  upload.single("file"),
  validateFile,
  importCustomers,
);

// 👉 Suppliers
router.post(
  "/suppliers",
  protect,
  upload.single("file"),
  validateFile,
  importSuppliers,
);

// 👉 Products
router.post(
  "/products",
  protect,
  upload.single("file"),
  validateFile,
  importProducts,
);

module.exports = router;
