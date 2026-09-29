const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const mongoose = require("mongoose");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  getRequestedModuleScope,
} = require("../utils/moduleScope");
const {
  applyExpenseTitleScopeFilter,
  normalizeExpenseTitleScope,
} = require("../utils/expenseTitleScope");
const {
  ensureExpenseTitleScopeIndex,
  normalizeExpenseTitleName,
} = require("../utils/ensureExpenseTitleScopeIndex");

const makeHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getTitleScope = (source = {}, fallback = MODULE_SCOPES.TRADING) => {
  const requested = getRequestedModuleScope(source, fallback);

  if (requested === "all" || requested === MODULE_SCOPES.SHARED) {
    throw makeHttpError("Expense titles must belong to a business module.", 400);
  }

  return normalizeExpenseTitleScope(requested, fallback);
};

const assertTitleScopeEnabled = (req, moduleScope) => {
  const enabledModules = req.user?.enabledModules || {};

  if (moduleScope === MODULE_SCOPES.BOTH) {
    if (
      enabledModules[MODULE_SCOPES.TRADING] === false ||
      enabledModules[MODULE_SCOPES.TRAVEL] !== true
    ) {
      throw makeHttpError("This business module is not enabled", 403);
    }

    return;
  }

  const enabled =
    moduleScope === MODULE_SCOPES.TRADING
      ? enabledModules[MODULE_SCOPES.TRADING] !== false
      : enabledModules[moduleScope] === true;

  if (!enabled) {
    throw makeHttpError("This business module is not enabled", 403);
  }
};

const getAccountValidationScope = (moduleScope) =>
  moduleScope === MODULE_SCOPES.BOTH
    ? MODULE_SCOPES.TRADING
    : moduleScope;

const findScopedExpenseAccount = async ({ categoryId, userId, moduleScope }) => {
  const accountQuery = {
    _id: categoryId,
    userId,
    type: "Expense",
    isActive: { $ne: false },
  };

  applyModuleScopeFilter(
    accountQuery,
    getAccountValidationScope(moduleScope),
  );

  return Account.findOne(accountQuery).select("_id name code moduleScope type category");
};

const sendError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    error: error.message || fallbackMessage,
    message: error.message || fallbackMessage,
  });
};

const reactivateRetiredExpenseTitle = async ({
  userId,
  moduleScope,
  normalizedName,
  name,
  categoryId,
}) => {
  const retiredTitles = await ExpenseTitle.find({
    userId,
    moduleScope,
    isDeleted: true,
    $or: [
      { normalizedName },
      { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
    ],
  })
    .select("name normalizedName categoryId moduleScope isDeleted")
    .populate("categoryId", "type moduleScope isActive")
    .lean();

  if (retiredTitles.length === 0) {
    return null;
  }

  retiredTitles.sort((left, right) => {
    const leftCategoryIsValid =
      left.categoryId?.type === "Expense" &&
      left.categoryId?.isActive !== false &&
      left.categoryId?.moduleScope === moduleScope;
    const rightCategoryIsValid =
      right.categoryId?.type === "Expense" &&
      right.categoryId?.isActive !== false &&
      right.categoryId?.moduleScope === moduleScope;

    if (leftCategoryIsValid !== rightCategoryIsValid) {
      return leftCategoryIsValid ? -1 : 1;
    }

    return String(left._id).localeCompare(String(right._id));
  });

  const canonical = retiredTitles[0];
  const blockingCopies = retiredTitles.filter(
    (title) =>
      String(title._id) !== String(canonical._id) &&
      title.normalizedName === normalizedName,
  );

  if (blockingCopies.length > 0) {
    await ExpenseTitle.bulkWrite(
      blockingCopies.map((title) => ({
        updateOne: {
          filter: { _id: title._id, isDeleted: true },
          update: {
            $set: {
              normalizedName: `${normalizedName}__retired__${title._id}`,
            },
          },
        },
      })),
      { ordered: true },
    );
  }

  return ExpenseTitle.findOneAndUpdate(
    { _id: canonical._id, userId, moduleScope, isDeleted: true },
    {
      $set: {
        name,
        normalizedName,
        categoryId,
        isDeleted: false,
      },
    },
    { new: true, runValidators: true },
  ).populate("categoryId", "name code type category moduleScope");
};

exports.getExpenseTitles = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const moduleScope = getTitleScope(req.query, MODULE_SCOPES.TRADING);

    assertTitleScopeEnabled(req, moduleScope);

    const search = String(req.query.search || "").trim();
    const query = {
      userId,
      isDeleted: { $ne: true },
    };

    applyExpenseTitleScopeFilter(query, moduleScope);

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      query.name = {
        $regex: safeSearch,
        $options: "i",
      };
    }

    const titles = await ExpenseTitle.find(query)
      .select("name categoryId moduleScope isDefault")
      .populate("categoryId", "name code type category moduleScope")
      .sort({ name: 1, _id: 1 })
      .limit(50)
      .lean();

    return res.json(titles);
  } catch (error) {
    console.error("Get Expense Titles Error:", error);

    return sendError(res, error, "Failed to fetch expense titles");
  }
};

exports.createExpenseTitle = async (req, res) => {
  try {
    await ensureExpenseTitleScopeIndex();

    const userId = req.user?.id || req.userId;
    const moduleScope = getTitleScope(
      { ...req.query, ...req.body },
      MODULE_SCOPES.TRADING,
    );
    const { name, categoryId } = req.body;

    assertTitleScopeEnabled(req, moduleScope);

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Title name is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    const account = await findScopedExpenseAccount({
      categoryId,
      userId,
      moduleScope,
    });

    if (!account) {
      return res.status(400).json({
        error: "Invalid expense category",
      });
    }

    const trimmedName = name.trim();
    const normalizedName = normalizeExpenseTitleName(trimmedName);
    const existingQuery = {
      userId,
      isDeleted: { $ne: true },
      moduleScope,
      normalizedName,
    };

    const existing = await ExpenseTitle.findOne(existingQuery).lean();

    if (existing) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    const reactivatedTitle = await reactivateRetiredExpenseTitle({
      userId,
      moduleScope,
      normalizedName,
      name: trimmedName,
      categoryId,
    });

    if (reactivatedTitle) {
      return res.status(200).json(reactivatedTitle);
    }

    const newTitle = new ExpenseTitle({
      name: trimmedName,
      categoryId,
      userId,
      moduleScope,
      isDefault: false,
    });

    await newTitle.save();
    await newTitle.populate("categoryId", "name code type category moduleScope");

    res.status(201).json(newTitle);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    console.error("Create Expense Title Error:", error);

    return sendError(res, error, "Failed to create expense title");
  }
};

exports.deleteExpenseTitle = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const moduleScope = getTitleScope(req.query, MODULE_SCOPES.TRADING);

    assertTitleScopeEnabled(req, moduleScope);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid title ID",
      });
    }

    const titleQuery = {
      _id: id,
      userId,
      isDeleted: { $ne: true },
    };

    applyExpenseTitleScopeFilter(titleQuery, moduleScope);

    const title = await ExpenseTitle.findOne(titleQuery);

    if (!title) {
      return res.status(404).json({
        error: "Title not found",
      });
    }

    if (title.isDefault) {
      return res.status(403).json({
        error: "Default titles cannot be deleted",
      });
    }

    title.isDeleted = true;
    await title.save();

    res.json({
      message: "Title deleted successfully",
    });
  } catch (error) {
    console.error("Delete Expense Title Error:", error);

    return sendError(res, error, "Failed to delete title");
  }
};

exports.updateExpenseTitle = async (req, res) => {
  try {
    await ensureExpenseTitleScopeIndex();

    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const { name, categoryId } = req.body;
    const moduleScope = getTitleScope(
      { ...req.query, ...req.body },
      MODULE_SCOPES.TRADING,
    );

    assertTitleScopeEnabled(req, moduleScope);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid title ID",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Title name is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    const titleQuery = {
      _id: id,
      userId,
      isDeleted: { $ne: true },
    };

    applyExpenseTitleScopeFilter(titleQuery, moduleScope);

    const title = await ExpenseTitle.findOne(titleQuery);

    if (!title) {
      return res.status(404).json({
        error: "Title not found",
      });
    }

    if (title.isDefault) {
      return res.status(403).json({
        error: "Default titles cannot be modified",
      });
    }

    const trimmedName = name.trim();
    const existingQuery = {
      userId,
      _id: { $ne: id },
      isDeleted: { $ne: true },
      normalizedName: normalizeExpenseTitleName(trimmedName),
    };

    applyExpenseTitleScopeFilter(existingQuery, moduleScope);

    const existing = await ExpenseTitle.findOne(existingQuery).lean();

    if (existing) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    const account = await findScopedExpenseAccount({
      categoryId,
      userId,
      moduleScope,
    });

    if (!account) {
      return res.status(400).json({
        error: "Invalid expense category",
      });
    }

    title.name = trimmedName;
    title.categoryId = categoryId;

    await title.save();
    await title.populate("categoryId", "name code type category moduleScope");

    res.json(title);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        error: "Title already exists",
      });
    }

    console.error("Update Expense Title Error:", error);

    return sendError(res, error, "Failed to update title");
  }
};
