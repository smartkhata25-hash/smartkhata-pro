// backend/controllers/supplierController.js
const Supplier = require("../models/Supplier");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const XLSX = require("xlsx");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getSupplierBalanceFromJournal } = require("../utils/balanceHelper");

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
      type: "Liability", // must match enum
      normalBalance: "credit",
      category: "supplier", // or 'supplier' if enum supports it
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
    if (openingBalance > 0) {
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

      await JournalEntry.create({
        date: new Date(),
        description: "Opening Balance - Supplier",
        createdBy: userId,
        sourceType: "opening_balance",
        supplierId: supplier._id,
        lines: [
          {
            account: openingBalanceAccount._id,
            type: "debit",
            amount: Number(openingBalance),
          },
          {
            account: account._id,
            type: "credit",
            amount: Number(openingBalance),
          },
        ],
      });

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
  const {
    search = "",
    type = "",
    blocked = "",
    sort = "createdAt",
    page = 1,
    limit = 0,
  } = req.query;

  const query = { userId: req.user.id, isDeleted: false };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (type) query.supplierType = type;
  if (blocked) query.supplierType = "blocked";

  try {
    const cursor = Supplier.find(query).sort({ [sort]: 1 });
    if (+limit) cursor.skip((page - 1) * limit).limit(+limit);
    const suppliers = await cursor;

    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (sup) => {
        const balance = await getSupplierBalanceFromJournal(
          sup._id,
          req.user.id,
        );
        return {
          ...sup.toObject(),
          balance,
        };
      }),
    );

    res.json(suppliersWithBalance);
  } catch (err) {
    console.error("❌ Supplier fetch error:", err);
    res.status(500).json({ message: err.message });
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
    currentSupplier.openingBalance =
      openingBalance ?? currentSupplier.openingBalance;
    currentSupplier.supplierType = supplierType || currentSupplier.supplierType;

    await currentSupplier.save();

    res.json(currentSupplier);
  } catch (error) {
    console.error("❌ Update Supplier Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ CONFIRM MERGE SUPPLIER (FINAL PRO VERSION)
exports.confirmMergeSupplier = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceSupplierId, targetSupplierId } = req.body;

    if (!sourceSupplierId || !targetSupplierId) {
      return res.status(400).json({ message: "Invalid merge request" });
    }

    if (sourceSupplierId === targetSupplierId) {
      return res.status(400).json({ message: "Cannot merge same supplier" });
    }

    // 1️⃣ Fetch suppliers
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
      return res.status(404).json({ message: "Supplier not found" });
    }

    // 2️⃣ Move ALL Journal Entries (IMPORTANT FIX: referenceId)
    const updateResult = await JournalEntry.updateMany(
      {
        supplierId: sourceSupplier._id,
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: { supplierId: targetSupplier._id },
      },
    );

    // 3️⃣ Recalculate BOTH accounts (very important for accounting safety)
    if (targetSupplier.account) {
      await recalculateAccountBalance(targetSupplier.account);
    }

    if (sourceSupplier.account) {
      await recalculateAccountBalance(sourceSupplier.account);
    }

    // 4️⃣ Deactivate source supplier
    sourceSupplier.isDeleted = true;
    sourceSupplier.supplierType = "blocked";
    await sourceSupplier.save();

    // 5️⃣ Deactivate source account
    if (sourceSupplier.account) {
      await Account.updateOne(
        { _id: sourceSupplier.account },
        { $set: { isActive: false } },
      );
    }

    return res.json({
      message: "Suppliers merged successfully",
      mergedInto: targetSupplier._id,
      movedTransactions: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Confirm Merge Supplier Error:", error);
    res.status(500).json({ message: "Merge failed" });
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

    // 🟥 CASE 1: Ledger exists → supplier ko inactive karo
    if (hasLedger) {
      supplier.isDeleted = true;
      supplier.supplierType = "blocked"; // optional but useful
      await supplier.save();

      return res.json({
        message: "Supplier has transactions, marked as inactive",
        status: "inactive",
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
      isDeleted: false,
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

    // ===============================
    // 🔄 STEP 2: MAIN LEDGER
    // ===============================
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

    // ===============================
    // ✅ FINAL RESPONSE
    // ===============================
    res.json({
      supplierName: supplier.name,
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

      if (sup.openingBalance > 0) {
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

        await JournalEntry.create({
          date: new Date(),
          description: "Opening Balance - Supplier",
          createdBy: req.user.id,
          sourceType: "opening_balance",
          supplierId: sup._id,
          lines: [
            {
              account: openingBalanceAccount._id,
              type: "debit",
              amount: sup.openingBalance,
            },
            {
              account: account._id,
              type: "credit",
              amount: sup.openingBalance,
            },
          ],
        });

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
