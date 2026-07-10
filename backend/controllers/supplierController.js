// backend/controllers/supplierController.js
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const Counter = require("../models/Counter");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const XLSX = require("xlsx");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getSupplierBalanceFromJournal } = require("../utils/balanceHelper");
const PurchaseInvoice = require("../models/purchaseInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const escapeRegex = (text = "") => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const generateAccountCode = async (userId) => {
  const lastAccount = await Account.findOne({
    userId,
    code: { $regex: /^ACC-\d+$/ },
  }).sort({ createdAt: -1 });

  let code = "ACC-0001";

  if (lastAccount?.code) {
    const lastNum = Number(lastAccount.code.replace("ACC-", ""));
    if (!isNaN(lastNum)) {
      code = `ACC-${String(lastNum + 1).padStart(4, "0")}`;
    }
  }

  return code;
};

/* ───────────── Create Supplier ───────────── */
exports.createSupplier = async (req, res) => {
  try {
    const { name, phone, email, address, notes, openingBalance, supplierType } =
      req.body;
    const userId = req.user.id;

    // ❌ Duplicate check
    const existing = await Supplier.findOne({ name, userId });
    if (existing) {
      return res.status(400).json({ message: "Supplier already exists" });
    }

    // ✅ Generate new account code
    const lastAccount = await Account.findOne({
      userId,
      code: { $regex: /^ACC-\d+$/ },
    }).sort({ createdAt: -1 });
    let code = "ACC-0001";

    if (lastAccount && lastAccount.code) {
      const lastNum = Number(lastAccount.code.replace("ACC-", ""));
      if (!isNaN(lastNum)) {
        code = `ACC-${String(lastNum + 1).padStart(4, "0")}`;
      }
    }

    // ✅ Create associated account (chart of account)
    const account = await Account.create({
      userId,
      name,
      code,
      type: "Liability",
      normalBalance: "credit",
      category: "supplier",
      openingBalance: Number(openingBalance) || 0,
    });

    // ✅ Create supplier record
    const supplier = await Supplier.create({
      name,
      phone,
      email,
      address,
      notes,
      openingBalance,
      supplierType,
      userId,
      account: account._id,
    });

    // ✅ Create opening journal entry (if applicable)
    const parsedOpeningBalance = Number(openingBalance) || 0;

    if (parsedOpeningBalance !== 0) {
      let openingBalanceAccount = await Account.findOne({
        userId,
        code: "OPENING_BALANCE",
      });

      if (!openingBalanceAccount) {
        openingBalanceAccount = await Account.create({
          userId,
          name: "opening balance equity",
          type: "Equity",
          category: "other",
          code: "OPENING_BALANCE",
          normalBalance: "credit",
          isSystem: true,
        });
      }

      // ✅ POSITIVE OPENING → Purchase Invoice
      if (parsedOpeningBalance > 0) {
        const openingInvoice = await PurchaseInvoice.create({
          billNo: "OPENING",
          invoiceDate: new Date(),
          supplier: supplier._id,
          supplierName: supplier.name,
          supplierPhone: supplier.phone || "",

          items: [],

          totalAmount: parsedOpeningBalance,
          grandTotal: parsedOpeningBalance,
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
          supplierId: supplier._id,
          referenceId: openingInvoice._id,
          invoiceId: openingInvoice._id,

          lines: [
            {
              account: openingBalanceAccount._id,
              type: "debit",
              amount: parsedOpeningBalance,
            },
            {
              account: account._id,
              type: "credit",
              amount: parsedOpeningBalance,
            },
          ],
        });
      }

      // ✅ NEGATIVE OPENING → Purchase Return
      if (parsedOpeningBalance < 0) {
        const absAmount = Math.abs(parsedOpeningBalance);

        const openingReturn = await PurchaseReturn.create({
          billNo: "OPENING",

          returnDate: new Date(),

          supplierId: supplier._id,
          supplierName: supplier.name,
          supplierPhone: supplier.phone || "",

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
          supplierId: supplier._id,
          referenceId: openingReturn._id,
          invoiceId: openingReturn._id,

          lines: [
            {
              account: account._id,
              type: "debit",
              amount: absAmount,
            },
            {
              account: openingBalanceAccount._id,
              type: "credit",
              amount: absAmount,
            },
          ],
        });
      }

      await recalculateAccountBalance(account._id);
    }

    res.status(201).json(supplier);
  } catch (err) {
    console.error("❌ Supplier create error:", err);
    res.status(400).json({ message: err.message });
  }
};

/* ───────────── Get Suppliers ───────────── */
exports.getSuppliers = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      search = "",
      type = "",
      status = "active",
      sort = "createdAt",
      page = 1,
      limit = 0,
    } = req.query;

    const query = {
      userId,
    };

    // ✅ Active / Hidden / All
    if (status === "active") {
      query.isDeleted = false;
    } else if (status === "hidden") {
      query.isDeleted = true;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (type) {
      query.supplierType = type;
    }

    let suppliers = await Supplier.find(query).sort({ [sort]: 1 });

    // ✅ پرانے hidden records کی وجہ خود پہچاننا
    if (status === "hidden" || status === "all") {
      const oldHiddenSuppliers = suppliers.filter(
        (supplier) => supplier.isDeleted === true && !supplier.hiddenReason,
      );

      for (const supplier of oldHiddenSuppliers) {
        const matchingParty = await Party.exists({
          name: new RegExp(`^${escapeRegex(supplier.name)}$`, "i"),
          userId,
          isDeleted: false,
          isActive: true,
        });

        const matchingActiveSupplier = await Supplier.exists({
          _id: { $ne: supplier._id },
          name: new RegExp(`^${escapeRegex(supplier.name)}$`, "i"),
          userId,
          isDeleted: false,
        });

        if (matchingParty) {
          supplier.hiddenReason = "converted";
        } else if (matchingActiveSupplier) {
          supplier.hiddenReason = "merged";
        } else {
          supplier.hiddenReason = "deleted";
        }

        supplier.supplierType = "blocked";
        await supplier.save();
      }

      suppliers = await Supplier.find(query).sort({ [sort]: 1 });
    }

    if (Number(limit) > 0) {
      const start = (Number(page) - 1) * Number(limit);
      suppliers = suppliers.slice(start, start + Number(limit));
    }

    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (supplier) => {
        const balance = await getSupplierBalanceFromJournal(
          supplier._id,
          userId,
        );

        return {
          ...supplier.toObject(),
          balance,
        };
      }),
    );

    return res.json(suppliersWithBalance);
  } catch (err) {
    console.error("❌ Supplier fetch error:", err);

    return res.status(500).json({
      message: "Supplier fetch failed",
      error: err.message,
    });
  }
};

/* ───────────── Update Supplier ───────────── */
// ✅ Update Supplier (with Merge Logic – PRO LEVEL)
exports.updateSupplier = async (req, res) => {
  try {
    const userId = req.user.id;
    const supplierId = req.params.id;

    const { name, phone, email, address, notes, openingBalance, supplierType } =
      req.body;

    // 1️⃣ Current supplier (جو edit ہو رہا ہے)
    const currentSupplier = await Supplier.findOne({
      _id: supplierId,
      userId,
      isDeleted: false,
    });

    if (!currentSupplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // 2️⃣ اگر نام change ہو رہا ہے
    if (
      name &&
      name.trim().toLowerCase() !== currentSupplier.name.trim().toLowerCase()
    ) {
      // same نام والا دوسرا supplier
      const otherSupplier = await Supplier.findOne({
        name: new RegExp(`^${name}$`, "i"),
        userId,
        isDeleted: false,
        _id: { $ne: currentSupplier._id },
      });

      if (otherSupplier) {
        // 3️⃣ دونوں suppliers کے ledger check
        const currentLedgerCount = await JournalEntry.countDocuments({
          supplierId: currentSupplier._id,
          isDeleted: false,
        });

        const otherLedgerCount = await JournalEntry.countDocuments({
          supplierId: otherSupplier._id,
          isDeleted: false,
        });

        // 4️⃣ اگر دونوں کے ledger موجود ہیں → MERGE REQUIRED
        if (currentLedgerCount > 0 && otherLedgerCount > 0) {
          return res.status(200).json({
            mergeRequired: true,
            message: "Supplier with same name exists. Merge required.",
            sourceSupplierId: currentSupplier._id,
            targetSupplierId: otherSupplier._id,
          });
        }

        // 5️⃣ ورنہ rename allow نہیں
        return res.status(400).json({
          message:
            "Supplier name already exists. Please choose a different name.",
        });
      }
    }

    // 6️⃣ Safe update (no conflict)
    currentSupplier.name = name || currentSupplier.name;
    currentSupplier.phone = phone || currentSupplier.phone;
    currentSupplier.email = email || currentSupplier.email;
    currentSupplier.address = address || currentSupplier.address;
    currentSupplier.notes = notes || currentSupplier.notes;
    currentSupplier.supplierType = supplierType || currentSupplier.supplierType;

    // =====================================================
    // ✅ OPENING BALANCE UPDATE HANDLING
    // =====================================================

    const parsedOpeningBalance = Number(openingBalance) || 0;

    // 🔥 OLD opening journals remove
    await JournalEntry.updateMany(
      {
        supplierId: currentSupplier._id,
        sourceType: {
          $in: [
            "opening_balance",
            "opening_purchase_invoice",
            "opening_purchase_return",
          ],
        },
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    // 🔥 OLD opening purchase invoices remove
    await PurchaseInvoice.updateMany(
      {
        supplier: currentSupplier._id,
        billNo: "OPENING",
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    // 🔥 OLD opening purchase returns remove
    await PurchaseReturn.updateMany(
      {
        supplierId: currentSupplier._id,
        billNo: "OPENING",
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    // 🔥 recreate opening journal
    if (parsedOpeningBalance !== 0) {
      let openingBalanceAccount = await Account.findOne({
        userId,
        code: "OPENING_BALANCE",
      });

      if (!openingBalanceAccount) {
        openingBalanceAccount = await Account.create({
          userId,
          name: "opening balance equity",
          type: "Equity",
          category: "other",
          code: "OPENING_BALANCE",
          normalBalance: "credit",
          isSystem: true,
        });
      }

      // 🔥 remove old opening invoice references
      await JournalEntry.updateMany(
        {
          supplierId: currentSupplier._id,
          sourceType: {
            $in: ["opening_purchase_invoice", "opening_purchase_return"],
          },
        },
        {
          $unset: {
            invoiceId: "",
            referenceId: "",
          },
        },
      );

      // ✅ opening purchase invoice
      if (parsedOpeningBalance > 0) {
        const openingInvoice = await PurchaseInvoice.create({
          billNo: "OPENING",

          invoiceDate: new Date(),

          supplier: currentSupplier._id,
          supplierName: currentSupplier.name,
          supplierPhone: currentSupplier.phone || "",

          items: [],

          totalAmount: parsedOpeningBalance,
          grandTotal: parsedOpeningBalance,

          paidAmount: 0,

          status: "Unpaid",

          paymentType: "credit",

          userId,
        });

        await JournalEntry.create({
          date: new Date(),
          description: "Opening Purchase Invoice",
          createdBy: userId,
          sourceType: "opening_purchase_invoice",

          supplierId: currentSupplier._id,

          referenceId: openingInvoice._id,
          invoiceId: openingInvoice._id,

          lines: [
            {
              account: openingBalanceAccount._id,
              type: "debit",
              amount: parsedOpeningBalance,
            },
            {
              account: currentSupplier.account,
              type: "credit",
              amount: parsedOpeningBalance,
            },
          ],
        });
      }

      // ✅ opening purchase return
      if (parsedOpeningBalance < 0) {
        const absAmount = Math.abs(parsedOpeningBalance);

        const openingReturn = await PurchaseReturn.create({
          billNo: "OPENING",

          returnDate: new Date(),

          supplierId: currentSupplier._id,
          supplierName: currentSupplier.name,
          supplierPhone: currentSupplier.phone || "",

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

          supplierId: currentSupplier._id,

          referenceId: openingReturn._id,
          invoiceId: openingReturn._id,

          lines: [
            {
              account: currentSupplier.account,
              type: "debit",
              amount: absAmount,
            },
            {
              account: openingBalanceAccount._id,
              type: "credit",
              amount: absAmount,
            },
          ],
        });
      }
    }

    currentSupplier.openingBalance = parsedOpeningBalance;

    await currentSupplier.save();

    await recalculateAccountBalance(currentSupplier.account);

    res.json(currentSupplier);
  } catch (error) {
    console.error("❌ Update Supplier Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ CONFIRM MERGE SUPPLIER (SAFE ACCOUNTING VERSION)
exports.confirmMergeSupplier = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceSupplierId, targetSupplierId } = req.body;

    if (!sourceSupplierId || !targetSupplierId) {
      return res.status(400).json({
        message: "Invalid merge request",
      });
    }

    if (sourceSupplierId === targetSupplierId) {
      return res.status(400).json({
        message: "Cannot merge same supplier",
      });
    }

    // ✅ Fetch suppliers
    const sourceSupplier = await Supplier.findOne({
      _id: sourceSupplierId,
      userId,
      isDeleted: false,
    });

    const targetSupplier = await Supplier.findOne({
      _id: targetSupplierId,
      userId,
      isDeleted: false,
    });

    if (!sourceSupplier || !targetSupplier) {
      return res.status(404).json({
        message: "Supplier not found",
      });
    }

    // ✅ Safety checks
    if (!sourceSupplier.account || !targetSupplier.account) {
      return res.status(400).json({
        message: "Supplier account missing",
      });
    }

    // ✅ MOVE ALL JOURNAL ENTRIES SAFELY

    const journals = await JournalEntry.find({
      supplierId: sourceSupplier._id,
      createdBy: userId,
      isDeleted: false,
    });

    let movedTransactions = 0;

    for (const journal of journals) {
      journal.supplierId = targetSupplier._id;

      // ✅ IMPORTANT:

      journal.lines = journal.lines.map((line) => {
        if (line.account?.toString() === sourceSupplier.account.toString()) {
          return {
            ...line,
            account: targetSupplier.account,
          };
        }

        return line;
      });

      await journal.save();
      movedTransactions++;
    }

    await recalculateAccountBalance(targetSupplier.account);
    await recalculateAccountBalance(sourceSupplier.account);

    // ✅ DEACTIVATE OLD SUPPLIER

    sourceSupplier.isDeleted = true;
    sourceSupplier.supplierType = "blocked";
    sourceSupplier.hiddenReason = "merged";

    await sourceSupplier.save();

    await Account.updateOne(
      { _id: sourceSupplier.account },
      {
        $set: {
          isActive: false,
        },
      },
    );

    return res.json({
      message: "Suppliers merged successfully",
      mergedInto: targetSupplier._id,
      movedTransactions,
    });
  } catch (error) {
    console.error("❌ Confirm Merge Supplier Error:", error);

    res.status(500).json({
      message: "Merge failed",
      error: error.message,
    });
  }
};

// ✅ Smart Delete Supplier (PRO LEVEL – Safe Accounting)
exports.deleteSupplier = async (req, res) => {
  try {
    const userId = req.user.id;
    const supplierId = req.params.id;

    // 1️⃣ Supplier نکالو
    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId,
      isDeleted: false,
    });

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // 2️⃣ Check: supplier ka ledger hai ya nahi
    const hasLedger = await JournalEntry.exists({
      supplierId: supplier._id,
      isDeleted: false,
    });

    if (hasLedger) {
      supplier.isDeleted = true;
      supplier.supplierType = "blocked";
      supplier.hiddenReason = "deleted";

      await supplier.save();

      // ✅ Linked account بھی inactive
      await Account.updateOne(
        { _id: supplier.account, userId },
        {
          $set: {
            isActive: false,
          },
        },
      );

      return res.json({
        message: "Supplier has transactions, moved to hidden",
        status: "inactive",
        hiddenReason: "deleted",
      });
    }

    // 🟢 CASE 2: Ledger nahi hai → permanent delete
    await Supplier.deleteOne({ _id: supplier._id });

    // delete linked account also
    await Account.deleteOne({ _id: supplier.account });

    return res.json({
      message: "Supplier deleted permanently (no transactions)",
      status: "deleted",
    });
  } catch (error) {
    console.error("❌ Smart Delete Supplier Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ Restore deleted Supplier from Hidden
exports.restoreSupplier = async (req, res) => {
  try {
    const userId = req.user.id;
    const supplierId = req.params.id;

    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId,
      isDeleted: true,
    });

    if (!supplier) {
      return res.status(404).json({
        message: "Hidden supplier not found",
      });
    }

    // ❌ Converted یا merged restore نہیں ہوگا
    if (supplier.hiddenReason !== "deleted") {
      return res.status(400).json({
        message: "Only deleted suppliers can be restored",
      });
    }

    // ✅ Same-name active Supplier check
    const activeSupplierExists = await Supplier.exists({
      _id: { $ne: supplier._id },
      name: new RegExp(`^${escapeRegex(supplier.name)}$`, "i"),
      userId,
      isDeleted: false,
    });

    if (activeSupplierExists) {
      return res.status(400).json({
        message: "Active supplier with same name already exists",
      });
    }

    // ✅ Same-name active Party check
    const activePartyExists = await Party.exists({
      name: new RegExp(`^${escapeRegex(supplier.name)}$`, "i"),
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (activePartyExists) {
      return res.status(400).json({
        message: "Active party with same name already exists",
      });
    }

    supplier.isDeleted = false;
    supplier.supplierType = "vendor";
    supplier.hiddenReason = null;

    await supplier.save();

    await Account.updateOne(
      {
        _id: supplier.account,
        userId,
      },
      {
        $set: {
          isActive: true,
        },
      },
    );

    return res.json({
      message: "Supplier restored successfully",
      supplier,
    });
  } catch (error) {
    console.error("❌ Restore Supplier Error:", error);

    return res.status(500).json({
      message: "Supplier restore failed",
      error: error.message,
    });
  }
};

const createPartyOpeningFromSupplier = async ({
  userId,
  party,
  partyAccountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  let openingBalanceAccount = await Account.findOne({
    userId,
    code: "OPENING_BALANCE",
  });

  if (!openingBalanceAccount) {
    openingBalanceAccount = await Account.create({
      userId,
      name: "opening balance equity",
      type: "Equity",
      normalBalance: "credit",
      code: "OPENING_BALANCE",
      category: "other",
      isSystem: true,
    });
  }

  // ✅ Positive Party Opening = Sale Invoice
  if (amount > 0) {
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
      customerName: party.name,
      customerPhone: party.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: amount,
      paidAmount: 0,
      status: "Unpaid",
      notes: "Opening Balance From Supplier",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    const journal = await JournalEntry.create({
      date: new Date(),
      description: "Opening Balance Party From Supplier",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_sale_invoice",
      invoiceId: openingInvoice._id,
      referenceId: openingInvoice._id,
      billNo: openingInvoice.billNo,
      lines: [
        {
          account: partyAccountId,
          type: "debit",
          amount,
        },
        {
          account: openingBalanceAccount._id,
          type: "credit",
          amount,
        },
      ],
    });

    openingInvoice.journalEntryId = journal._id;
    await openingInvoice.save();

    return journal;
  }

  // ✅ Negative Party Opening = Refund Invoice
  if (amount < 0) {
    const absAmount = Math.abs(amount);

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
      customerName: party.name,
      customerPhone: party.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: absAmount,
      paidAmount: 0,
      paymentType: "credit",
      notes: "Opening Balance From Supplier",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    return await JournalEntry.create({
      date: new Date(),
      description: "Opening Balance Party Refund From Supplier",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_refund_invoice",
      invoiceId: openingRefund._id,
      referenceId: openingRefund._id,
      billNo: openingRefund.billNo,
      lines: [
        {
          account: openingBalanceAccount._id,
          type: "debit",
          amount: absAmount,
        },
        {
          account: partyAccountId,
          type: "credit",
          amount: absAmount,
        },
      ],
    });
  }
};

exports.convertSupplierToParty = async (req, res) => {
  try {
    const userId = req.user.id;
    const supplierId = req.params.id;

    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId,
      isDeleted: false,
    });

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const existingParty = await Party.findOne({
      name: new RegExp(`^${escapeRegex(supplier.name)}$`, "i"),
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (existingParty) {
      return res.status(400).json({
        message: "Party with same name already exists",
      });
    }

    const supplierClosingBalance = await getSupplierBalanceFromJournal(
      supplier._id,
      userId,
    );

    // ✅ Supplier balance reverse ہوگا
    const partyOpeningBalance = supplierClosingBalance * -1;

    const code = await generateAccountCode(userId);

    const partyAccount = await Account.create({
      userId,
      name: supplier.name,
      code,
      type: "Asset",
      normalBalance: "debit",
      category: "party",
      openingBalance: 0,
    });

    const party = await Party.create({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      role: "both",
      openingBalance: partyOpeningBalance,
      account: partyAccount._id,
      userId,
    });

    await createPartyOpeningFromSupplier({
      userId,
      party,
      partyAccountId: partyAccount._id,
      openingBalance: partyOpeningBalance,
    });

    supplier.isDeleted = true;
    supplier.supplierType = "blocked";
    supplier.hiddenReason = "converted";

    await supplier.save();

    await Account.updateOne(
      { _id: supplier.account },
      { $set: { isActive: false } },
    );

    await recalculateAccountBalance(partyAccount._id);

    return res.status(201).json({
      message: "Supplier converted to party successfully",
      party,
      supplierClosingBalance,
      partyOpeningBalance,
    });
  } catch (error) {
    console.error("❌ Convert Supplier To Party Error:", error);
    return res.status(500).json({
      message: "Convert supplier to party failed",
      error: error.message,
    });
  }
};

// 📘 SUPPLIER DETAILED LEDGER (PRO LEVEL – FINAL)
exports.getSupplierDetailedLedger = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: supplierId } = req.params;
    const { startDate, endDate } = req.query;

    // 1️⃣ Supplier + account
    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId,
    }).populate("account");

    if (!supplier || !supplier.account) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const accountId = supplier.account._id.toString();

    // ===============================
    // 🔑 STEP 1: OPENING BALANCE (DATE WISE)
    // ===============================
    let openingBalance = 0;

    if (startDate) {
      const prevJournals = await JournalEntry.find({
        createdBy: userId,
        supplierId: supplier._id,
        isDeleted: false,
        date: { $lt: new Date(startDate) },
      }).lean();

      for (const entry of prevJournals) {
        for (const line of entry.lines) {
          if (line.account?.toString() === accountId) {
            openingBalance +=
              line.type === "credit" ? line.amount : -line.amount;
          }
        }
      }
    }

    // 🔄 STEP 2: MAIN LEDGER

    const match = {
      createdBy: userId,
      supplierId: supplier._id,
      isDeleted: false,
    };

    if (startDate && endDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);

      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);

      match.date = { $gte: s, $lte: e };
    }

    const journals = await JournalEntry.find(match)
      .sort({ date: 1, time: 1 })
      .lean();

    let balance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const ledger = [];

    for (const entry of journals) {
      const supplierLines = entry.lines.filter(
        (l) => l.account?.toString() === accountId,
      );

      if (supplierLines.length === 0) continue;

      let debit = 0;
      let credit = 0;

      for (const line of supplierLines) {
        if (line.type === "debit") debit += line.amount;
        if (line.type === "credit") credit += line.amount;
      }

      totalDebit += debit;
      totalCredit += credit;
      balance += credit - debit;

      const row = {
        _id: entry._id,
        referenceId: entry.referenceId || entry._id,
        date: entry.date,
        time: entry.time || "",
        billNo: entry.billNo || "",
        sourceType: entry.sourceType || "",
        description: entry.description || "",
        debit,
        credit,
        balance,
        items: [],
      };

      // 🟢 PURCHASE INVOICE (DETAIL)
      if (
        entry.sourceType === "purchase_invoice" &&
        entry.invoiceId &&
        entry.invoiceModel
      ) {
        const PurchaseInvoice = require("../models/purchaseInvoice");
        const invoice = await PurchaseInvoice.findById(
          entry.invoiceId,
        ).populate("items.productId", "name");

        if (invoice) {
          row.invoiceTotal = invoice.totalAmount;
          row.items = invoice.items.map((it) => ({
            productName: it.productId?.name || "Product",
            quantity: it.quantity,
            rate: it.price,
            total: it.total,
          }));
        }
      }

      // 🔴 PURCHASE RETURN (DETAIL)
      if (
        entry.sourceType === "purchase_return" &&
        entry.invoiceId &&
        entry.invoiceModel
      ) {
        const PurchaseReturn = require("../models/PurchaseReturn");
        const refund = await PurchaseReturn.findById(entry.invoiceId).populate(
          "items.productId",
          "name",
        );

        if (refund) {
          row.invoiceTotal = refund.totalAmount;
          row.items = refund.items.map((it) => ({
            productName: it.productId?.name || "Product",
            quantity: it.quantity,
            rate: it.price,
            total: it.total,
          }));
        }
      }

      ledger.push(row);
    }

    res.json({
      supplierId: supplier._id,
      supplierName: supplier.name,
      isDeleted: supplier.isDeleted,
      hiddenReason: supplier.hiddenReason || null,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: balance,
      ledger,
    });
  } catch (error) {
    console.error("❌ Supplier Detailed Ledger Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────── Import via Excel/CSV ───────────── */
exports.importSuppliers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File missing" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sh);

    const inserted = [];

    for (let r of rows) {
      const account = await Account.create({
        name: r.Name || "",
        type: "Liability",
        category: "supplier",
        userId: req.user.id,
      });

      const sup = await Supplier.create({
        name: r.Name || "",
        phone: r.Phone || "",
        email: r.Email || "",
        address: r.Address || "",
        notes: r.Notes || "",
        openingBalance: Number(r.OpeningBalance) || 0,
        supplierType: (r.Type || "vendor").toLowerCase(),
        userId: req.user.id,
        account: account._id,
      });

      const parsedOpeningBalance = Number(sup.openingBalance) || 0;

      if (parsedOpeningBalance !== 0) {
        let openingBalanceAccount = await Account.findOne({
          userId: req.user.id,
          code: "OPENING_BALANCE",
        });

        if (!openingBalanceAccount) {
          openingBalanceAccount = await Account.create({
            userId: req.user.id,
            name: "opening balance equity",
            type: "Equity",
            category: "other",
            code: "OPENING_BALANCE",
            normalBalance: "credit",
            isSystem: true,
          });
        }

        // ✅ opening purchase invoice
        if (parsedOpeningBalance > 0) {
          const openingInvoice = await PurchaseInvoice.create({
            billNo: "OPENING",

            invoiceDate: new Date(),

            supplier: sup._id,
            supplierName: sup.name,
            supplierPhone: sup.phone || "",

            items: [],

            totalAmount: parsedOpeningBalance,
            grandTotal: parsedOpeningBalance,

            paidAmount: 0,

            status: "Unpaid",

            paymentType: "credit",

            userId: req.user.id,
          });

          await JournalEntry.create({
            date: new Date(),
            description: "Opening Purchase Invoice",
            createdBy: req.user.id,
            sourceType: "opening_purchase_invoice",

            supplierId: sup._id,

            referenceId: openingInvoice._id,
            invoiceId: openingInvoice._id,

            lines: [
              {
                account: openingBalanceAccount._id,
                type: "debit",
                amount: parsedOpeningBalance,
              },
              {
                account: account._id,
                type: "credit",
                amount: parsedOpeningBalance,
              },
            ],
          });
        }

        // ✅ opening purchase return
        if (parsedOpeningBalance < 0) {
          const absAmount = Math.abs(parsedOpeningBalance);

          const openingReturn = await PurchaseReturn.create({
            billNo: "OPENING",

            returnDate: new Date(),

            supplierId: sup._id,
            supplierName: sup.name,
            supplierPhone: sup.phone || "",

            items: [],

            totalAmount: absAmount,

            paidAmount: 0,

            paymentType: "",

            notes: "Opening Purchase Return",

            createdBy: req.user.id,
          });

          await JournalEntry.create({
            date: new Date(),
            description: "Opening Purchase Return",
            createdBy: req.user.id,
            sourceType: "opening_purchase_return",

            supplierId: sup._id,

            referenceId: openingReturn._id,
            invoiceId: openingReturn._id,

            lines: [
              {
                account: account._id,
                type: "debit",
                amount: absAmount,
              },
              {
                account: openingBalanceAccount._id,
                type: "credit",
                amount: absAmount,
              },
            ],
          });
        }
        await recalculateAccountBalance(account._id);
      }

      inserted.push(sup);
    }

    res.json({ message: `${inserted.length} suppliers imported.` });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ message: err.message });
  }
};
