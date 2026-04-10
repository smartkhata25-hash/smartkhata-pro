const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const archiver = require("archiver");
const { uploadToCloud } = require("./cloudBackupService");

const BACKUP_DIR = path.join(
  os.homedir(),
  "Documents",
  "SmartKhata",
  "Backups",
);
const TEMP_DIR = path.join(BACKUP_DIR, "temp");
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

function ensureDirectories() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/* =========================================================
   Export USER DATA only
========================================================= */

async function exportUserDatabase(userId) {
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

      const filePath = path.join(TEMP_DIR, `${collectionName}.json`);

      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    } catch (err) {}
  }

  return dump;
}

/* =========================================================
   Create meta.json
========================================================= */

function createMeta(userId) {
  const meta = {
    software: "SmartKhata",
    version: SOFTWARE_VERSION,
    createdAt: new Date().toISOString(),
    userId,
    database: mongoose.connection.name,
  };

  const metaFile = path.join(TEMP_DIR, "meta.json");

  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

/* =========================================================
   Create ZIP
========================================================= */

function createZip(userId) {
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
    const files = fs.readdirSync(TEMP_DIR);

    files.forEach((file) => {
      archive.file(path.join(TEMP_DIR, file), { name: file });
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

function cleanTemp() {
  if (!fs.existsSync(TEMP_DIR)) return;

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
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

async function createBackup(userId) {
  try {
    ensureDirectories();

    await exportUserDatabase(userId);

    createMeta(userId);

    const backupFile = await createZip(userId);
    await uploadToCloud(backupFile);

    cleanTemp();
    deleteOldBackups(userId, 5);

    return {
      success: true,
      path: backupFile,
      message: "Backup created successfully",
    };
  } catch (error) {
    console.error("❌ Backup failed:", error);

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
