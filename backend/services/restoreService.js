const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mongoose = require("mongoose");
const unzipper = require("unzipper");

const { createBackup, COLLECTION_CONFIG } = require("./backupService");

const { downloadBackupFromCloud } = require("./cloudListService");

const { BACKUP_DIR, getTempDir } = require("../config/backupPaths");

const {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
} = require("./backupProgressService");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const MIN_BACKUP_SCHEMA_VERSION = 2;

const MODEL_LOADERS = {
  accounts: () => require("../models/Account"),
  customers: () => require("../models/Customer"),
  suppliers: () => require("../models/Supplier"),
  parties: () => require("../models/Party"),
  employeedesignations: () => require("../models/EmployeeDesignation"),
  employees: () => require("../models/Employee"),
  employeepayrolls: () => require("../models/EmployeePayroll"),
  employeeadvanceloans: () => require("../models/EmployeeAdvanceLoan"),
  travelers: () => require("../models/Traveler"),
  travelservicecategories: () => require("../models/TravelServiceCategory"),
  travelservices: () => require("../models/TravelService"),
  travelhotels: () => require("../models/TravelHotel"),
  travelcurrencysettings: () => require("../models/TravelCurrencySetting"),
  travelbookings: () => require("../models/TravelBooking"),
  travelrefunds: () => require("../models/TravelRefund"),
  travelvendorreturns: () => require("../models/TravelVendorReturn"),
  travelreminders: () => require("../models/TravelReminder"),

  activitylogs: () => require("../models/ActivityLog"),

  categories: () => require("../models/Category"),
  products: () => require("../models/Product"),
  inventorytransactions: () => require("../models/InventoryTransaction"),

  invoices: () => require("../models/Invoice"),
  purchaseinvoices: () => require("../models/PurchaseInvoice"),
  refundinvoices: () => require("../models/RefundInvoice"),
  purchasereturns: () => require("../models/PurchaseReturn"),

  receivepayments: () => require("../models/ReceivePayment"),
  paybills: () => require("../models/PayBill"),

  expenses: () => require("../models/Expense"),
  expensetitles: () => require("../models/ExpenseTitle"),

  journalentries: () => require("../models/JournalEntry"),

  counters: () => require("../models/Counter"),
  periodlocks: () => require("../models/PeriodLock"),

  businessassetcategories: () => require("../models/BusinessAssetCategory"),

  businessassets: () => require("../models/BusinessAsset"),

  businessliabilities: () => require("../models/BusinessLiability"),

  businessliabilitypayments: () =>
    require("../models/BusinessLiabilityPayment"),

  businessreceivableloans: () => require("../models/BusinessReceivableLoan"),

  businessreceivableloanpayments: () =>
    require("../models/BusinessReceivableLoanPayment"),
};
const RESTORE_ORDER = Object.keys(COLLECTION_CONFIG);

function ensureDirectories() {
  fs.mkdirSync(BACKUP_DIR, {
    recursive: true,
  });

  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true,
  });
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

function calculateBufferHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getRegularBackupRegex(userId) {
  const safeUserId = String(userId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`^smartkhata-backup-${safeUserId}-\\d+\\.zip$`);
}

function getLatestBackup(userId) {
  if (!fs.existsSync(BACKUP_DIR)) {
    throw new Error("No local backups found");
  }

  const regex = getRegularBackupRegex(userId);

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

  if (files.length === 0) {
    throw new Error("No verified local backup found");
  }

  return files[0].path;
}

function isSafeArchivePath(entryPath) {
  if (!entryPath || typeof entryPath !== "string") {
    return false;
  }

  const normalized = entryPath.replace(/\\/g, "/");

  if (
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized.includes("..\\") ||
    path.isAbsolute(normalized)
  ) {
    return false;
  }

  return true;
}

function findUniqueEntry(directory, entryName) {
  const matches = directory.files.filter((file) => file.path === entryName);

  if (matches.length !== 1) {
    throw new Error(
      `Backup validation failed: ${entryName} is missing or duplicated`,
    );
  }

  return matches[0];
}

async function readJsonEntry(entry, label) {
  try {
    const buffer = await entry.buffer();

    return {
      buffer,
      data: JSON.parse(buffer.toString("utf8")),
    };
  } catch (error) {
    throw new Error(`Backup validation failed: invalid ${label}`);
  }
}

async function validateBackupArchive(zipFile, expectedUserId) {
  if (!zipFile || !fs.existsSync(zipFile)) {
    throw new Error("Backup ZIP not found");
  }

  const stats = fs.statSync(zipFile);

  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("Backup ZIP is empty or invalid");
  }

  let directory;

  try {
    directory = await unzipper.Open.file(zipFile);
  } catch (error) {
    throw new Error("Backup ZIP is corrupt or unreadable");
  }

  if (!directory.files || directory.files.length === 0) {
    throw new Error("Backup ZIP is empty");
  }

  if (directory.files.length > 1000) {
    throw new Error("Backup ZIP contains too many files");
  }

  for (const entry of directory.files) {
    if (!isSafeArchivePath(entry.path)) {
      throw new Error("Backup ZIP contains an unsafe file path");
    }
  }

  const metaEntry = findUniqueEntry(directory, "meta.json");

  const manifestEntry = findUniqueEntry(directory, "manifest.json");

  const { data: meta } = await readJsonEntry(metaEntry, "meta.json");

  const { data: manifest } = await readJsonEntry(
    manifestEntry,
    "manifest.json",
  );

  if (meta.software !== "SmartKhata") {
    throw new Error("This is not a SmartKhata backup");
  }

  if (String(meta.userId) !== String(expectedUserId)) {
    throw new Error("This backup belongs to another business/user");
  }

  const schemaVersion = Number(
    meta.backupSchemaVersion || manifest.schemaVersion || 0,
  );

  if (schemaVersion < MIN_BACKUP_SCHEMA_VERSION) {
    throw new Error(
      "This is an old unverified backup format. Create a new verified backup before restore.",
    );
  }

  if (!manifest.collections || typeof manifest.collections !== "object") {
    throw new Error("Backup manifest is missing or invalid");
  }

  for (const collectionName of RESTORE_ORDER) {
    const config = COLLECTION_CONFIG[collectionName];

    const info = manifest.collections[collectionName];

    if (config?.required && !info) {
      throw new Error(`Required backup data missing: ${collectionName}`);
    }

    if (!info) {
      continue;
    }

    const expectedFile = `${collectionName}.json`;

    if (info.file !== expectedFile) {
      throw new Error(`Invalid manifest file for ${collectionName}`);
    }

    const entry = findUniqueEntry(directory, expectedFile);

    const buffer = await entry.buffer();

    const hash = calculateBufferHash(buffer);

    if (hash !== info.sha256) {
      throw new Error(`Backup checksum failed: ${collectionName}`);
    }

    let docs;

    try {
      docs = JSON.parse(buffer.toString("utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON data: ${collectionName}`);
    }

    if (!Array.isArray(docs)) {
      throw new Error(`Invalid collection data: ${collectionName}`);
    }

    if (docs.length !== Number(info.count || 0)) {
      throw new Error(`Backup count mismatch: ${collectionName}`);
    }
  }

  const localUploads = Array.isArray(manifest.localUploads)
    ? manifest.localUploads
    : [];

  for (const fileName of localUploads) {
    const safeName = path.basename(String(fileName));

    if (safeName !== fileName || !safeName) {
      throw new Error("Backup contains invalid upload metadata");
    }

    findUniqueEntry(directory, `uploads/${safeName}`);
  }

  return {
    meta,
    manifest,
    size: stats.size,
  };
}

async function readBackupCollection(zipFile, collectionName, manifest) {
  const info = manifest.collections[collectionName];

  if (!info) {
    return [];
  }

  const directory = await unzipper.Open.file(zipFile);

  const entry = findUniqueEntry(directory, info.file);

  const buffer = await entry.buffer();

  if (calculateBufferHash(buffer) !== info.sha256) {
    throw new Error(`Checksum failed during restore: ${collectionName}`);
  }

  let docs;

  try {
    docs = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON during restore: ${collectionName}`);
  }

  if (!Array.isArray(docs) || docs.length !== Number(info.count || 0)) {
    throw new Error(
      `Document count mismatch during restore: ${collectionName}`,
    );
  }

  return docs;
}

function castDocuments(collectionName, docs, userId) {
  const loader = MODEL_LOADERS[collectionName];

  if (!loader) {
    throw new Error(`No restore model configured for ${collectionName}`);
  }

  const Model = loader();

  const objectUserId = new mongoose.Types.ObjectId(String(userId));

  return docs.map((rawDoc) => {
    const prepared = {
      ...rawDoc,
    };

    const config = COLLECTION_CONFIG[collectionName];

    if (
      config?.field === "userId" ||
      Object.prototype.hasOwnProperty.call(prepared, "userId")
    ) {
      prepared.userId = objectUserId;
    }

    if (
      config?.field === "createdBy" ||
      Object.prototype.hasOwnProperty.call(prepared, "createdBy")
    ) {
      prepared.createdBy = objectUserId;
    }

    if (Object.prototype.hasOwnProperty.call(prepared, "updatedBy")) {
      prepared.updatedBy = objectUserId;
    }

    const hydrated = Model.hydrate(prepared);

    const validationError = hydrated.validateSync();

    if (validationError) {
      throw new Error(
        `Invalid ${collectionName} backup data: ${validationError.message}`,
      );
    }

    return hydrated.toObject({
      depopulate: true,
      virtuals: false,
      getters: false,
      minimize: false,
      versionKey: true,
    });
  });
}

async function assertTransactionSupport() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }

  const hello = await mongoose.connection.db.admin().command({
    hello: 1,
  });

  const transactionSupported =
    Boolean(hello.setName) || hello.msg === "isdbgrid";

  if (!transactionSupported) {
    throw new Error(
      "Safe restore requires MongoDB transaction support. Restore cancelled before changing live data.",
    );
  }
}

async function restoreDatabase(userId, zipFile, manifest) {
  const db = mongoose.connection.db;

  const objectUserId = new mongoose.Types.ObjectId(String(userId));

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(
      async () => {
        for (let index = 0; index < RESTORE_ORDER.length; index += 1) {
          const collectionName = RESTORE_ORDER[index];

          const config = COLLECTION_CONFIG[collectionName];

          const docs = await readBackupCollection(
            zipFile,
            collectionName,
            manifest,
          );

          const castedDocs = castDocuments(collectionName, docs, userId);

          const collection = db.collection(collectionName);

          const filter = {
            [config.field]: objectUserId,
          };

          await collection.deleteMany(filter, {
            session,
          });

          if (castedDocs.length > 0) {
            await collection.insertMany(castedDocs, {
              session,
              ordered: true,
            });
          }

          const restoredCount = await collection.countDocuments(filter, {
            session,
          });

          if (restoredCount !== docs.length) {
            throw new Error(
              `Restore verification failed for ${collectionName}`,
            );
          }

          const progress =
            55 + Math.round(((index + 1) / RESTORE_ORDER.length) * 25);

          updateProgress(
            userId,
            Math.min(progress, 80),
            `Restoring ${collectionName}...`,
          );
        }
      },
      {
        readConcern: {
          level: "snapshot",
        },
        writeConcern: {
          w: "majority",
        },
      },
    );
  } finally {
    await session.endSession();
  }
}

async function verifyRestoredDatabase(userId, manifest) {
  const db = mongoose.connection.db;

  const objectUserId = new mongoose.Types.ObjectId(String(userId));

  for (const collectionName of RESTORE_ORDER) {
    const config = COLLECTION_CONFIG[collectionName];

    const expected = Number(manifest.collections[collectionName]?.count || 0);

    const actual = await db.collection(collectionName).countDocuments({
      [config.field]: objectUserId,
    });

    if (actual !== expected) {
      throw new Error(
        `Final restore verification failed for ${collectionName}. Expected ${expected}, found ${actual}.`,
      );
    }
  }
}

async function restoreLocalUploads(zipFile, manifest) {
  const files = Array.isArray(manifest.localUploads)
    ? manifest.localUploads
    : [];

  if (files.length === 0) {
    return;
  }

  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true,
  });

  const directory = await unzipper.Open.file(zipFile);

  for (const fileName of files) {
    const safeName = path.basename(fileName);

    if (safeName !== fileName || !safeName) {
      throw new Error("Unsafe upload filename found in backup");
    }

    const entry = findUniqueEntry(directory, `uploads/${safeName}`);

    const finalPath = path.join(UPLOADS_DIR, safeName);

    const resolvedBase = path.resolve(UPLOADS_DIR);

    const resolvedFinal = path.resolve(finalPath);

    if (!resolvedFinal.startsWith(`${resolvedBase}${path.sep}`)) {
      throw new Error("Unsafe upload restore path");
    }

    const temporaryPath = `${finalPath}.restore-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`;

    const buffer = await entry.buffer();

    fs.writeFileSync(temporaryPath, buffer);

    fs.renameSync(temporaryPath, finalPath);
  }
}

async function resolveRestoreSource(userId, source = null) {
  if (source && typeof source === "object" && source.localFilePath) {
    const localFilePath = path.resolve(source.localFilePath);

    if (!fs.existsSync(localFilePath)) {
      throw new Error("Selected backup file not found");
    }

    return {
      path: localFilePath,
      cleanup: false,
      source: "local-file",
    };
  }

  const cloudFileName =
    typeof source === "string" ? source : source?.fileName || null;

  if (cloudFileName) {
    const downloaded = await downloadBackupFromCloud(userId, cloudFileName);

    if (!downloaded.success) {
      throw new Error(downloaded.message || "Failed to download cloud backup");
    }

    return {
      path: downloaded.path,
      cleanup: true,
      source: "cloud",
    };
  }

  return {
    path: getLatestBackup(userId),
    cleanup: false,
    source: "local-latest",
  };
}

async function rollbackFromSafetyBackup(userId, safetyBackupPath) {
  if (!safetyBackupPath || !fs.existsSync(safetyBackupPath)) {
    throw new Error("Safety backup unavailable");
  }

  const validation = await validateBackupArchive(safetyBackupPath, userId);

  await restoreDatabase(userId, safetyBackupPath, validation.manifest);

  await verifyRestoredDatabase(userId, validation.manifest);

  await restoreLocalUploads(safetyBackupPath, validation.manifest);
}

async function restoreBackup(userId, source = null) {
  let safetyBackupPath = null;
  let restoreSource = null;

  const operationId = `restore-${userId}-${Date.now()}`;

  const tempDir = getTempDir(operationId);

  let databaseCommitted = false;

  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      throw new Error("Invalid user ID");
    }

    initProgress(userId, "restore");

    updateProgress(userId, 5, "Preparing restore...");

    ensureDirectories();

    cleanTemp(tempDir);

    fs.mkdirSync(tempDir, {
      recursive: true,
    });

    // Never touch live data without transaction support
    await assertTransactionSupport();

    updateProgress(userId, 10, "Creating safety backup...");

    const safetyBackup = await createBackup(userId, {
      skipCloudUpload: true,
      backupType: "safety",
      trackProgress: false,
    });

    if (!safetyBackup.success) {
      throw new Error(`Safety backup failed: ${safetyBackup.message}`);
    }

    safetyBackupPath = safetyBackup.path;

    await validateBackupArchive(safetyBackupPath, userId);

    updateProgress(userId, 20, "Safety backup verified");

    restoreSource = await resolveRestoreSource(userId, source);

    updateProgress(
      userId,
      30,
      restoreSource.source === "cloud"
        ? "Cloud backup downloaded"
        : "Backup selected",
    );

    const validation = await validateBackupArchive(restoreSource.path, userId);

    updateProgress(userId, 45, "Backup fully verified");

    await restoreDatabase(userId, restoreSource.path, validation.manifest);

    databaseCommitted = true;

    updateProgress(userId, 82, "Verifying restored data...");

    await verifyRestoredDatabase(userId, validation.manifest);

    updateProgress(userId, 90, "Restoring local files...");

    await restoreLocalUploads(restoreSource.path, validation.manifest);

    updateProgress(userId, 97, "Finalizing restore...");

    completeProgress(userId, "Restore completed and verified");

    console.log("✅ Backup restored and verified successfully");

    return {
      success: true,
      verified: true,
      source: restoreSource.source,
      message: "Backup restored and verified successfully",
    };
  } catch (error) {
    console.error("❌ Restore failed:", error.message);

    let rollbackAttempted = false;
    let rollbackSucceeded = false;
    let rollbackErrorMessage = null;

    /*
      Transaction failure before commit means MongoDB
      already kept old live data unchanged.
    */
    if (databaseCommitted && safetyBackupPath) {
      rollbackAttempted = true;

      try {
        console.log("🔄 Restoring safety backup...");

        await rollbackFromSafetyBackup(userId, safetyBackupPath);

        rollbackSucceeded = true;

        console.log("✅ Safety rollback completed");
      } catch (rollbackError) {
        rollbackErrorMessage = rollbackError.message;

        console.error(
          "❌ CRITICAL: Safety rollback failed:",
          rollbackError.message,
        );
      }
    }

    const finalMessage = rollbackAttempted
      ? rollbackSucceeded
        ? `Restore failed, but original data was restored safely. Reason: ${error.message}`
        : `CRITICAL: Restore failed and automatic rollback also failed. Reason: ${error.message}. Rollback error: ${rollbackErrorMessage}`
      : `Restore cancelled safely before live data was changed. Reason: ${error.message}`;

    failProgress(userId, finalMessage);

    return {
      success: false,
      rollbackAttempted,
      rollbackSucceeded,
      critical: rollbackAttempted && !rollbackSucceeded,
      message: finalMessage,
    };
  } finally {
    try {
      cleanTemp(tempDir);
    } catch (error) {
      console.error("❌ Restore temp cleanup failed:", error.message);
    }

    try {
      if (
        restoreSource?.cleanup &&
        restoreSource.path &&
        fs.existsSync(restoreSource.path)
      ) {
        fs.unlinkSync(restoreSource.path);
      }
    } catch (error) {
      console.error("❌ Downloaded backup cleanup failed:", error.message);
    }
  }
}

module.exports = {
  restoreBackup,
};
