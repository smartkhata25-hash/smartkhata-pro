const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");

const MODULE_SCOPES = Object.freeze({
  TRADING: "trading",
  TRAVEL: "travel",
  BOTH: "both",
});

const PAYMENT_ACCOUNT_CATEGORIES = Object.freeze(["cash", "bank", "online", "cheque"]);
const KNOWN_SHARED_PAYMENT_CODES = Object.freeze(["HANDCASH", "BANK", "EASYPAISA", "JAZZCASH"]);
const KNOWN_SHARED_PAYMENT_CODE_REGEX = /^(HANDCASH|BANK|EASYPAISA|JAZZCASH)$/i;

const TRAVEL_ACCOUNT_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
]);

const TRAVEL_ACCOUNT_SOURCE_TYPES = Object.freeze([
  "travel_booking",
  "travel_customer_advance",
  "travel_vendor_cost",
  "travel_vendor_advance",
  "travel_vendor_return",
  "travel_commission",
  "travel_refund",
  "travel_adjustment",
]);

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL;

const APPLY_BACKFILL = process.env.APPLY_ACCOUNT_SCOPE_BACKFILL === "true";
const APPLY_INDEXES = process.env.APPLY_ACCOUNT_SCOPE_INDEXES === "true";

const missingScopeFilter = {
  $or: [
    { moduleScope: { $exists: false } },
    { moduleScope: null },
    { moduleScope: "" },
  ],
};

const missingOrTradingScopeFilter = {
  $or: [
    { moduleScope: { $exists: false } },
    { moduleScope: null },
    { moduleScope: "" },
    { moduleScope: MODULE_SCOPES.TRADING },
  ],
};

const isOldUserCodeIndex = (index) =>
  index.unique === true &&
  index.key &&
  index.key.userId === 1 &&
  index.key.code === 1 &&
  Object.keys(index.key).length === 2;

const getTravelJournalConditions = () => [
  { originModule: { $in: TRAVEL_ACCOUNT_ORIGINS } },
  { sourceType: { $in: TRAVEL_ACCOUNT_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_ACCOUNT_ORIGINS },
  },
];

const normalizeStoredScope = (scope) => {
  const cleanScope = String(scope || "").trim();

  return cleanScope || "missing";
};

const addSharedCandidate = (candidateMap, account, reason) => {
  if (!account?._id) {
    return;
  }

  const key = String(account._id);
  const existing = candidateMap.get(key) || {
    _id: account._id,
    userId: account.userId,
    name: account.name || "",
    code: account.code || "",
    category: account.category || "",
    moduleScope: account.moduleScope,
    reasons: new Set(),
  };

  existing.reasons.add(reason);
  candidateMap.set(key, existing);
};

const getTravelUsedPaymentAccounts = async () =>
  JournalEntry.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: getTravelJournalConditions(),
      },
    },
    { $unwind: "$lines" },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "account",
      },
    },
    { $unwind: "$account" },
    {
      $match: {
        $expr: { $eq: ["$createdBy", "$account.userId"] },
        "account.type": "Asset",
        "account.category": { $in: PAYMENT_ACCOUNT_CATEGORIES },
        "account.isActive": { $ne: false },
        "account.code": { $not: /^TRAVEL_/i },
      },
    },
    {
      $group: {
        _id: "$account._id",
        userId: { $first: "$account.userId" },
        name: { $first: "$account.name" },
        code: { $first: "$account.code" },
        category: { $first: "$account.category" },
        moduleScope: { $first: "$account.moduleScope" },
        travelJournalCount: { $sum: 1 },
      },
    },
    { $sort: { code: 1, name: 1 } },
  ]);

const getKnownSharedPaymentAccounts = () =>
  Account.find({
    type: "Asset",
    category: { $in: PAYMENT_ACCOUNT_CATEGORIES },
    isActive: { $ne: false },
    code: KNOWN_SHARED_PAYMENT_CODE_REGEX,
  })
    .select("_id userId name code category moduleScope")
    .sort({ code: 1, name: 1, _id: 1 })
    .lean();

const getSharedPaymentCandidates = async () => {
  const [knownSharedAccounts, travelUsedAccounts] = await Promise.all([
    getKnownSharedPaymentAccounts(),
    getTravelUsedPaymentAccounts(),
  ]);
  const candidateMap = new Map();

  knownSharedAccounts.forEach((account) => {
    addSharedCandidate(
      candidateMap,
      account,
      `known shared payment code (${KNOWN_SHARED_PAYMENT_CODES.join(", ")})`,
    );
  });

  travelUsedAccounts.forEach((account) => {
    addSharedCandidate(
      candidateMap,
      account,
      `used in ${account.travelJournalCount || 0} Travel journal line(s)`,
    );
  });

  return [...candidateMap.values()].sort((left, right) =>
    String(left.code || "").localeCompare(String(right.code || "")) ||
    String(left.name || "").localeCompare(String(right.name || "")),
  );
};

const printAccountList = (title, accounts) => {
  console.log(title);

  if (!accounts.length) {
    console.log("  none");
    return;
  }

  accounts.forEach((account) => {
    console.log(
      [
        `  - ${account.code || "(no code)"}`,
        account.name || "(no name)",
        `accountId=${account._id}`,
        `userId=${account.userId}`,
        `currentScope=${normalizeStoredScope(account.moduleScope)}`,
        `reason=${[...account.reasons].join("; ")}`,
      ].join(" | "),
    );
  });
};

const main = async () => {
  if (!MONGO_URI) {
    throw new Error("Missing MongoDB connection string");
  }

  await mongoose.connect(MONGO_URI);

  const sharedPaymentCandidates = await getSharedPaymentCandidates();
  const sharedPaymentCandidateIds = sharedPaymentCandidates.map((account) => account._id);
  const travelSystemFilter = {
    code: /^TRAVEL_/i,
    moduleScope: { $ne: MODULE_SCOPES.TRAVEL },
  };
  const sharedPaymentRepairFilter = {
    _id: { $in: sharedPaymentCandidateIds },
    type: "Asset",
    category: { $in: PAYMENT_ACCOUNT_CATEGORIES },
    isActive: { $ne: false },
    code: { $not: /^TRAVEL_/i },
    ...missingOrTradingScopeFilter,
  };
  const tradingLegacyFilter = {
    ...missingScopeFilter,
    code: { $not: /^TRAVEL_/i },
    _id: { $nin: sharedPaymentCandidateIds },
  };

  const [travelSystemCount, sharedPaymentRepairAccounts, tradingLegacyCount] = await Promise.all([
    Account.countDocuments(travelSystemFilter),
    Account.find(sharedPaymentRepairFilter)
      .select("_id userId name code category moduleScope")
      .sort({ code: 1, name: 1, _id: 1 })
      .lean(),
    Account.countDocuments(tradingLegacyFilter),
  ]);
  const sharedCandidateById = new Map(
    sharedPaymentCandidates.map((account) => [String(account._id), account]),
  );
  const sharedPaymentRepairList = sharedPaymentRepairAccounts.map((account) => {
    const candidate = sharedCandidateById.get(String(account._id));

    return {
      ...account,
      reasons: candidate?.reasons || new Set(["shared payment account"]),
    };
  });

  console.log("Account moduleScope backfill");
  console.log(`Mode: ${APPLY_BACKFILL ? "APPLY" : "DRY RUN"}`);
  console.log(`Unscoped TRAVEL_* accounts to mark travel: ${travelSystemCount}`);
  console.log(`Shared payment accounts to mark both: ${sharedPaymentRepairList.length}`);
  console.log(`Remaining unscoped accounts to mark trading: ${tradingLegacyCount}`);
  printAccountList("Shared payment accounts that will become moduleScope=both:", sharedPaymentRepairList);

  if (APPLY_BACKFILL) {
    await Account.updateMany(travelSystemFilter, { $set: { moduleScope: MODULE_SCOPES.TRAVEL } });
    await Account.updateMany(sharedPaymentRepairFilter, { $set: { moduleScope: MODULE_SCOPES.BOTH } });
    await Account.updateMany(tradingLegacyFilter, { $set: { moduleScope: MODULE_SCOPES.TRADING } });
    console.log("Backfill applied.");
  } else {
    console.log("No data changed. Set APPLY_ACCOUNT_SCOPE_BACKFILL=true to apply.");
    console.log("Run again with APPLY_ACCOUNT_SCOPE_BACKFILL=true to repair shared payment accounts already marked trading.");
  }

  if (APPLY_INDEXES) {
    const indexes = await Account.collection.indexes();
    const oldIndex = indexes.find(isOldUserCodeIndex);

    if (oldIndex) {
      await Account.collection.dropIndex(oldIndex.name);
      console.log(`Dropped old unique index: ${oldIndex.name}`);
    }

    await Account.collection.createIndex(
      { userId: 1, moduleScope: 1, code: 1 },
      {
        unique: true,
        name: "userId_moduleScope_code_unique",
      },
    );
    console.log("Created scoped unique account code index.");
  } else {
    console.log("Indexes unchanged. Set APPLY_ACCOUNT_SCOPE_INDEXES=true to update indexes.");
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
