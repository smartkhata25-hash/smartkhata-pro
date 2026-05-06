const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const archiver = require("archiver");
const { uploadToCloud } = require("./cloudBackupService");
const { BACKUP_DIR, getTempDir } = require("../config/backupPaths");
const {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
} = require("./backupProgressService");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const SOFTWARE_VERSION = "2.0";

/* =========================================================
   Collections configuration (USER BASED)
========================================================= */

const COLLECTION_CONFIG = {
  customers: { field: "createdBy" },
  accounts: { field: "userId" },
  journalentries: { field: "createdBy" },
  invoices: { field: "createdBy" },
  purchaseinvoices: { field: "userId" },
  suppliers: { field: "userId" },
  products: { field: "userId" },
  expenses: { field: "userId" },
  inventorytransactions: { field: "userId" },
};

/* =========================================================
   Ensure directories
========================================================= */

function ensureDirectories(tempDir) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

/* =========================================================
   Export USER DATA only
========================================================= */

async function exportUserDatabase(userId, tempDir) {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const db = mongoose.connection.db;

  const dump = {};

  for (const [collectionName, config] of Object.entries(COLLECTION_CONFIG)) {
    try {
      const filter = { [config.field]: new mongoose.Types.ObjectId(userId) };

      const docs = await db.collection(collectionName).find(filter).toArray();

      dump[collectionName] = docs;

      const filePath = path.join(tempDir, `${collectionName}.json`);

      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    } catch (err) {}
  }

  return dump;
}

/* =========================================================
   Create meta.json
========================================================= */

function createMeta(userId, tempDir) {
  const meta = {
    software: "SmartKhata",
    version: SOFTWARE_VERSION,
    createdAt: new Date().toISOString(),
    userId,
    database: mongoose.connection.name,
  };

  const metaFile = path.join(tempDir, "meta.json");

  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

/* =========================================================
   Create ZIP
========================================================= */

function createZip(userId, tempDir) {
  const backupFile = path.join(
    BACKUP_DIR,
    `smartkhata-backup-${userId}-${Date.now()}.zip`,
  );

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupFile);

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      const stats = fs.statSync(backupFile);

      resolve(backupFile);
    });

    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    /* add json files */
    const files = fs.readdirSync(tempDir);

    files.forEach((file) => {
      archive.file(path.join(tempDir, file), { name: file });
    });

    /* uploads */
    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, "uploads");
    }

    archive.finalize();
  });
}

/* =========================================================
   Clean temp
========================================================= */
function cleanTemp(tempDir) {
  if (!fs.existsSync(tempDir)) return;

  fs.rmSync(tempDir, { recursive: true, force: true });
}

/* =========================================================
   DELETE OLD BACKUPS (KEEP LAST 5)
========================================================= */

function deleteOldBackups(userId, limit = 5) {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.includes(`smartkhata-backup-${userId}`))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      return {
        file,
        path: filePath,
        created: stats.mtime,
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  if (files.length <= limit) return;

  const filesToDelete = files.slice(limit);

  filesToDelete.forEach((file) => {
    fs.unlinkSync(file.path);
  });
}
/* =========================================================
   Create Backup (MAIN)
========================================================= */

async function createBackup(userId, options = {}) {
  try {
    // 🚀 INIT
    initProgress(userId, "backup");

    const operationId = `backup-${userId}-${Date.now()}`;

    const tempDir = getTempDir(operationId);

    ensureDirectories(tempDir);
    updateProgress(userId, 10, "Preparing backup...");

    // 📦 Export data
    await exportUserDatabase(userId, tempDir);
    updateProgress(userId, 40, "Exporting data...");

    // 🧾 Meta
    createMeta(userId, tempDir);
    updateProgress(userId, 55, "Creating metadata...");

    // 🗜️ Zip
    const backupFile = await createZip(userId, tempDir);
    updateProgress(userId, 75, "Compressing files...");

    // ☁️ Upload
    if (!options.skipCloudUpload) {
      await uploadToCloud(backupFile, userId);
      updateProgress(userId, 90, "Uploading to cloud...");
    }

    // 🧹 Clean
    cleanTemp(tempDir);
    deleteOldBackups(userId, 5);

    // ✅ Done
    completeProgress(userId, "Backup completed");

    return {
      success: true,
      path: backupFile,
      message: "Backup created successfully",
    };
  } catch (error) {
    console.error("❌ Backup failed:", error);

    failProgress(userId, "Backup failed");

    return {
      success: false,
      message: error.message,
    };
  }
}

/* =========================================================
   Backup Status
========================================================= */

function getBackupStatus() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return {
      exists: false,
      lastBackup: null,
      size: 0,
    };
  }

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      return {
        file,
        size: stats.size,
        created: stats.mtime,
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  if (files.length === 0) {
    return {
      exists: false,
      lastBackup: null,
      size: 0,
    };
  }

  const latest = files[0];

  return {
    exists: true,
    lastBackup: latest.created,
    size: latest.size,
    file: latest.file,
  };
}

module.exports = {
  createBackup,
  getBackupStatus,
};
