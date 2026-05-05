const fs = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "../../backups");
const { getCloudBackupList } = require("../cloudListService");

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

async function shouldShowBackupReminder() {
  try {
    // 💻 Local backup check
    const localLast = getLastBackupTime();

    let localOk = false;

    if (localLast) {
      const diffHours = (new Date() - new Date(localLast)) / (1000 * 60 * 60);

      if (diffHours <= 24) {
        localOk = true;
      }
    }

    // ☁️ Cloud backup check
    let cloudOk = false;

    try {
      const cloud = await getCloudBackupList();

      if (cloud.success && cloud.files.length > 0) {
        const latest = cloud.files[0].lastModified;

        const diffHours = (new Date() - new Date(latest)) / (1000 * 60 * 60);

        if (diffHours <= 24) {
          cloudOk = true;
        }
      }
    } catch (err) {
      console.log("Cloud check failed");
    }

    return !(localOk || cloudOk);
  } catch (error) {
    console.error("Reminder check error:", error);
    return true;
  }
}

module.exports = {
  shouldShowBackupReminder,
};
