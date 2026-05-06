const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = "uploads/temp-backups";

// create folder if missing
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname);

    const fileName = `backup-${Date.now()}${ext}`;

    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() !== ".zip") {
    return cb(new Error("Only ZIP backup files are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 500,
  },
});

module.exports = upload;
