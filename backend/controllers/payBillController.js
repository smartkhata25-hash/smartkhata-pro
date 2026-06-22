const mongoose = require("mongoose");
const PayBill = require("../models/PayBill");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { createPaymentEntry } = require("../utils/paymentService");
const Account = require("../models/Account");

const fs = require("fs");
const path = require("path");
const ALLOWED_PAYMENT_TYPES = ["cash", "online", "cheque"];

// ✅ Create Pay Bill
exports.createPayBill = async (req, res) => {
  try {
  } catch (e) {
    console.log("❌ paymentEntries JSON parse error", e);
  }

  try {
    const {
      supplier,
      partyId,
      date,
      time,
      description,
      paymentType,
      paymentEntries,
      discountAmount,
    } = req.body;
    const normalizedPaymentType = paymentType?.toLowerCase();

    const payments = JSON.parse(paymentEntries || "[]");
    // ✅ Per-payment paymentType validation
    for (const p of payments) {
      if (!ALLOWED_PAYMENT_TYPES.includes(p.paymentType?.toLowerCase())) {
        return res.status(400).json({
          error: "Invalid payment type in payment entries",
        });
      }
    }

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    const rawDiscount = Array.isArray(discountAmount)
      ? discountAmount[0]
      : discountAmount;

    const parsedDiscount = isNaN(Number(rawDiscount)) ? 0 : Number(rawDiscount);

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    if (parsedDiscount < 0) {
      return res.status(400).json({
        error: "Invalid discount amount",
      });
    }

    const finalAmount = totalAmount + parsedDiscount;
    const userId = req.user?.id || req.userId;
    if (!userId) return res.status(400).json({ error: "User ID is required." });

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : null;

    let supplierData = null;
    let partyData = null;
    let counterPartyAccountId = null;

    if (partyId) {
      partyData = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      }).populate("account");

      if (!partyData || !partyData.account) {
        return res.status(404).json({ error: "Party account not found" });
      }

      counterPartyAccountId = partyData.account._id;
    } else {
      supplierData = await Supplier.findOne({
        _id: supplier,
        userId,
      }).populate("account");

      if (!supplierData || !supplierData.account) {
        return res
          .status(404)
          .json({ error: "Supplier or linked account not found" });
      }

      counterPartyAccountId = supplierData.account._id;
    }

    const count = await PayBill.countDocuments({ userId });

    const billNo = `PB-${1001 + count}`;

    const newBill = await PayBill.create({
      supplier: supplierData?._id || null,
      partyId: partyData?._id || null,
      date,
      time,
      billNo,
      amount: totalAmount,
      discountAmount: parsedDiscount,
      finalAmount,
      paymentType: normalizedPaymentType,

      description,
      attachment: attachmentPath,
      userId,
    });

    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: newBill._id,
        sourceType: "pay_bill",
        billNo,
        accountId: p.account,
        counterPartyAccountId,
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || "cash",
        description: description || "Pay Bill",
        supplierId: supplierData?._id || null,
        partyId: partyData?._id || null,
      });
    }

    // ✅ Discount Journal Entry
    if (parsedDiscount > 0) {
      let purchaseDiscountAccount = await Account.findOne({
        userId,
        code: "PURCHASE_DISCOUNT",
      });

      if (!purchaseDiscountAccount) {
        purchaseDiscountAccount = await Account.create({
          userId,
          name: "purchase discount",
          type: "Income",
          normalBalance: "credit",
          code: "PURCHASE_DISCOUNT",
          category: "discount",
          isSystem: true,
        });
      }

      await JournalEntry.create({
        createdBy: userId,
        referenceId: newBill._id,
        sourceType: "pay_bill",
        date,
        time,
        billNo,
        description: "Pay Bill Discount",
        supplierId: supplierData?._id || null,
        partyId: partyData?._id || null,
        lines: [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: parsedDiscount,
          },
          {
            account: purchaseDiscountAccount._id,
            type: "credit",
            amount: parsedDiscount,
          },
        ],
      });
    }

    res
      .status(201)
      .json({ message: "Bill created successfully", data: newBill });
  } catch (err) {
    console.error("❌ Pay Bill Save Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Get All Pay Bills
exports.getAllPayBills = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const activeSuppliers = await Supplier.find({
      userId,
      isDeleted: false,
    }).select("_id");

    const activeSupplierIds = activeSuppliers.map((s) => s._id);

    const activeParties = await Party.find({
      userId,
      isDeleted: false,
      isActive: true,
    }).select("_id");

    const activePartyIds = activeParties.map((p) => p._id);

    const bills = await PayBill.find({
      userId,
      $or: [
        { supplier: { $in: activeSupplierIds } },
        { partyId: { $in: activePartyIds } },
      ],
    })
      .populate("supplier", "name")
      .sort({ createdAt: -1 });

    const result = [];

    for (const bill of bills) {
      const journal = await JournalEntry.findOne({
        referenceId: bill._id,
        sourceType: "pay_bill",
      }).populate("lines.account", "name");

      let paymentMode = "-";
      let accountName = "-";

      if (journal?.lines?.length) {
        const creditLine = journal.lines.find((line) => line.type === "credit");

        paymentMode = creditLine?.paymentType || "-";
        accountName = creditLine?.account?.name || "-";
      }

      result.push({
        ...bill.toObject(),
        paymentMode,
        accountName,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Get Pay Bills Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get One Pay Bill
exports.getPayBillById = async (req, res) => {
  try {
    const bill = await PayBill.findById(req.params.id)
      .populate("supplier", "name phone email")
      .populate("partyId", "name phone email");

    if (!bill) {
      return res.status(404).json({ error: "Record not found" });
    }

    const journals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    let paymentEntries = [];

    for (const journal of journals) {
      if (journal?.lines?.length) {
        const entries = journal.lines
          .filter((line) => line.type === "credit")
          .map((line) => ({
            account: line.account,
            amount: line.amount,
            paymentType: line.paymentType,
          }));

        paymentEntries.push(...entries);
      }
    }

    // ✅ Frontend ko complete data
    console.log("🔥 paymentEntries backend", paymentEntries);

    res.json({
      ...bill.toObject(),
      paymentEntries,
    });
  } catch (err) {
    console.error("❌ Get Single Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
// ✅ Update Pay Bill (CENTRALIZED PAYMENT SERVICE)
exports.updatePayBill = async (req, res) => {
  try {
    const {
      supplier,
      partyId,
      date,
      time,
      description,
      paymentType,
      paymentEntries,
      discountAmount,
    } = req.body;

    const normalizedPaymentType = paymentType?.toLowerCase();
    const payments = JSON.parse(paymentEntries || "[]");

    // ✅ Per-payment paymentType validation
    for (const p of payments) {
      if (!ALLOWED_PAYMENT_TYPES.includes(p.paymentType?.toLowerCase())) {
        return res.status(400).json({
          error: "Invalid payment type in payment entries",
        });
      }
    }

    if (!ALLOWED_PAYMENT_TYPES.includes(normalizedPaymentType)) {
      return res.status(400).json({
        error: "Invalid payment type. Allowed: cash, online, cheque",
      });
    }

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    const rawDiscount = Array.isArray(discountAmount)
      ? discountAmount[0]
      : discountAmount;

    const parsedDiscount = isNaN(Number(rawDiscount)) ? 0 : Number(rawDiscount);

    if (totalAmount <= 0) {
      return res.status(400).json({
        error: "Invalid payment amount",
      });
    }

    if (parsedDiscount < 0) {
      return res.status(400).json({
        error: "Invalid discount amount",
      });
    }

    const finalAmount = totalAmount + parsedDiscount;

    const userId = req.user?.id || req.userId;

    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) return res.status(404).json({ error: "Record not found" });

    // ✅ Safe recalculation helper
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      }
    };

    // 🔍 Get old supplier account
    const oldSupplierData = bill.supplier
      ? await Supplier.findById(bill.supplier).populate("account")
      : null;

    const oldPartyData = bill.partyId
      ? await Party.findById(bill.partyId).populate("account")
      : null;

    const oldSupplierAccountId =
      oldSupplierData?.account?._id || oldPartyData?.account?._id || null;

    // 🔍 Get new supplier account
    let supplierData = null;
    let partyData = null;
    let counterPartyAccountId = null;

    if (partyId) {
      partyData = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      }).populate("account");

      if (!partyData || !partyData.account) {
        return res.status(404).json({ error: "Party account not found" });
      }

      counterPartyAccountId = partyData.account._id;
    } else {
      supplierData = await Supplier.findOne({
        _id: supplier,
        userId,
      }).populate("account");

      if (!supplierData || !supplierData.account) {
        return res.status(404).json({
          error: "Supplier or linked account not found",
        });
      }

      counterPartyAccountId = supplierData.account._id;
    }

    const billNo = bill.billNo || "PB-1001";

    // ✅ Remove old attachment if replaced
    if (req.file && bill.attachment) {
      try {
        fs.unlinkSync(path.join(__dirname, "..", bill.attachment));
      } catch (e) {
        console.warn("⚠️ Could not remove old attachment:", e.message);
      }
    }

    // ✅ Update bill fields
    bill.supplier = supplierData?._id || null;
    bill.partyId = partyData?._id || null;
    bill.date = date;
    bill.time = time;

    bill.amount = totalAmount;
    bill.discountAmount = parsedDiscount;
    bill.finalAmount = finalAmount;

    bill.paymentType = normalizedPaymentType;
    bill.billNo = billNo;
    bill.description = description;

    if (req.file) {
      bill.attachment = `uploads/${req.file.filename}`;
    }

    await bill.save();

    // 🔍 Fetch old journals before deleting
    const oldJournals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // 🧹 Delete old journal entries
    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // 🔄 Recalculate old accounts (before recreating)
    for (const entry of oldJournals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🔁 Create new payment entries (MULTIPLE SAFE)
    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: bill._id,
        sourceType: "pay_bill",
        billNo,
        accountId: p.account,
        counterPartyAccountId,
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || "cash",
        description: description || "Pay Bill",
        supplierId: supplierData?._id || null,
        partyId: partyData?._id || null,
      });
    }

    // ✅ Discount Journal Entry
    if (parsedDiscount > 0) {
      let purchaseDiscountAccount = await Account.findOne({
        userId,
        code: "PURCHASE_DISCOUNT",
      });

      if (!purchaseDiscountAccount) {
        purchaseDiscountAccount = await Account.create({
          userId,
          name: "purchase discount",
          type: "Income",
          normalBalance: "credit",
          code: "PURCHASE_DISCOUNT",
          category: "discount",
          isSystem: true,
        });
      }

      await JournalEntry.create({
        createdBy: userId,
        referenceId: bill._id,
        sourceType: "pay_bill",
        date,
        time,
        billNo,
        description: "Pay Bill Discount",
        supplierId: supplierData?._id || null,
        partyId: partyData?._id || null,
        lines: [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: parsedDiscount,
          },
          {
            account: purchaseDiscountAccount._id,
            type: "credit",
            amount: parsedDiscount,
          },
        ],
      });
    }

    // 🔄 Recalculate supplier accounts
    if (oldSupplierAccountId) {
      await safeRecalculate(oldSupplierAccountId);
    }

    await safeRecalculate(counterPartyAccountId);

    res.json({
      message: "Bill updated successfully",
      data: bill,
    });
  } catch (err) {
    console.error("❌ Update Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete Pay Bill (CENTRALIZED SAFE VERSION)
exports.deletePayBill = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) {
      return res.status(404).json({ error: "Record not found" });
    }

    // 🔍 Supplier account
    let supplierData = null;
    let partyData = null;
    let counterPartyAccountId = null;

    if (bill.partyId) {
      partyData = await Party.findOne({
        _id: bill.partyId,
        userId,
      }).populate("account");

      if (!partyData || !partyData.account) {
        return res.status(404).json({ error: "Party account missing" });
      }

      counterPartyAccountId = partyData.account._id;
    } else {
      supplierData = await Supplier.findOne({
        _id: bill.supplier,
        userId,
      }).populate("account");

      if (!supplierData || !supplierData.account) {
        return res.status(404).json({ error: "Supplier or account missing" });
      }

      counterPartyAccountId = supplierData.account._id;
    }

    // 🔍 Get ALL related journals (IMPORTANT for multiple payments)
    const journals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    if (bill.attachment) {
      try {
        fs.unlinkSync(path.join(__dirname, "..", bill.attachment));
      } catch (e) {
        console.warn("⚠️ Attachment removal error:", e.message);
      }
    }

    // 🧹 Delete bill
    await bill.deleteOne();

    // 🧹 Delete all related journals
    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // ✅ Safe recalculation helper
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      }
    };

    // 🔄 Recalculate ALL involved accounts
    for (const entry of journals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🔄 Recalculate supplier account
    await safeRecalculate(counterPartyAccountId);

    res.json({
      message: "Bill deleted successfully",
    });
  } catch (err) {
    console.error("❌ Delete Pay Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
