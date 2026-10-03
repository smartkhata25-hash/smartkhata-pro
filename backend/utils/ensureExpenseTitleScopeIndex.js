const ExpenseTitle = require("../models/ExpenseTitle");

const SCOPED_TITLE_INDEX_NAME = "expense_title_scope_normalized_unique";
let ensurePromise = null;
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

const ensureExpenseTitleScopeIndex = async () => {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    try {
      await ExpenseTitle.collection.createIndex(
        { userId: 1, moduleScope: 1, normalizedName: 1 },
        { unique: true, name: SCOPED_TITLE_INDEX_NAME },
      );
    } catch (error) {
      throw new Error(`Expense Title index could not be ensured without a reviewed data repair: ${error.message}`);
    }

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
