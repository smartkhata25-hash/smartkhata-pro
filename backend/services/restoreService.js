const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const unzipper = require("unzipper");

/* ======================================================
COLLECTION CONFIG
====================================================== */

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

/* ======================================================
PATHS
====================================================== */

const BACKUP_DIR = path.join(__dirname, "../backups");
const TEMP_DIR = path.join(BACKUP_DIR, "temp");
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

/* ======================================================
RESTORE ORDER (RELATION SAFE)
====================================================== */

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
];

/* ======================================================
GLOBAL ID MAPS
====================================================== */

let accountIdMap = {};

/* ======================================================
ENSURE DIRECTORIES
====================================================== */

function ensureDirectories() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/* ======================================================
GET LATEST BACKUP
====================================================== */

function getLatestBackup() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
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

/* ======================================================
EXTRACT ZIP
====================================================== */

async function extractBackup(zipFile) {
  await fs
    .createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: TEMP_DIR }))
    .promise();
}

/* ======================================================
RESTORE ACCOUNTS (WITH ID MAPPING)
====================================================== */

async function restoreAccounts(userId, docs) {
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

/* ======================================================
RESTORE CUSTOMERS
====================================================== */

async function restoreCustomers(userId, docs) {
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

/* ======================================================
RESTORE SUPPLIERS
====================================================== */

async function restoreSuppliers(userId, docs) {
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

/* ======================================================
RESTORE JOURNAL ENTRIES
====================================================== */

async function restoreJournals(userId, docs) {
  const db = mongoose.connection.db;
  const collection = db.collection("journalentries");

  await collection.deleteMany({ createdBy: userId });

  const fixedDocs = docs.map((doc) => {
    const newDoc = { ...doc };

    delete newDoc._id;

    newDoc.createdBy = new mongoose.Types.ObjectId(userId);

    if (newDoc.lines) {
      newDoc.lines = newDoc.lines.map((line) => {
        const newLine = { ...line };

        if (accountIdMap[newLine.account]) {
          newLine.account = accountIdMap[newLine.account];
        }

        return newLine;
      });
    }

    return newDoc;
  });

  await collection.insertMany(fixedDocs);
}

/* ======================================================
GENERIC COLLECTION RESTORE
====================================================== */

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

/* ======================================================
RESTORE COLLECTIONS
====================================================== */

async function restoreCollections(userId) {
  const db = mongoose.connection.db;

  for (const collectionName of RESTORE_ORDER) {
    const filePath = path.join(TEMP_DIR, `${collectionName}.json`);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const raw = fs.readFileSync(filePath);
    const docs = JSON.parse(raw);

    if (!docs.length) continue;

    if (collectionName === "accounts") {
      await restoreAccounts(userId, docs);
      continue;
    }

    if (collectionName === "customers") {
      await restoreCustomers(userId, docs);
      continue;
    }

    if (collectionName === "suppliers") {
      await restoreSuppliers(userId, docs);
      continue;
    }

    if (collectionName === "journalentries") {
      await restoreJournals(userId, docs);
      continue;
    }

    await restoreGeneric(collectionName, userId, docs);
  }
}

/* ======================================================
RESTORE UPLOADS
====================================================== */

function restoreUploads() {
  const uploadsBackup = path.join(TEMP_DIR, "uploads");

  if (!fs.existsSync(uploadsBackup)) {
    return;
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
  }

  const files = fs.readdirSync(uploadsBackup);

  files.forEach((file) => {
    const src = path.join(uploadsBackup, file);
    const dest = path.join(UPLOADS_DIR, file);

    if (fs.lstatSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  });
}

/* ======================================================
CLEAN TEMP
====================================================== */

function cleanTemp() {
  if (!fs.existsSync(TEMP_DIR)) return;

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

/* ======================================================
MAIN RESTORE
====================================================== */

async function restoreBackup(userId) {
  try {
    ensureDirectories();

    const backupFile = getLatestBackup();

    await extractBackup(backupFile);

    await restoreCollections(new mongoose.Types.ObjectId(userId));

    restoreUploads();

    cleanTemp();

    return {
      success: true,
      message: "Backup restored successfully",
    };
  } catch (error) {
    console.error("Restore failed:", error);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  restoreBackup,
};
