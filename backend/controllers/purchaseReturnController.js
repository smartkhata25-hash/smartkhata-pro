const PurchaseReturn = require("../models/PurchaseReturn");
const PurchaseInvoice = require("../models/purchaseInvoice");
const Product = require("../models/Product");
const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
const Account = require("../models/Account");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

const { createPaymentEntry } = require("../utils/paymentService");
const { recalculateAccountBalance } = require("../utils/accountHelper");

/* =========================================================
   ✅ CREATE PURCHASE RETURN
========================================================= */
exports.createPurchaseReturn = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      billNo,
      returnDate,
      returnTime,
      supplierId,
      supplierPhone,
      totalAmount,
      paidAmount = 0,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    /* =============================
       BASIC VALIDATION
    ============================== */
    if (!supplierId || items.length === 0) {
      return res.status(400).json({
        error: "Supplier and items required",
      });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        error: "Invalid total amount",
      });
    }

    if (paidAmount > totalAmount) {
      return res.status(400).json({
        error: "Paid amount cannot exceed total amount",
      });
    }

    const supplierByIdOnly = await Supplier.findById(supplierId);

    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId: userId,
    });

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const supplierAccountId =
      typeof supplier.account === "object"
        ? supplier.account?._id
        : supplier.account;

    if (!supplierAccountId) {
      return res.status(400).json({
        error: "Supplier account not linked",
      });
    }

    /* =============================
       ACCOUNTS VALIDATION
    ============================== */
    const purchaseReturnAccount = await Account.findOne({
      code: "PURCHASE_RETURN",
      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    if (!purchaseReturnAccount || !inventoryAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    const purchaseReturn = new PurchaseReturn({
      billNo,
      returnDate,
      returnTime,
      supplierId: supplier._id,
      supplierName: supplier.name,
      supplierPhone,
      originalInvoiceId: originalInvoiceId || null,
      totalAmount,
      paidAmount,
      paymentType,
      accountId: paymentType ? accountId : null,
      notes,
      items,
      createdBy: userId,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
    });

    if (originalInvoiceId) {
      const invoice = await PurchaseInvoice.findById(originalInvoiceId);

      if (!invoice) {
        return res.status(404).json({
          error: "Original invoice not found",
        });
      }

      const originalQtyMap = {};
      invoice.items.forEach((item) => {
        originalQtyMap[item.productId.toString()] = item.quantity;
      });

      const previousReturns = await PurchaseReturn.find({
        originalInvoiceId,
      });

      const returnedQtyMap = {};

      previousReturns.forEach((ret) => {
        ret.items.forEach((item) => {
          const key =
            typeof item.productId === "object"
              ? item.productId._id?.toString()
              : item.productId.toString();
          if (!returnedQtyMap[key]) returnedQtyMap[key] = 0;
          returnedQtyMap[key] += item.quantity;
        });
      });

      // 🧪 Validate current items
      for (const item of items) {
        const key =
          typeof item.productId === "object"
            ? item.productId._id?.toString()
            : item.productId.toString();

        const originalQty = originalQtyMap[key] || 0;
        const alreadyReturned = returnedQtyMap[key] || 0;

        if (item.quantity + alreadyReturned > originalQty) {
          return res.status(400).json({
            error: `Return quantity exceeds original quantity for product`,
          });
        }
      }
    }

    await purchaseReturn.save();

    /* =============================
       DATE SAFE HANDLING
    ============================== */
    let dateTime = new Date(`${returnDate}T${returnTime}`);
    if (isNaN(dateTime.getTime())) {
      dateTime = new Date(returnDate);
    }

    const lines = [];

    lines.push({
      account: supplierAccountId,
      type: "debit",
      amount: totalAmount,
    });

    lines.push({
      account: purchaseReturnAccount._id,
      type: "credit",
      amount: totalAmount,
    });

    const journal = new JournalEntry({
      date: dateTime,
      time: returnTime || "",
      description: `Purchase Return - ${supplier.name} (Bill# ${billNo})`,
      sourceType: "purchase_return",
      referenceId: purchaseReturn._id,
      invoiceId: purchaseReturn._id,
      billNo,
      createdBy: userId,
      supplierId: supplier._id,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      lines,
    });

    await journal.save();

    await recalculateAccountBalance(supplierAccountId);

    if (paidAmount > 0 && paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: purchaseReturn._id,
        sourceType: "purchase_return_payment",
        billNo: purchaseReturn.billNo,
        accountId,
        counterPartyAccountId: supplierAccountId,
        amount: paidAmount,
        paymentType,
        description: `Purchase Return Payment - ${purchaseReturn.billNo}`,
      });

      await recalculateAccountBalance(supplierAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    /* =============================
       STOCK REDUCE + INVENTORY LOG
    ============================== */
    for (const item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Purchase Return #${billNo}`,
        invoiceId: purchaseReturn._id,
        invoiceModel: "PurchaseReturn",
        userId,
      });
    }

    return res.status(201).json({
      message: "✅ Purchase Return created successfully",
      purchaseReturn,
    });
  } catch (err) {
    console.error("❌ Create Purchase Return Error:", err);
    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

/* =========================================================
   ✅ GET BY ID
========================================================= */
exports.getPurchaseReturnById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const pr = await PurchaseReturn.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    const journal = await JournalEntry.findOne({
      referenceId: pr._id,
      sourceType: "purchase_return",
      createdBy: userId,
    }).populate("lines.account", "name");

    const paymentLine = journal?.lines?.find(
      (line) => line.paymentType && line.type === "debit",
    );

    return res.json({
      ...pr.toObject(),

      paymentMode: paymentLine?.paymentType || pr.paymentType || "-",

      accountId: paymentLine?.account?._id || pr.accountId || "",

      accountName: paymentLine?.account?.name || "-",

      attachmentUrl: pr.attachmentUrl || "",
      attachmentType: pr.attachmentType || "",
    });
  } catch (err) {
    console.error("❌ Get Purchase Return Error:", err);
    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

/* =========================================================
   ✅ GET ALL
========================================================= */
exports.getAllPurchaseReturns = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    /* =============================
       GET ALL RETURNS
    ============================== */
    const returns = await PurchaseReturn.find({
      createdBy: userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = [];

    for (const pr of returns) {
      /* =============================
         FIND RELATED JOURNAL
      ============================== */
      const journal = await JournalEntry.findOne({
        referenceId: pr._id,
        sourceType: "purchase_return",
        createdBy: userId,
      }).populate("lines.account", "name");

      /* =============================
         FIND PAYMENT LINE
      ============================== */
      const paymentLine = journal?.lines?.find(
        (line) => line.paymentType && line.type === "debit",
      );

      formatted.push({
        ...pr,

        paymentMode: paymentLine?.paymentType || pr.paymentType || "-",

        accountName: paymentLine?.account?.name || "-",
      });
    }

    return res.json(formatted);
  } catch (err) {
    console.error("❌ Get All Purchase Returns Error:", err);
    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

/* =========================================================
   ✅ UPDATE PURCHASE RETURN
========================================================= */
exports.updatePurchaseReturn = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      billNo,
      returnDate,
      returnTime,
      supplierId,
      supplierPhone,
      totalAmount,
      paidAmount = 0,
      paymentType,
      accountId,
      notes,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    /* =============================
       FIND EXISTING RECORD
    ============================== */
    const pr = await PurchaseReturn.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    /* =============================
       VALIDATION
    ============================== */
    if (!supplierId || items.length === 0) {
      return res.status(400).json({
        error: "Supplier and items required",
      });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        error: "Invalid total amount",
      });
    }

    if (paidAmount > totalAmount) {
      return res.status(400).json({
        error: "Paid amount cannot exceed total amount",
      });
    }

    /* =============================
       SUPPLIER VALIDATION
    ============================== */
    const supplier = await Supplier.findOne({
      _id: supplierId,
      createdBy: userId,
    });

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const supplierAccountId =
      typeof supplier.account === "object"
        ? supplier.account?._id
        : supplier.account;

    if (!supplierAccountId) {
      return res.status(400).json({
        error: "Supplier account not linked",
      });
    }

    /* =============================
       ACCOUNTS VALIDATION
    ============================== */
    const purchaseReturnAccount = await Account.findOne({
      code: "PURCHASE_RETURN",

      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    if (!purchaseReturnAccount || !inventoryAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    /* =============================
       🔁 STEP 2: DELETE OLD LOGS
    ============================== */
    await deleteTransactionsByReference({
      referenceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    await JournalEntry.deleteOne({
      referenceId: pr._id,
      sourceType: "purchase_return",
      createdBy: userId,
    });

    await JournalEntry.deleteMany({
      referenceId: pr._id,
      sourceType: "purchase_return_payment",
      createdBy: userId,
    });

    /* =============================
       UPDATE MAIN DOCUMENT
    ============================== */
    pr.billNo = billNo;
    pr.returnDate = returnDate;
    pr.returnTime = returnTime;
    pr.supplierId = supplier._id;
    pr.supplierName = supplier.name;
    pr.supplierPhone = supplierPhone;
    pr.totalAmount = totalAmount;
    pr.paidAmount = paidAmount;
    pr.paymentType = paymentType;
    pr.accountId = paymentType ? accountId : null;
    pr.notes = notes;
    pr.items = items;

    if (req.file) {
      pr.attachmentUrl = req.file.filename;
      pr.attachmentType = req.file.mimetype?.split("/")[0] || "";
    }

    await pr.save();

    /* =============================
       DATE SAFE
    ============================== */
    let dateTime = new Date(`${returnDate}T${returnTime}`);
    if (isNaN(dateTime.getTime())) {
      dateTime = new Date(returnDate);
    }

    /* =============================
       REBUILD JOURNAL
    ============================== */
    const lines = [];

    // 🟢 Supplier Debit
    lines.push({
      account: supplierAccountId,
      type: "debit",
      amount: totalAmount,
    });

    // 🔴 Purchase Return
    lines.push({
      account: purchaseReturnAccount._id,
      type: "credit",
      amount: totalAmount,
    });

    // 🔴 Inventory
    lines.push({
      account: inventoryAccount._id,
      type: "credit",
      amount: totalAmount,
    });

    const journal = new JournalEntry({
      date: dateTime,
      time: returnTime || "",
      description: `Purchase Return - ${supplier.name} (Bill# ${billNo})`,
      sourceType: "purchase_return",
      referenceId: pr._id,
      invoiceId: pr._id,
      billNo,
      createdBy: userId,
      supplierId: supplier._id,
      attachmentUrl: pr.attachmentUrl || "",
      attachmentType: pr.attachmentType || "",
      lines,
    });

    await journal.save();

    await recalculateAccountBalance(supplierAccountId);

    if (paidAmount > 0 && paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: pr._id,
        sourceType: "purchase_return_payment",
        billNo: pr.billNo,
        accountId,
        counterPartyAccountId: supplierAccountId,
        amount: paidAmount,
        paymentType,
        description: `Purchase Return Payment - ${pr.billNo}`,
      });

      await recalculateAccountBalance(supplierAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    /* =============================
       🔁 STEP 3: APPLY NEW STOCK
    ============================== */
    for (const item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Updated Purchase Return #${billNo}`,
        invoiceId: pr._id,
        invoiceModel: "PurchaseReturn",
        userId,
      });
    }

    return res.json({
      message: "✅ Purchase Return updated successfully",
      purchaseReturn: pr,
    });
  } catch (err) {
    console.error("❌ Update Purchase Return Error:", err);
    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

/* =========================================================
   ✅ DELETE PURCHASE RETURN
========================================================= */
exports.deletePurchaseReturn = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    /* =============================
       FIND RECORD
    ============================== */
    const pr = await PurchaseReturn.findOne({
      _id: id,
      createdBy: userId,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found or already deleted",
      });
    }

    /* =============================
       🔁 STEP 1: REVERSE STOCK
    ============================== */
    await deleteTransactionsByReference({
      referenceId: id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    /* =============================
       🔁 STEP 3: DELETE JOURNAL ENTRY
    ============================== */
    await JournalEntry.deleteOne({
      referenceId: id,
      sourceType: "purchase_return",
      createdBy: userId,
    });

    await JournalEntry.deleteMany({
      referenceId: pr._id,
      sourceType: "purchase_return_payment",
      createdBy: userId,
    });

    if (pr.accountId) {
      await recalculateAccountBalance(pr.accountId);
    }

    const supplier = await Supplier.findById(pr.supplierId);
    if (supplier?.account) {
      await recalculateAccountBalance(supplier.account);
    }

    /* =============================
       🔁 STEP 4: DELETE MAIN DOCUMENT
    ============================== */
    const result = await PurchaseReturn.deleteOne({
      _id: id,
      createdBy: userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Delete failed",
      });
    }

    return res.json({
      message: "✅ Purchase Return deleted successfully",
    });
  } catch (err) {
    console.error("❌ Delete Purchase Return Error:", err);
    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};
