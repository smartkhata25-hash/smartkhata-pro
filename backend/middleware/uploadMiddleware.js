const multer = require("multer");

/* =====================================================
   MEMORY STORAGE
===================================================== */

const storage = multer.memoryStorage();

/* =====================================================
   FILE FILTER
===================================================== */

const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Only JPG, JPEG, PNG, WEBP and PDF files are allowed"));
  }

  cb(null, true);
};

/* =====================================================
   MULTER INSTANCE
===================================================== */

const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = upload;
