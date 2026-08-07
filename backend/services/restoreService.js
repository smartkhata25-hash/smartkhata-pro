const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const unzipper = require("unzipper");

const { createBackup } = require("./backupService");
const { downloadBackupFromCloud } = require("./cloudListService");

const { BACKUP_DIR, getTempDir } = require("../config/backupPaths");

const {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
} = require("./backupProgressService");

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
  businessassetcategories: { field: "userId" },
  businessassets: { field: "userId" },
  businessliabilities: { field: "userId" },
  businessliabilitypayments: { field: "userId" },
};

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const RESTORE_ORDER = [
  "accounts",
  "customers",
  "suppliers",
  "products",
  "invoices",
  "purchaseinvoices",
  "journalentries",
  "expenses",
  "inventorytransactions",
  "businessassetcategories",
  "businessassets",
  "businessliabilities",
  "businessliabilitypayments",
];

function createAccountIdMap() {
  return {};
}

function createAssetCategoryIdMap() {
  return {};
}

function createBusinessLiabilityIdMap() {
  return {};
}

function createJournalIdMap() {
  return {};
}

function ensureDirectories(tempDir) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

function getLatestBackup(userId) {
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

  if (files.length === 0) {
    throw new Error("No backup files found");
  }

  return files[0].path;
}

function getBackupByName(fileName) {
  const filePath = path.join(BACKUP_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error("Backup file not found");
  }

  return filePath;
}

async function extractBackup(zipFile, tempDir) {
  await fs
    .createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: tempDir }))
    .promise();
}

async function restoreAccounts(userId, docs, accountIdMap) {
  const db = mongoose.connection.db;

  const collection = db.collection("accounts");

  await collection.deleteMany({ userId });

  for (const doc of docs) {
    const oldId = doc._id;

    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);

    const inserted = await collection.insertOne(newDoc);

    const newId = inserted.insertedId;

    accountIdMap[oldId] = newId;
  }
}

async function restoreCustomers(userId, docs, accountIdMap) {
  const db = mongoose.connection.db;

  const collection = db.collection("customers");

  await collection.deleteMany({ createdBy: userId });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.createdBy = new mongoose.Types.ObjectId(userId);

    if (newDoc.account && accountIdMap[newDoc.account]) {
      newDoc.account = accountIdMap[newDoc.account];
    }

    return newDoc;
  });

  await collection.insertMany(fixedDocs);
}

async function restoreSuppliers(userId, docs, accountIdMap) {
  const db = mongoose.connection.db;

  const collection = db.collection("suppliers");

  await collection.deleteMany({ userId });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);

    if (newDoc.account && accountIdMap[newDoc.account]) {
      newDoc.account = accountIdMap[newDoc.account];
    }

    return newDoc;
  });

  await collection.insertMany(fixedDocs);
}

async function restoreJournals(userId, docs, accountIdMap, journalIdMap) {
  const db = mongoose.connection.db;

  const collection = db.collection("journalentries");

  await collection.deleteMany({ createdBy: userId });

  for (const doc of docs) {
    const oldId = doc._id?.toString();

    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.createdBy = new mongoose.Types.ObjectId(userId);

    if (newDoc.lines) {
      newDoc.lines = newDoc.lines.map((line) => {
        const newLine = { ...line };

        const oldAccountId = newLine.account?.toString();

        if (oldAccountId && accountIdMap[oldAccountId]) {
          newLine.account = accountIdMap[oldAccountId];
        }

        return newLine;
      });
    }

    if (Array.isArray(newDoc.accounts)) {
      newDoc.accounts = newDoc.accounts.map((accountId) => {
        const oldAccountId = accountId?.toString();

        return accountIdMap[oldAccountId] || accountId;
      });
    }

    const inserted = await collection.insertOne(newDoc);

    if (oldId) {
      journalIdMap[oldId] = inserted.insertedId;
    }
  }
}

async function restoreBusinessAssetCategories(
  userId,
  docs,
  assetCategoryIdMap,
) {
  const collection = mongoose.connection.db.collection(
    "businessassetcategories",
  );

  await collection.deleteMany({ userId });

  for (const doc of docs) {
    const oldId = doc._id?.toString();
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);
    newDoc.createdBy = new mongoose.Types.ObjectId(userId);
    newDoc.updatedBy = new mongoose.Types.ObjectId(userId);

    const inserted = await collection.insertOne(newDoc);

    if (oldId) {
      assetCategoryIdMap[oldId] = inserted.insertedId;
    }
  }
}

async function restoreBusinessAssets(userId, docs, assetCategoryIdMap) {
  const collection = mongoose.connection.db.collection("businessassets");

  await collection.deleteMany({ userId });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);
    newDoc.createdBy = new mongoose.Types.ObjectId(userId);
    newDoc.updatedBy = new mongoose.Types.ObjectId(userId);

    const oldCategoryId = newDoc.categoryId?.toString();

    if (oldCategoryId && assetCategoryIdMap[oldCategoryId]) {
      newDoc.categoryId = assetCategoryIdMap[oldCategoryId];
    }

    return newDoc;
  });

  if (fixedDocs.length) {
    await collection.insertMany(fixedDocs);
  }
}

async function restoreBusinessLiabilities(userId, docs, liabilityIdMap) {
  const collection = mongoose.connection.db.collection("businessliabilities");

  await collection.deleteMany({ userId });

  for (const doc of docs) {
    const oldId = doc._id?.toString();

    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);

    newDoc.createdBy = new mongoose.Types.ObjectId(userId);

    newDoc.updatedBy = new mongoose.Types.ObjectId(userId);

    const inserted = await collection.insertOne(newDoc);

    if (oldId) {
      liabilityIdMap[oldId] = inserted.insertedId;
    }
  }
}

async function restoreBusinessLiabilityPayments(
  userId,
  docs,
  liabilityIdMap,
  accountIdMap,
  journalIdMap,
) {
  const collection = mongoose.connection.db.collection(
    "businessliabilitypayments",
  );

  await collection.deleteMany({ userId });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.userId = new mongoose.Types.ObjectId(userId);

    newDoc.createdBy = new mongoose.Types.ObjectId(userId);

    const oldLiabilityId = newDoc.liabilityId?.toString();

    if (oldLiabilityId && liabilityIdMap[oldLiabilityId]) {
      newDoc.liabilityId = liabilityIdMap[oldLiabilityId];
    }

    const oldAccountId = newDoc.accountId?.toString();

    if (oldAccountId && accountIdMap[oldAccountId]) {
      newDoc.accountId = accountIdMap[oldAccountId];
    }

    const oldJournalId = newDoc.journalEntryId?.toString();

    if (oldJournalId && journalIdMap[oldJournalId]) {
      newDoc.journalEntryId = journalIdMap[oldJournalId];
    } else {
      newDoc.journalEntryId = null;
    }

    const oldReversalJournalId = newDoc.reversalJournalEntryId?.toString();

    if (oldReversalJournalId && journalIdMap[oldReversalJournalId]) {
      newDoc.reversalJournalEntryId = journalIdMap[oldReversalJournalId];
    } else {
      newDoc.reversalJournalEntryId = null;
    }

    return newDoc;
  });

  if (fixedDocs.length) {
    await collection.insertMany(fixedDocs);
  }
}

async function restoreGeneric(collectionName, userId, docs) {
  const db = mongoose.connection.db;

  const collection = db.collection(collectionName);

  const filterField = COLLECTION_CONFIG[collectionName]?.field;

  await collection.deleteMany({
    [filterField]: new mongoose.Types.ObjectId(userId),
  });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    if (newDoc.createdBy) {
      newDoc.createdBy = new mongoose.Types.ObjectId(userId);
    }

    if (newDoc.userId) {
      newDoc.userId = new mongoose.Types.ObjectId(userId);
    }

    return newDoc;
  });

  await collection.insertMany(fixedDocs);
}

async function restoreCollections(userId, tempDir) {
  const accountIdMap = createAccountIdMap();

  const assetCategoryIdMap = createAssetCategoryIdMap();

  const liabilityIdMap = createBusinessLiabilityIdMap();

  const journalIdMap = createJournalIdMap();

  for (const collectionName of RESTORE_ORDER) {
    const filePath = path.join(tempDir, `${collectionName}.json`);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const raw = fs.readFileSync(filePath);

    const docs = JSON.parse(raw);

    if (!docs.length) continue;

    if (collectionName === "accounts") {
      await restoreAccounts(userId, docs, accountIdMap);
      continue;
    }

    if (collectionName === "customers") {
      await restoreCustomers(userId, docs, accountIdMap);
      continue;
    }

    if (collectionName === "suppliers") {
      await restoreSuppliers(userId, docs, accountIdMap);
      continue;
    }

    if (collectionName === "journalentries") {
      await restoreJournals(userId, docs, accountIdMap, journalIdMap);
      continue;
    }

    if (collectionName === "businessassetcategories") {
      await restoreBusinessAssetCategories(userId, docs, assetCategoryIdMap);
      continue;
    }

    if (collectionName === "businessassets") {
      await restoreBusinessAssets(userId, docs, assetCategoryIdMap);
      continue;
    }

    if (collectionName === "businessliabilities") {
      await restoreBusinessLiabilities(userId, docs, liabilityIdMap);
      continue;
    }

    if (collectionName === "businessliabilitypayments") {
      await restoreBusinessLiabilityPayments(
        userId,
        docs,
        liabilityIdMap,
        accountIdMap,
        journalIdMap,
      );
      continue;
    }

    await restoreGeneric(collectionName, userId, docs);
  }
}

function copyRecursive(src, dest) {
  const stats = fs.lstatSync(src);

  // 📁 folder
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);

    items.forEach((item) => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });

    return;
  }

  // 📄 file
  let finalDest = dest;

  if (fs.existsSync(dest)) {
    const ext = path.extname(dest);

    const name = path.basename(dest, ext);

    finalDest = path.join(
      path.dirname(dest),
      `${name}-restore-${Date.now()}${ext}`,
    );
  }

  fs.copyFileSync(src, finalDest);
}

function restoreUploads(tempDir) {
  const uploadsBackup = path.join(tempDir, "uploads");

  if (!fs.existsSync(uploadsBackup)) {
    return;
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const items = fs.readdirSync(uploadsBackup);

  items.forEach((item) => {
    copyRecursive(path.join(uploadsBackup, item), path.join(UPLOADS_DIR, item));
  });
}

function cleanTemp(tempDir) {
  if (!fs.existsSync(tempDir)) return;

  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function restoreBackup(userId, fileName = null) {
  let safetyBackupPath = null;

  const operationId = `restore-${userId}-${Date.now()}`;

  const tempDir = getTempDir(operationId);

  try {
    initProgress(userId, "restore");

    ensureDirectories(tempDir);

    cleanTemp(tempDir);

    ensureDirectories(tempDir);

    updateProgress(userId, 5, "Preparing restore...");

    console.log("🛡️ Creating safety backup before restore...");

    /* STEP 1: SAFETY BACKUP */

    const safetyBackup = await createBackup(userId, {
      skipCloudUpload: true,
    });

    if (!safetyBackup.success) {
      throw new Error("Safety backup failed. Restore cancelled.");
    }

    safetyBackupPath = safetyBackup.path;

    updateProgress(userId, 20, "Safety backup created");

    console.log("✅ Safety backup created:", safetyBackupPath);

    /* STEP 2: GET BACKUP */

    let backupFile;

    if (fileName) {
      console.log("☁️ Downloading backup from cloud...");

      updateProgress(userId, 30, "Downloading from cloud...");

      const downloaded = await downloadBackupFromCloud(userId, fileName);

      if (!downloaded.success) {
        throw new Error("Failed to download backup from cloud");
      }

      backupFile = downloaded.path;
    } else {
      backupFile = getLatestBackup(userId);
    }

    updateProgress(userId, 50, "Extracting backup...");

    /* EXTRACT */

    await extractBackup(backupFile, tempDir);

    updateProgress(userId, 70, "Restoring data...");

    /* RESTORE DATABASE */

    await restoreCollections(new mongoose.Types.ObjectId(userId), tempDir);

    /* ENSURE BASE ACCOUNTS */

    const createBaseAccountsForUser = require("../utils/createBaseAccounts");

    await createBaseAccountsForUser(userId);

    /* REPAIR ACCOUNT METADATA */

    const Account = require("../models/Account");

    await Account.updateMany(
      {
        $or: [
          { category: { $exists: false } },
          { category: null },
          { category: "" },
        ],
      },
      { $set: { category: "other" } },
    );

    await Account.updateMany(
      {
        $or: [{ type: { $exists: false } }, { type: null }, { type: "" }],
      },
      { $set: { type: "Asset" } },
    );

    updateProgress(userId, 85, "Restoring files...");

    /* RESTORE UPLOADS */

    restoreUploads(tempDir);

    cleanTemp(tempDir);

    updateProgress(userId, 95, "Finalizing...");

    completeProgress(userId, "Restore completed");

    console.log("✅ Restore successful");

    return {
      success: true,
      message: "Backup restored successfully",
    };
  } catch (error) {
    console.error("❌ Restore failed:", error.message);

    failProgress(userId, "Restore failed");

    /* ROLLBACK */

    try {
      if (safetyBackupPath) {
        console.log("🔄 Rolling back from safety backup...");

        await extractBackup(safetyBackupPath, tempDir);

        await restoreCollections(new mongoose.Types.ObjectId(userId), tempDir);

        restoreUploads(tempDir);

        cleanTemp(tempDir);

        console.log("✅ Rollback successful");
      }
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError.message);
    }

    return {
      success: false,
      message: "Restore failed but data recovered",
    };
  }
}

module.exports = {
  restoreBackup,
};
