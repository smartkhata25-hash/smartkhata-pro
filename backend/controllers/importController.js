const {
  parseExcelFile,
  transformPartyData,
  transformProductData,
} = require("../utils/importParser");
const { parseDigikhataPdf } = require("../utils/pdfImportParser");
const { parseProductPdf } = require("../utils/productPdfParser");

const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");

const PurchaseInvoice = require("../models/purchaseInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");

const Counter = require("../models/Counter");
const importProgress = {};
const importResults = {};
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

    // 🔥 NEW OPENING BALANCE SYSTEM
    if (openingBalance !== 0) {
      const openingAcc = await getOpeningAccount(userId);

      // =====================================================
      // 👤 CUSTOMER
      // =====================================================

      if (type === "customer") {
        // ✅ POSITIVE = Opening Sale Invoice
        if (openingBalance > 0) {
          let counter = await Counter.findOne({
            type: "sale_invoice",
            userId,
          });

          if (!counter) {
            counter = await Counter.create({
              type: "sale_invoice",
              userId,
              seq: 1000,
            });
          }

          counter.seq += 1;
          await counter.save();

          const openingInvoice = await Invoice.create({
            billNo: counter.seq.toString(),

            customerName: entity.name,
            customerPhone: entity.phone || "",

            invoiceDate: new Date(),

            items: [],

            totalAmount: openingBalance,

            paidAmount: 0,

            status: "Unpaid",

            notes: "Opening Balance",

            isOpening: true,

            createdBy: userId,

            accountId: account._id,
            customerId: entity._id,
          });

          const journal = await JournalEntry.create({
            date: new Date(),
            description: "Opening Balance Customer Invoice",
            createdBy: userId,

            customerId: entity._id,

            sourceType: "opening_sale_invoice",

            invoiceId: openingInvoice._id,

            billNo: openingInvoice.billNo,

            lines: [
              {
                account: account._id,
                type: "debit",
                amount: openingBalance,
              },

              {
                account: openingAcc._id,
                type: "credit",
                amount: openingBalance,
              },
            ],
          });

          openingInvoice.journalEntryId = journal._id;

          await openingInvoice.save();
        }

        // ✅ NEGATIVE = Opening Refund Invoice
        if (openingBalance < 0) {
          let counter = await Counter.findOne({
            type: "refund_invoice",
            userId,
          });

          if (!counter) {
            counter = await Counter.create({
              type: "refund_invoice",
              userId,
              seq: 1000,
            });
          }

          counter.seq += 1;
          await counter.save();

          const openingRefund = await RefundInvoice.create({
            billNo: counter.seq.toString(),

            customerName: entity.name,
            customerPhone: entity.phone || "",

            invoiceDate: new Date(),

            items: [],

            totalAmount: Math.abs(openingBalance),

            paidAmount: 0,

            status: "Unpaid",

            paymentType: "credit",

            notes: "Opening Balance",

            isOpening: true,

            createdBy: userId,

            accountId: account._id,
            customerId: entity._id,
          });

          await JournalEntry.create({
            date: new Date(),
            description: "Opening Balance Customer Refund",
            createdBy: userId,

            customerId: entity._id,

            sourceType: "opening_refund_invoice",

            invoiceId: openingRefund._id,

            lines: [
              {
                account: openingAcc._id,
                type: "debit",
                amount: Math.abs(openingBalance),
              },

              {
                account: account._id,
                type: "credit",
                amount: Math.abs(openingBalance),
              },
            ],
          });
        }
      }

      // =====================================================
      // 🏢 SUPPLIER
      // =====================================================

      if (type === "supplier") {
        // ✅ POSITIVE = Opening Purchase Invoice
        if (openingBalance > 0) {
          const openingInvoice = await PurchaseInvoice.create({
            billNo: "OPENING",

            invoiceDate: new Date(),

            supplier: entity._id,

            supplierName: entity.name,
            supplierPhone: entity.phone || "",

            items: [],

            totalAmount: openingBalance,
            grandTotal: openingBalance,

            paidAmount: 0,

            status: "Unpaid",

            paymentType: "credit",

            notes: "Opening Purchase Invoice",

            userId,
          });

          await JournalEntry.create({
            date: new Date(),

            description: "Opening Purchase Invoice",

            createdBy: userId,

            sourceType: "opening_purchase_invoice",

            supplierId: entity._id,

            referenceId: openingInvoice._id,
            invoiceId: openingInvoice._id,

            lines: [
              {
                account: openingAcc._id,
                type: "debit",
                amount: openingBalance,
              },

              {
                account: account._id,
                type: "credit",
                amount: openingBalance,
              },
            ],
          });
        }

        // ✅ NEGATIVE = Opening Purchase Return
        if (openingBalance < 0) {
          const absAmount = Math.abs(openingBalance);

          const openingReturn = await PurchaseReturn.create({
            billNo: "OPENING",

            returnDate: new Date(),

            supplierId: entity._id,

            supplierName: entity.name,
            supplierPhone: entity.phone || "",

            items: [],

            totalAmount: absAmount,

            paidAmount: 0,

            paymentType: "",

            notes: "Opening Purchase Return",

            createdBy: userId,
          });

          await JournalEntry.create({
            date: new Date(),

            description: "Opening Purchase Return",

            createdBy: userId,

            sourceType: "opening_purchase_return",

            supplierId: entity._id,

            referenceId: openingReturn._id,
            invoiceId: openingReturn._id,

            lines: [
              {
                account: account._id,
                type: "debit",
                amount: absAmount,
              },

              {
                account: openingAcc._id,
                type: "credit",
                amount: absAmount,
              },
            ],
          });
        }
      }
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

const processImport = async (
  rows,
  userId,
  type,
  preview = false,
  jobId = null,
) => {
  let transformResult;

  if (type === "product") {
    transformResult = transformProductData(rows);
  } else {
    transformResult = transformPartyData(rows, type);
  }

  const { valid, errors } = transformResult;
  if (!valid.length && jobId && !preview) {
    const finalResult = {
      total: rows.length,
      success: 0,
      failed: errors.length,
      errors,
    };

    importResults[jobId] = finalResult;
    importProgress[jobId] = 100;

    return finalResult;
  }

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

    if (result.success) {
      success++;
    } else {
      failed.push({ row: i + 2, message: result.message });
    }

    if (jobId) {
      importProgress[jobId] = Math.floor(((i + 1) / valid.length) * 100);
    }
  }

  const finalResult = {
    total: rows.length,
    success,
    failed: failed.length,
    errors: failed,
  };

  if (jobId) {
    importResults[jobId] = finalResult;
    importProgress[jobId] = 100;
  }

  return finalResult;
};

/* =========================================================
   📥 APIs
========================================================= */

exports.importCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const preview = req.query.preview === "true";
    let rows;

    if (!preview) {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({
          message: "Invalid data format",
        });
      }

      rows = req.body;
    } else {
      if (!req.file) {
        return res.status(400).json({
          message: "File is required for preview",
        });
      }

      // 🔥 PDF SUPPORT
      if (req.file.mimetype === "application/pdf") {
        const parsed = await parseDigikhataPdf(req.file.buffer, "customer");

        rows = parsed.valid || [];
      } else {
        rows = parseExcelFile(req.file.buffer);
      }
    }

    const jobId = Date.now().toString();

    if (preview) {
      const result = await processImport(rows, userId, "customer", true, jobId);

      return res.json({ ...result, jobId });
    }

    importProgress[jobId] = 0;

    processImport(rows, userId, "customer", false, jobId)
      .then(() => {
        console.log("✅ Import finished:", jobId);
      })
      .catch((err) => {
        console.error("❌ Import error:", err.message);
      });

    res.json({ jobId });
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

    const preview = req.query.preview === "true";
    let rows;

    if (!preview) {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({
          message: "Invalid data format",
        });
      }

      rows = req.body;
    } else {
      if (!req.file) {
        return res.status(400).json({
          message: "File is required for preview",
        });
      }

      // 🔥 PDF SUPPORT
      if (req.file.mimetype === "application/pdf") {
        const parsed = await parseDigikhataPdf(req.file.buffer, "supplier");

        rows = parsed.valid || [];
      } else {
        rows = parseExcelFile(req.file.buffer);
      }
    }

    const jobId = Date.now().toString();

    if (preview) {
      const result = await processImport(rows, userId, "supplier", true, jobId);

      return res.json({ ...result, jobId });
    }

    importProgress[jobId] = 0;

    processImport(rows, userId, "supplier", false, jobId)
      .then(() => {
        console.log("✅ Import finished:", jobId);
      })
      .catch((err) => {
        console.error("❌ Import error:", err.message);
      });

    res.json({ jobId });
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

    const preview = req.query.preview === "true";
    let rows;

    if (!preview) {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({
          message: "Invalid data format",
        });
      }

      rows = req.body;
    } else {
      if (!req.file) {
        return res.status(400).json({
          message: "File is required for preview",
        });
      }

      // 🔥 PDF SUPPORT
      if (req.file.mimetype === "application/pdf") {
        const parsed = await parseProductPdf(req.file.buffer);

        rows = parsed.valid || [];
      } else {
        // ✅ Excel / CSV SAME AS BEFORE
        rows = parseExcelFile(req.file.buffer);
      }
    }

    const jobId = Date.now().toString();

    if (preview) {
      const result = await processImport(rows, userId, "product", true, jobId);

      return res.json({ ...result, jobId });
    }

    importProgress[jobId] = 0;

    processImport(rows, userId, "product", false, jobId)
      .then(() => {
        console.log("✅ Import finished:", jobId);
      })
      .catch((err) => {
        console.error("❌ Import error:", err.message);
      });

    res.json({ jobId });
  } catch (error) {
    res.status(500).json({
      message: "Import failed",
      error: error.message,
    });
  }
};

// ✅ GET IMPORT PROGRESS
exports.getImportProgress = (req, res) => {
  const { jobId } = req.params;

  const progress = importProgress[jobId] ?? 0;

  res.json({
    progress,
    result: importResults[jobId] || null,
  });
};
