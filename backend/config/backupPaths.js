const path = require("path");
const os = require("os");

const BASE_DIR =
  process.env.NODE_ENV === "production"
    ? "/tmp"
    : path.join(os.homedir(), "Documents", "SmartKhata");

const BACKUP_DIR = path.join(BASE_DIR, "Backups");

/* =====================================================
   CREATE UNIQUE TEMP DIR
===================================================== */

function getTempDir(operationId) {
  return path.join(BACKUP_DIR, "temp", operationId);
}

module.exports = {
  BASE_DIR,
  BACKUP_DIR,
  getTempDir,
};
