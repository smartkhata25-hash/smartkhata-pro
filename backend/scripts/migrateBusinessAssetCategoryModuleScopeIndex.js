const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const COLLECTION_NAME = "businessassetcategories";
const LEGACY_INDEX_NAME = "userId_1_normalizedName_1";
const MODULE_AWARE_INDEX_NAME = "userId_1_moduleScope_1_normalizedName_1";
const VALID_MODULE_SCOPES = Object.freeze(["trading", "travel"]);

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL;

const APPLY_MIGRATION =
  process.env.APPLY_BUSINESS_ASSET_CATEGORY_INDEX_MIGRATION === "true";

const missingScopeFilter = {
  $or: [
    { moduleScope: { $exists: false } },
    { moduleScope: null },
    { moduleScope: "" },
  ],
};

const exactKey = (key, expected) => {
  const keyEntries = Object.entries(key || {});
  const expectedEntries = Object.entries(expected);

  return (
    keyEntries.length === expectedEntries.length &&
    expectedEntries.every(([field, direction]) => key?.[field] === direction)
  );
};

const hasActiveOnlyPartialFilter = (index) => {
  const partial = index.partialFilterExpression || {};

  return Object.keys(partial).length === 1 && partial.isDeleted === false;
};

const isLegacyUniqueIndex = (index) =>
  index.name === LEGACY_INDEX_NAME &&
  index.unique === true &&
  exactKey(index.key, {
    userId: 1,
    normalizedName: 1,
  });

const isModuleAwareUniqueIndex = (index) =>
  index.unique === true &&
  exactKey(index.key, {
    userId: 1,
    moduleScope: 1,
    normalizedName: 1,
  }) &&
  hasActiveOnlyPartialFilter(index);

const formatIndex = (index) =>
  JSON.stringify(
    {
      name: index.name,
      key: index.key,
      unique: index.unique === true,
      partialFilterExpression: index.partialFilterExpression || null,
    },
    null,
    2,
  );

const printIndexes = (title, indexes) => {
  console.log(title);

  indexes.forEach((index) => {
    console.log(formatIndex(index));
  });
};

const getInvalidScopeRows = (collection) =>
  collection
    .find(
      {
        moduleScope: {
          $exists: true,
          $nin: [...VALID_MODULE_SCOPES, null, ""],
        },
      },
      {
        projection: {
          _id: 1,
          userId: 1,
          moduleScope: 1,
          name: 1,
          normalizedName: 1,
        },
      },
    )
    .limit(20)
    .toArray();

const getDuplicateRows = (collection) =>
  collection
    .aggregate([
      {
        $match: {
          isDeleted: false,
          normalizedName: {
            $type: "string",
          },
        },
      },
      {
        $addFields: {
          safeModuleScope: {
            $cond: [
              {
                $in: ["$moduleScope", VALID_MODULE_SCOPES],
              },
              "$moduleScope",
              "trading",
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            moduleScope: "$safeModuleScope",
            normalizedName: "$normalizedName",
          },
          count: {
            $sum: 1,
          },
          ids: {
            $push: "$_id",
          },
        },
      },
      {
        $match: {
          count: {
            $gt: 1,
          },
        },
      },
      {
        $limit: 20,
      },
    ])
    .toArray();

const abortWithRows = (message, rows) => {
  console.error(message);
  console.error(JSON.stringify(rows, null, 2));
  process.exitCode = 1;
};

const main = async () => {
  if (!MONGO_URI) {
    throw new Error("Missing MongoDB connection string");
  }

  await mongoose.connect(MONGO_URI);

  const collection = mongoose.connection.collection(COLLECTION_NAME);
  const indexesBefore = await collection.indexes();
  const legacyIndex = indexesBefore.find(isLegacyUniqueIndex);
  const moduleAwareIndex = indexesBefore.find(isModuleAwareUniqueIndex);
  const missingScopeCount = await collection.countDocuments(missingScopeFilter);
  const invalidScopeRows = await getInvalidScopeRows(collection);
  const duplicateRows = await getDuplicateRows(collection);

  console.log("BusinessAssetCategory moduleScope index migration");
  console.log(`Mode: ${APPLY_MIGRATION ? "APPLY" : "DRY RUN"}`);
  console.log(`Collection: ${COLLECTION_NAME}`);
  console.log(`Missing/null/empty moduleScope categories: ${missingScopeCount}`);
  console.log(
    `Legacy unique index present: ${legacyIndex ? "yes" : "no"}`,
  );
  console.log(
    `Module-aware unique index present: ${moduleAwareIndex ? "yes" : "no"}`,
  );
  printIndexes("Indexes before:", indexesBefore);

  if (invalidScopeRows.length) {
    abortWithRows(
      "Aborting: found non-empty invalid moduleScope values. Review manually before changing indexes.",
      invalidScopeRows,
    );
    return;
  }

  if (duplicateRows.length) {
    abortWithRows(
      "Aborting: found duplicate active categories inside the same user/module/name scope.",
      duplicateRows,
    );
    return;
  }

  if (!APPLY_MIGRATION) {
    console.log("Dry run only. Set APPLY_BUSINESS_ASSET_CATEGORY_INDEX_MIGRATION=true to apply.");
    return;
  }

  if (missingScopeCount > 0) {
    const backfillResult = await collection.updateMany(missingScopeFilter, {
      $set: {
        moduleScope: "trading",
      },
    });

    console.log(
      `Backfilled legacy category moduleScope: matched=${backfillResult.matchedCount}, modified=${backfillResult.modifiedCount}`,
    );
  } else {
    console.log("No legacy category moduleScope backfill needed.");
  }

  const indexesAfterBackfill = await collection.indexes();
  const oldIndexAfterBackfill = indexesAfterBackfill.find(isLegacyUniqueIndex);
  const newIndexAfterBackfill =
    indexesAfterBackfill.find(isModuleAwareUniqueIndex);

  if (!newIndexAfterBackfill) {
    await collection.createIndex(
      {
        userId: 1,
        moduleScope: 1,
        normalizedName: 1,
      },
      {
        name: MODULE_AWARE_INDEX_NAME,
        unique: true,
        partialFilterExpression: {
          isDeleted: false,
        },
      },
    );

    console.log(`Created module-aware unique index: ${MODULE_AWARE_INDEX_NAME}`);
  } else {
    console.log(
      `Module-aware unique index already exists: ${newIndexAfterBackfill.name}`,
    );
  }

  if (oldIndexAfterBackfill) {
    await collection.dropIndex(oldIndexAfterBackfill.name);
    console.log(`Dropped obsolete legacy unique index: ${oldIndexAfterBackfill.name}`);
  } else {
    console.log("No obsolete legacy unique index to drop.");
  }

  const indexesAfter = await collection.indexes();
  printIndexes("Indexes after:", indexesAfter);
  console.log("Migration complete.");
};

main()
  .catch((error) => {
    console.error("BusinessAssetCategory moduleScope index migration failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
