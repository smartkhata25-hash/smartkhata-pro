const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDir = path.resolve(__dirname, "../../uploads/temp-backups");

const MAX_BACKUP_SIZE = 500 * 1024 * 1024;

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },

  filename(req, file, cb) {
    const uniqueId = crypto.randomBytes(12).toString("hex");

    cb(null, `backup-${Date.now()}-${uniqueId}.zip`);
  },
});

const fileFilter = (req, file, cb) => {
  const originalName = String(file.originalname || "").trim();

  if (!originalName) {
    return cb(new Error("Backup file name is missing"));
  }

  const ext = path.extname(originalName).toLowerCase();

  if (ext !== ".zip") {
    return cb(new Error("Only ZIP backup files are allowed"));
  }

  const allowedMimeTypes = new Set([
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
  ]);

  if (file.mimetype && !allowedMimeTypes.has(file.mimetype.toLowerCase())) {
    return cb(new Error("Invalid ZIP backup file type"));
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: MAX_BACKUP_SIZE,
    files: 1,
    fields: 10,
    parts: 11,
  },
});

module.exports = upload;
