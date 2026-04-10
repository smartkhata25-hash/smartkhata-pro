const fs = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "../../backups");

/* =====================================================
   CHECK LAST BACKUP TIME
===================================================== */

function getLastBackupTime() {
  if (!fs.existsSync(BACKUP_DIR)) return null;

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      return stats.mtime;
    })
    .sort((a, b) => new Date(b) - new Date(a));

  return files[0] || null;
}

/* =====================================================
   SHOULD SHOW REMINDER
===================================================== */

function shouldShowBackupReminder() {
  const lastBackup = getLastBackupTime();

  if (!lastBackup) return true;

  const now = new Date();
  const last = new Date(lastBackup);

  const diffHours = (now - last) / (1000 * 60 * 60);

  return diffHours > 24;
}

module.exports = {
  shouldShowBackupReminder,
};
