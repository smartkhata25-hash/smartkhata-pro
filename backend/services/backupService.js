const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mongoose = require("mongoose");
const archiver = require("archiver");
const unzipper = require("unzipper");

const { uploadToCloud } = require("./cloudBackupService");
const { BACKUP_DIR, getTempDir } = require("../config/backupPaths");

const {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
} = require("./backupProgressService");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const SOFTWARE_VERSION = "2.1";
const BACKUP_SCHEMA_VERSION = 2;

const COLLECTION_CONFIG = {
  accounts: { field: "userId", required: true },

  customers: { field: "createdBy", required: true },
  suppliers: { field: "userId", required: true },
  parties: { field: "userId", required: true },
  travelers: { field: "userId", required: false },
  travelservicecategories: { field: "userId", required: false },
  travelservices: { field: "userId", required: false },
  travelhotels: { field: "userId", required: false },
  travelcurrencysettings: { field: "userId", required: false },
  travelbookings: { field: "userId", required: false },
  travelrefunds: { field: "userId", required: false },
  travelvendorreturns: { field: "userId", required: false },

  categories: { field: "userId", required: true },
  products: { field: "userId", required: true },
  inventorytransactions: { field: "userId", required: true },

  invoices: { field: "createdBy", required: true },
  purchaseinvoices: { field: "userId", required: true },
  refundinvoices: { field: "createdBy", required: true },
  purchasereturns: { field: "createdBy", required: true },

  receivepayments: { field: "userId", required: true },
  paybills: { field: "userId", required: true },

  expenses: { field: "userId", required: true },
  expensetitles: { field: "userId", required: true },

  journalentries: { field: "createdBy", required: true },

  counters: { field: "userId", required: true },
  periodlocks: { field: "userId", required: true },

  businessassetcategories: { field: "userId", required: true },
  businessassets: { field: "userId", required: true },

  businessliabilities: { field: "userId", required: true },
  businessliabilitypayments: { field: "userId", required: true },

  businessreceivableloans: { field: "userId", required: true },
  businessreceivableloanpayments: {
    field: "userId",
    required: true,
  },
};

function ensureDirectories(tempDir) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(tempPath, JSON.stringify(data), "utf8");
  fs.renameSync(tempPath, filePath);
}

function calculateFileHash(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function exportUserDatabase(userId, tempDir) {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }

  const db = mongoose.connection.db;
  const objectUserId = new mongoose.Types.ObjectId(userId);

  const dump = {};
  const stats = {};

  for (const [collectionName, config] of Object.entries(COLLECTION_CONFIG)) {
    try {
      const filter = {
        [config.field]: objectUserId,
      };

      const docs = await db.collection(collectionName).find(filter).toArray();

      dump[collectionName] = docs;

      const fileName = `${collectionName}.json`;
      const filePath = path.join(tempDir, fileName);

      writeJsonAtomic(filePath, docs);

      const fileStats = fs.statSync(filePath);

      stats[collectionName] = {
        file: fileName,
        count: docs.length,
        bytes: fileStats.size,
        sha256: calculateFileHash(filePath),
        required: config.required === true,
      };
    } catch (error) {
      throw new Error(`Failed to export ${collectionName}: ${error.message}`);
    }
  }

  return {
    dump,
    stats,
  };
}

function copyReferencedLocalUploads(data, tempDir) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    return [];
  }

  const foundFiles = new Set();

  const inspect = (value, keyName = "") => {
    if (Array.isArray(value)) {
      value.forEach((item) => inspect(item, keyName));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        inspect(child, key);
      });
      return;
    }

    if (typeof value !== "string" || !value.trim()) {
      return;
    }

    const relevantKeys = ["attachment", "attachmenturl", "key", "url"];

    if (!relevantKeys.includes(String(keyName).toLowerCase())) {
      return;
    }

    const candidate = value.trim();

    if (
      candidate.startsWith("users/") ||
      candidate.startsWith("http://") ||
      candidate.startsWith("https://")
    ) {
      return;
    }

    const fileName = path.basename(candidate);

    if (!fileName || fileName === "." || fileName === "..") {
      return;
    }

    const sourcePath = path.join(UPLOADS_DIR, fileName);

    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()) {
      foundFiles.add(fileName);
    }
  };

  inspect(data);

  if (foundFiles.size === 0) {
    return [];
  }

  const destinationDir = path.join(tempDir, "uploads");

  fs.mkdirSync(destinationDir, { recursive: true });

  for (const fileName of foundFiles) {
    const sourcePath = path.join(UPLOADS_DIR, fileName);
    const destinationPath = path.join(destinationDir, fileName);

    fs.copyFileSync(sourcePath, destinationPath);
  }

  return [...foundFiles];
}

function createManifest(userId, tempDir, collectionStats, localUploads) {
  const totalDocuments = Object.values(collectionStats).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  );

  const manifest = {
    software: "SmartKhata",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    userId: String(userId),
    collections: collectionStats,
    totalCollections: Object.keys(collectionStats).length,
    totalDocuments,
    localUploads: localUploads || [],
  };

  writeJsonAtomic(path.join(tempDir, "manifest.json"), manifest);

  return manifest;
}

function createMeta(userId, tempDir, backupType, manifest) {
  const meta = {
    software: "SmartKhata",
    version: SOFTWARE_VERSION,
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    backupType,
    createdAt: new Date().toISOString(),
    userId: String(userId),
    database: mongoose.connection.name,
    manifest: "manifest.json",
    totalCollections: manifest.totalCollections,
    totalDocuments: manifest.totalDocuments,
  };

  writeJsonAtomic(path.join(tempDir, "meta.json"), meta);
}

function validateExportBeforeZip(tempDir, manifest) {
  if (!manifest?.collections) {
    throw new Error("Backup manifest is missing");
  }

  for (const [collectionName, info] of Object.entries(manifest.collections)) {
    const filePath = path.join(tempDir, info.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Backup validation failed: ${collectionName} file is missing`,
      );
    }

    const raw = fs.readFileSync(filePath, "utf8");

    let docs;

    try {
      docs = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Backup validation failed: ${collectionName} JSON is invalid`,
      );
    }

    if (!Array.isArray(docs)) {
      throw new Error(
        `Backup validation failed: ${collectionName} is not an array`,
      );
    }

    if (docs.length !== info.count) {
      throw new Error(
        `Backup validation failed: ${collectionName} document count mismatch`,
      );
    }

    const currentHash = calculateFileHash(filePath);

    if (currentHash !== info.sha256) {
      throw new Error(
        `Backup validation failed: ${collectionName} checksum mismatch`,
      );
    }
  }

  return true;
}

function getBackupFileName(userId, backupType) {
  const timestamp = Date.now();

  if (backupType === "safety") {
    return `smartkhata-safety-backup-${userId}-${timestamp}.zip`;
  }

  return `smartkhata-backup-${userId}-${timestamp}.zip`;
}

function createZip(userId, tempDir, backupType) {
  const fileName = getBackupFileName(userId, backupType);

  const finalPath = path.join(BACKUP_DIR, fileName);
  const partialPath = `${finalPath}.partial`;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(partialPath);

    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;

      try {
        if (fs.existsSync(partialPath)) {
          fs.unlinkSync(partialPath);
        }
      } catch (_) {}

      reject(error);
    };

    output.on("error", fail);
    archive.on("error", fail);

    archive.on("warning", (error) => {
      fail(error);
    });

    output.on("close", () => {
      if (settled) return;

      try {
        if (!fs.existsSync(partialPath)) {
          throw new Error("Backup ZIP was not created");
        }

        const stats = fs.statSync(partialPath);

        if (stats.size <= 0) {
          throw new Error("Backup ZIP is empty");
        }

        fs.renameSync(partialPath, finalPath);

        settled = true;
        resolve(finalPath);
      } catch (error) {
        fail(error);
      }
    });

    archive.pipe(output);
    archive.directory(tempDir, false);
    archive.finalize();
  });
}

async function validateCreatedZip(zipFile, expectedUserId) {
  if (!fs.existsSync(zipFile)) {
    throw new Error("Backup ZIP not found after creation");
  }

  const zipStats = fs.statSync(zipFile);

  if (!zipStats.isFile() || zipStats.size <= 0) {
    throw new Error("Backup ZIP is empty or invalid");
  }

  const directory = await unzipper.Open.file(zipFile);

  const metaEntry = directory.files.find((file) => file.path === "meta.json");

  const manifestEntry = directory.files.find(
    (file) => file.path === "manifest.json",
  );

  if (!metaEntry || !manifestEntry) {
    throw new Error("Backup ZIP validation failed: metadata is missing");
  }

  const meta = JSON.parse((await metaEntry.buffer()).toString("utf8"));

  const manifest = JSON.parse((await manifestEntry.buffer()).toString("utf8"));

  if (meta.software !== "SmartKhata") {
    throw new Error("Backup ZIP is not a SmartKhata backup");
  }

  if (String(meta.userId) !== String(expectedUserId)) {
    throw new Error("Backup ZIP belongs to a different user");
  }

  if (!manifest.collections) {
    throw new Error("Backup ZIP manifest is invalid");
  }

  for (const [collectionName, info] of Object.entries(manifest.collections)) {
    const entry = directory.files.find((file) => file.path === info.file);

    if (!entry) {
      throw new Error(
        `Backup ZIP validation failed: ${collectionName} is missing`,
      );
    }

    const buffer = await entry.buffer();

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    if (hash !== info.sha256) {
      throw new Error(
        `Backup ZIP validation failed: ${collectionName} checksum mismatch`,
      );
    }

    let docs;

    try {
      docs = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      throw new Error(
        `Backup ZIP validation failed: ${collectionName} JSON is corrupt`,
      );
    }

    if (!Array.isArray(docs) || docs.length !== info.count) {
      throw new Error(
        `Backup ZIP validation failed: ${collectionName} count mismatch`,
      );
    }
  }

  return {
    valid: true,
    size: zipStats.size,
    manifest,
  };
}

function cleanTemp(tempDir) {
  if (!tempDir || !fs.existsSync(tempDir)) {
    return;
  }

  fs.rmSync(tempDir, {
    recursive: true,
    force: true,
  });
}

function getRegularBackupRegex(userId) {
  const safeUserId = String(userId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^smartkhata-backup-${safeUserId}-\\d+\\.zip$`);
}

function getSafetyBackupRegex(userId) {
  const safeUserId = String(userId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^smartkhata-safety-backup-${safeUserId}-\\d+\\.zip$`);
}

function deleteOldMatchingBackups(regex, limit) {
  if (!fs.existsSync(BACKUP_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => regex.test(file))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      return {
        file,
        path: filePath,
        created: stats.mtime,
      };
    })
    .sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    );

  if (files.length <= limit) {
    return;
  }

  for (const file of files.slice(limit)) {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error("❌ Old backup cleanup failed:", file.file, error.message);
    }
  }
}

function deleteOldBackups(userId, limit = 5) {
  deleteOldMatchingBackups(getRegularBackupRegex(userId), limit);
}

function deleteOldSafetyBackups(userId, limit = 2) {
  deleteOldMatchingBackups(getSafetyBackupRegex(userId), limit);
}

async function createBackup(userId, options = {}) {
  let tempDir = null;

  const trackProgress = options.trackProgress !== false;

  const backupType =
    options.backupType || (options.skipCloudUpload ? "safety" : "regular");

  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    if (trackProgress) {
      initProgress(userId, "backup");
      updateProgress(userId, 5, "Preparing backup...");
    }

    const operationId = [
      backupType,
      userId,
      Date.now(),
      Math.random().toString(36).substring(2, 8),
    ].join("-");

    tempDir = getTempDir(operationId);

    ensureDirectories(tempDir);

    if (trackProgress) {
      updateProgress(userId, 15, "Exporting database...");
    }

    const { dump, stats } = await exportUserDatabase(userId, tempDir);

    if (trackProgress) {
      updateProgress(userId, 45, "Preparing backup files...");
    }

    const localUploads = copyReferencedLocalUploads(dump, tempDir);

    const manifest = createManifest(userId, tempDir, stats, localUploads);

    createMeta(userId, tempDir, backupType, manifest);

    validateExportBeforeZip(tempDir, manifest);

    if (trackProgress) {
      updateProgress(userId, 60, "Creating backup ZIP...");
    }

    const backupFile = await createZip(userId, tempDir, backupType);

    if (trackProgress) {
      updateProgress(userId, 75, "Verifying backup...");
    }

    const validation = await validateCreatedZip(backupFile, userId);

    let cloudUploaded = false;

    if (!options.skipCloudUpload) {
      if (trackProgress) {
        updateProgress(userId, 85, "Uploading to cloud...");
      }

      await uploadToCloud(backupFile, userId);

      cloudUploaded = true;
    }

    if (backupType === "regular") {
      deleteOldBackups(userId, 5);
    } else {
      deleteOldSafetyBackups(userId, 2);
    }

    if (trackProgress) {
      completeProgress(
        userId,
        options.skipCloudUpload
          ? "Safety backup completed"
          : "Backup completed",
      );
    }

    return {
      success: true,
      path: backupFile,
      file: path.basename(backupFile),
      backupType,
      cloudUploaded,
      size: validation.size,
      collections: validation.manifest.totalCollections,
      documents: validation.manifest.totalDocuments,
      message: options.skipCloudUpload
        ? "Safety backup created successfully"
        : "Backup created and verified successfully",
    };
  } catch (error) {
    console.error("❌ Backup failed:", error);

    if (trackProgress) {
      failProgress(userId, error.message || "Backup failed");
    }

    return {
      success: false,
      message: error.message || "Backup failed",
    };
  } finally {
    try {
      if (tempDir) {
        cleanTemp(tempDir);
      }
    } catch (error) {
      console.error("❌ Backup temp cleanup failed:", error.message);
    }
  }
}

function getBackupStatus(userId = null) {
  if (!fs.existsSync(BACKUP_DIR)) {
    return {
      exists: false,
      lastBackup: null,
      size: 0,
      file: null,
    };
  }

  let files = fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => file.endsWith(".zip"));

  if (userId) {
    const regex = getRegularBackupRegex(userId);
    files = files.filter((file) => regex.test(file));
  } else {
    files = files.filter((file) =>
      /^smartkhata-backup-.+-\d+\.zip$/.test(file),
    );
  }

  const backupFiles = files
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);

      try {
        const stats = fs.statSync(filePath);

        return {
          file,
          size: stats.size,
          created: stats.mtime,
        };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    );

  if (backupFiles.length === 0) {
    return {
      exists: false,
      lastBackup: null,
      size: 0,
      file: null,
    };
  }

  const latest = backupFiles[0];

  return {
    exists: true,
    lastBackup: latest.created,
    size: latest.size,
    file: latest.file,
    type: "local",
    verified: true,
  };
}

module.exports = {
  createBackup,
  getBackupStatus,
  COLLECTION_CONFIG,
};
