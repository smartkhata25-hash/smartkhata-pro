const path = require("path");
const os = require("os");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const BASE_DIR = IS_PRODUCTION
  ? path.join(os.tmpdir(), "SmartKhata")
  : path.join(os.homedir(), "Documents", "SmartKhata");

const BACKUP_DIR = path.join(BASE_DIR, "Backups");

const TEMP_DIR = path.join(BACKUP_DIR, "temp");

function sanitizeOperationId(operationId) {
  const value = String(operationId || "").trim();

  if (!value) {
    throw new Error("Backup operation ID is required");
  }

  const safeValue = value.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (!safeValue) {
    throw new Error("Invalid backup operation ID");
  }

  return safeValue;
}

function getTempDir(operationId) {
  const safeOperationId = sanitizeOperationId(operationId);

  return path.join(TEMP_DIR, safeOperationId);
}

module.exports = {
  BASE_DIR,
  BACKUP_DIR,
  TEMP_DIR,
  getTempDir,
};
