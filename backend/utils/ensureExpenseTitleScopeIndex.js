const ExpenseTitle = require("../models/ExpenseTitle");
const { MODULE_SCOPES } = require("./moduleScope");

const SCOPED_TITLE_INDEX_NAME = "expense_title_scope_normalized_unique";
let ensurePromise = null;
const EXPENSE_TITLE_SCOPE_VALUES = Object.freeze([
  MODULE_SCOPES.TRADING,
  MODULE_SCOPES.TRAVEL,
  MODULE_SCOPES.WEAVING,
  MODULE_SCOPES.BOTH,
]);

const normalizeExpenseTitleName = (name = "") =>
  String(name || "").trim().toLowerCase();

const hasExactIndexKey = (index, keySpec) => {
  const indexKey = index?.key || {};
  const expectedEntries = Object.entries(keySpec);
  const actualEntries = Object.entries(indexKey);

  if (actualEntries.length !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([key, value]) => indexKey[key] === value);
};

const backfillTitleScopeFields = async () => {
  const titles = await ExpenseTitle.find({
    $or: [
      { moduleScope: { $exists: false } },
      { moduleScope: null },
      { moduleScope: "" },
      { normalizedName: { $exists: false } },
      { normalizedName: null },
      { normalizedName: "" },
    ],
  })
    .select("_id name moduleScope normalizedName")
    .lean();

  if (titles.length === 0) {
    return;
  }

  await ExpenseTitle.bulkWrite(
    titles.map((title) => {
      const moduleScope = String(title.moduleScope || "").trim().toLowerCase();
      const safeModuleScope = EXPENSE_TITLE_SCOPE_VALUES.includes(moduleScope)
        ? moduleScope
        : MODULE_SCOPES.BOTH;

      return {
        updateOne: {
          filter: { _id: title._id },
          update: {
            $set: {
              moduleScope: safeModuleScope,
              normalizedName: normalizeExpenseTitleName(title.name),
            },
          },
        },
      };
    }),
    { ordered: false },
  );
};

const ensureExpenseTitleScopeIndex = async () => {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    await backfillTitleScopeFields();

    await ExpenseTitle.collection.createIndex(
      { userId: 1, moduleScope: 1, normalizedName: 1 },
      {
        unique: true,
        name: SCOPED_TITLE_INDEX_NAME,
      },
    );

    const indexes = await ExpenseTitle.collection.indexes();
    const legacyIndex = indexes.find(
      (index) =>
        index.unique === true &&
        hasExactIndexKey(index, { name: 1, userId: 1 }),
    );

    if (legacyIndex?.name) {
      await ExpenseTitle.collection.dropIndex(legacyIndex.name);
    }
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
};

module.exports = {
  SCOPED_TITLE_INDEX_NAME,
  ensureExpenseTitleScopeIndex,
  normalizeExpenseTitleName,
};
