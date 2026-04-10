const {
  parseExcelFile,
  transformPartyData,
  transformProductData,
} = require("../utils/importParser");

const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");

/* =========================================================
   🔧 COMMON HELPERS
========================================================= */

// 🔢 Generate Account Code
const generateAccountCode = async (userId) => {
  const lastAcc = await Account.findOne({
    userId,
    code: { $regex: /^ACC-\d+$/ },
  }).sort({ createdAt: -1 });

  let newCode = "ACC-0001";

  if (lastAcc && lastAcc.code) {
    const lastNum = Number(lastAcc.code.replace("ACC-", ""));
    if (!isNaN(lastNum)) {
      newCode = `ACC-${String(lastNum + 1).padStart(4, "0")}`;
    }
  }

  return newCode;
};

// 🔐 Get Opening Balance Account
const getOpeningAccount = async (userId) => {
  let openingAcc = await Account.findOne({
    userId,
    code: "OPENING_BALANCE",
  });

  if (!openingAcc) {
    openingAcc = await Account.create({
      userId,
      name: "opening balance equity",
      type: "Equity",
      category: "other",
      code: "OPENING_BALANCE",
      normalBalance: "credit",
      isSystem: true,
    });
  }

  return openingAcc;
};

/* =========================================================
   👤 CUSTOMER / SUPPLIER (UNIFIED LOGIC)
========================================================= */

const createPartyInternal = async (data, userId, type) => {
  try {
    const { name, phone, openingBalance } = data;

    let existing;

    if (type === "customer") {
      existing = await Customer.findOne({
        name: new RegExp(`^${name}$`, "i"),
        createdBy: userId,
        isActive: true,
      });
    } else {
      existing = await Supplier.findOne({
        name: new RegExp(`^${name}$`, "i"),
        userId,
        isDeleted: false,
      });
    }

    if (existing) {
      return { success: false, message: "Duplicate name" };
    }

    const code = await generateAccountCode(userId);

    const account = await Account.create({
      userId,
      name: type === "customer" ? `Customer: ${name}` : name,
      type: type === "customer" ? "Asset" : "Liability",
      normalBalance: type === "customer" ? "debit" : "credit",
      code,
      category: type === "customer" ? "customer" : "supplier",
      openingBalance: openingBalance || 0,
    });

    let entity;

    if (type === "customer") {
      entity = await Customer.create({
        name,
        phone,
        openingBalance,
        account: account._id,
        createdBy: userId,
      });
    } else {
      entity = await Supplier.create({
        name,
        phone,
        openingBalance,
        userId,
        account: account._id,
      });
    }

    // 🔥 Opening Journal Entry
    if (openingBalance !== 0) {
      const openingAcc = await getOpeningAccount(userId);

      const isCustomer = type === "customer";

      await JournalEntry.create({
        date: new Date(),
        description: `Opening Balance - ${type}`,
        createdBy: userId,
        sourceType: "opening_balance",
        customerId: isCustomer ? entity._id : null,
        supplierId: !isCustomer ? entity._id : null,
        lines: [
          {
            account: isCustomer ? account._id : openingAcc._id,
            type: isCustomer ? "debit" : "debit",
            amount: Math.abs(openingBalance),
          },
          {
            account: isCustomer ? openingAcc._id : account._id,
            type: "credit",
            amount: Math.abs(openingBalance),
          },
        ],
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

/* =========================================================
   📦 PRODUCT
========================================================= */

const createProductInternal = async (data, userId) => {
  try {
    const { name, category, unitCost, salePrice, stock } = data;

    console.log("🧪 BEFORE SAVE:", {
      name,
      category,
      unitCost,
      salePrice,
      stock,
    });

    // 🔍 Duplicate check
    const existing = await Product.findOne({
      name: new RegExp(`^${name}$`, "i"),
      userId,
    });

    if (existing) {
      return { success: false, message: "Duplicate product" };
    }

    let categoryId = null;

    // 🔥 CATEGORY LOGIC (FIND OR CREATE)
    if (category && category.trim()) {
      const trimmedCategory = category.trim();

      // 🔍 Try to find existing
      let existingCategory = await Category.findOne({
        name: new RegExp(`^${trimmedCategory}$`, "i"),
        userId,
      });

      // ➕ If not found → create new
      if (!existingCategory) {
        try {
          existingCategory = await Category.create({
            name: trimmedCategory,
            userId,
          });
        } catch (err) {
          // 🔁 Handle duplicate race condition
          existingCategory = await Category.findOne({
            name: new RegExp(`^${trimmedCategory}$`, "i"),
            userId,
          });
        }
      }

      if (existingCategory) {
        categoryId = existingCategory._id;
      }
    }
    // ✅ Save product with categoryId
    const product = await Product.create({
      name,
      unitCost,
      salePrice,
      userId,
      categoryId,
    });

    console.log("✅ SAVED PRODUCT:", product);

    // 📦 Opening stock
    if (stock > 0) {
      await InventoryTransaction.create({
        productId: product._id,
        type: "IN",
        quantity: stock,
        rate: unitCost || 0,
        userId,
        note: "Opening stock import",
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

/* =========================================================
   🚀 IMPORT ENGINE (WITH PREVIEW SUPPORT)
========================================================= */

const processImport = async (rows, userId, type, preview = false) => {
  let transformResult;

  if (type === "product") {
    transformResult = transformProductData(rows);
  } else {
    transformResult = transformPartyData(rows, type);
  }

  const { valid, errors } = transformResult;

  // 🔥 PREVIEW MODE (NO DB WRITE)
  if (preview) {
    return {
      preview: true,
      total: rows.length,
      valid,
      errors,
    };
  }

  let success = 0;
  let failed = [...errors];

  for (let i = 0; i < valid.length; i++) {
    let result;

    if (type === "product") {
      result = await createProductInternal(valid[i], userId);
    } else {
      result = await createPartyInternal(valid[i], userId, type);
    }

    if (result.success) success++;
    else failed.push({ row: i + 2, message: result.message });
  }

  return {
    total: rows.length,
    success,
    failed: failed.length,
    errors: failed,
  };
};

/* =========================================================
   📥 APIs
========================================================= */

exports.importCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!req.file) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const preview = req.query.preview === "true";

    const rows = parseExcelFile(req.file.buffer);

    const result = await processImport(rows, userId, "customer", preview);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Import failed",
      error: error.message,
    });
  }
};

exports.importSuppliers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!req.file) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const preview = req.query.preview === "true";

    const rows = parseExcelFile(req.file.buffer);

    const result = await processImport(rows, userId, "supplier", preview);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Import failed",
      error: error.message,
    });
  }
};

exports.importProducts = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!req.file) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const preview = req.query.preview === "true";

    const rows = parseExcelFile(req.file.buffer);

    const result = await processImport(rows, userId, "product", preview);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      message: "Import failed",
      error: error.message,
    });
  }
};
