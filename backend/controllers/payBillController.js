const mongoose = require("mongoose");
const PayBill = require("../models/PayBill");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { createPaymentEntry } = require("../utils/paymentService");
const Account = require("../models/Account");

const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");
const { logActivity } = require("../utils/activityLogger");
const ALLOWED_PAYMENT_TYPES = ["cash", "online", "cheque"];

function formatPayBillAttachments(bill) {
  if (bill.attachments?.length > 0) {
    return bill.attachments.map((att) => {
      const plainAtt = att.toObject ? att.toObject() : att;

      return {
        ...plainAtt,
        fullUrl: getFileUrl(plainAtt.key),
      };
    });
  }

  if (bill.attachment) {
    return [
      {
        key: bill.attachment,
        type: "",
        size: 0,
        originalName: "",
        fullUrl: bill.attachment.startsWith("users/")
          ? getFileUrl(bill.attachment)
          : `/${bill.attachment}`,
      },
    ];
  }

  return [];
}

async function uploadPayBillFiles(files, userId) {
  const attachments = [];

  if (!files || files.length === 0) return attachments;

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const uploaded = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName: "pay-bills",
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    attachments.push({
      key: uploaded.key,
      type: uploaded.mimeType,
      size: uploaded.size,
      originalName: uploaded.originalName,
    });
  }

  return attachments;
}

async function deletePayBillAttachment(att) {
  if (!att?.key) return;

  if (att.key.startsWith("users/")) {
    await deleteFile(att.key);
  }
}

// ✅ Create Pay Bill
exports.createPayBill = async (req, res) => {
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

    const payments =
      typeof paymentEntries === "string"
        ? JSON.parse(paymentEntries || "[]")
        : paymentEntries || [];
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

    const attachments = await uploadPayBillFiles(req.files, userId);
    const attachmentPath = attachments[0]?.key || "";

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
        isDeleted: false,
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
      attachments,
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

    await logActivity({
      req,
      action: "create",
      module: "pay_bills",
      entityType: "PayBill",
      entityId: newBill._id,
      title: `Pay Bill ${newBill.billNo}`,
      description: `${
        supplierData?.name || partyData?.name || "Supplier"
      } کو Payment کی گئی`,
      billNo: newBill.billNo,
      after: {
        supplier: newBill.supplier,
        partyId: newBill.partyId,
        supplierName: supplierData?.name || partyData?.name || "",
        date: newBill.date,
        time: newBill.time,
        amount: newBill.amount,
        discountAmount: newBill.discountAmount,
        finalAmount: newBill.finalAmount,
        paymentType: newBill.paymentType,
        description: newBill.description,
        paymentEntryCount: payments.length,
      },
    });

    res.status(201).json({
      message: "Bill created successfully",
      data: newBill,
    });
  } catch (err) {
    console.error("❌ Pay Bill Save Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Get All Pay Bills
exports.getAllPayBills = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      page = 1,
      limit = 20,
      search = "",
      supplier = "",
      paymentType = "",
      fromDate = "",
      toDate = "",
    } = req.query;

    const activeSuppliers = await Supplier.find({
      userId,
      isDeleted: false,
    }).select("_id");

    const activeParties = await Party.find({
      userId,
      isDeleted: false,
      isActive: true,
    }).select("_id");

    const filter = {
      userId,
      isDeleted: false,
      $or: [
        { supplier: { $in: activeSuppliers.map((s) => s._id) } },
        { partyId: { $in: activeParties.map((p) => p._id) } },
      ],
    };

    if (supplier) {
      filter.$or = [{ supplier }, { partyId: supplier }];
    }

    if (paymentType) {
      filter.paymentType = paymentType.toLowerCase();
    }

    if (fromDate || toDate) {
      filter.date = {};

      if (fromDate) filter.date.$gte = fromDate;
      if (toDate) filter.date.$lte = toDate;
    }

    if (search) {
      filter.billNo = {
        $regex: search,
        $options: "i",
      };
    }

    const totalBills = await PayBill.countDocuments(filter);

    const bills = await PayBill.find(filter)
      .populate("supplier", "name")
      .populate("partyId", "name")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const billIds = bills.map((b) => b._id);

    const journals = await JournalEntry.find({
      referenceId: { $in: billIds },
      sourceType: "pay_bill",
      createdBy: userId,
      isDeleted: false,
    }).populate("lines.account", "name");

    const journalMap = new Map();

    journals.forEach((journal) => {
      if (!journalMap.has(String(journal.referenceId))) {
        journalMap.set(String(journal.referenceId), journal);
      }
    });

    const result = bills.map((bill) => {
      const journal = journalMap.get(String(bill._id));

      const creditLine = journal?.lines?.find((line) => line.type === "credit");

      const attachments = formatPayBillAttachments(bill);

      return {
        ...bill,
        attachments,
        attachmentFullUrl: attachments[0]?.fullUrl || "",
        paymentMode: creditLine?.paymentType || "-",
        accountName: creditLine?.account?.name || "-",
        supplierName: bill.supplier?.name || bill.partyId?.name || "-",
      };
    });

    res.json({
      bills: result,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalBills,
        totalPages: Math.ceil(totalBills / Number(limit)),
        hasPreviousPage: Number(page) > 1,
        hasNextPage: Number(page) < Math.ceil(totalBills / Number(limit)),
      },
    });
  } catch (err) {
    console.error("❌ Get Pay Bills Error:", err);
    res.status(500).json({
      error: err.message,
    });
  }
};

// ✅ Get One Pay Bill
exports.getPayBillById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const bill = await PayBill.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    })
      .select(
        [
          "supplier",
          "partyId",
          "date",
          "time",
          "billNo",
          "amount",
          "discountAmount",
          "finalAmount",
          "paymentType",
          "description",
          "attachments",
          "attachment",
          "createdAt",
        ].join(" "),
      )
      .populate({
        path: "supplier",
        select: "name phone email account",
      })
      .populate({
        path: "partyId",
        select: "name phone email account",
      })
      .lean();

    if (!bill) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    const journals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
      createdBy: userId,
      isDeleted: false,
    })
      .select("lines")
      .lean();

    const paymentEntries = [];

    for (const journal of journals) {
      if (!Array.isArray(journal?.lines)) continue;

      const entries = journal.lines
        .filter((line) => line.type === "credit")
        .map((line) => ({
          account: line.account,
          amount: Number(line.amount || 0),
          paymentType: line.paymentType || bill.paymentType || "cash",
        }));

      paymentEntries.push(...entries);
    }

    const attachments = formatPayBillAttachments(bill);

    return res.json({
      ...bill,
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
      paymentEntries,
    });
  } catch (err) {
    console.error("❌ Get Single Bill Error:", err);

    return res.status(500).json({
      error: err.message || "Pay Bill load failed",
    });
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

    const payments =
      typeof paymentEntries === "string"
        ? JSON.parse(paymentEntries || "[]")
        : paymentEntries || [];

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

    const bill = await PayBill.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    });

    if (!bill) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    const beforeUpdate = {
      supplier: bill.supplier,
      partyId: bill.partyId,
      date: bill.date,
      time: bill.time,
      amount: bill.amount,
      discountAmount: bill.discountAmount,
      finalAmount: bill.finalAmount,
      paymentType: bill.paymentType,
      billNo: bill.billNo,
      description: bill.description,
    };

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
        isDeleted: false,
      }).populate("account");

      if (!supplierData || !supplierData.account) {
        return res.status(404).json({
          error: "Supplier or linked account not found",
        });
      }

      counterPartyAccountId = supplierData.account._id;
    }

    const billNo = bill.billNo || "PB-1001";

    let attachments = formatPayBillAttachments(bill).map((att) => ({
      key: att.key,
      type: att.type || "",
      size: att.size || 0,
      originalName: att.originalName || "",
    }));

    let keepAttachmentKeys = [];

    try {
      keepAttachmentKeys = JSON.parse(req.body.keepAttachmentKeys || "[]");
    } catch (err) {
      keepAttachmentKeys = [];
    }

    const removedAttachments = attachments.filter(
      (att) => !keepAttachmentKeys.includes(att.key),
    );

    for (const att of removedAttachments) {
      await deletePayBillAttachment(att);
    }

    attachments = attachments.filter((att) =>
      keepAttachmentKeys.includes(att.key),
    );

    const newAttachments = await uploadPayBillFiles(req.files, userId);

    if (attachments.length + newAttachments.length > 3) {
      for (const att of newAttachments) {
        await deletePayBillAttachment(att);
      }

      return res.status(400).json({
        error: "Maximum 3 attachments allowed",
      });
    }

    attachments = [...attachments, ...newAttachments];

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

    bill.attachments = attachments;
    bill.attachment = attachments[0]?.key || "";

    await bill.save();

    const oldJournals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
      createdBy: userId,
      isDeleted: false,
    });

    const oldAccountIds = [
      ...new Set(
        oldJournals.flatMap((entry) =>
          entry.lines.map((line) => line.account.toString()),
        ),
      ),
    ];

    await JournalEntry.updateMany(
      {
        referenceId: bill._id,
        sourceType: "pay_bill",
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    for (const accountId of oldAccountIds) {
      await safeRecalculate(accountId);
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

    await logActivity({
      req,
      action: "update",
      module: "pay_bills",
      entityType: "PayBill",
      entityId: bill._id,
      title: `Pay Bill ${bill.billNo}`,
      description: `${
        supplierData?.name || partyData?.name || "Supplier"
      } کی Pay Bill Update کی گئی`,
      billNo: bill.billNo,
      before: beforeUpdate,
      after: {
        supplier: bill.supplier,
        partyId: bill.partyId,
        supplierName: supplierData?.name || partyData?.name || "",
        date: bill.date,
        time: bill.time,
        amount: bill.amount,
        discountAmount: bill.discountAmount,
        finalAmount: bill.finalAmount,
        paymentType: bill.paymentType,
        billNo: bill.billNo,
        description: bill.description,
        paymentEntryCount: payments.length,
      },
    });

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

    const bill = await PayBill.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    });

    if (!bill) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    const beforeDelete = {
      supplier: bill.supplier,
      partyId: bill.partyId,
      date: bill.date,
      time: bill.time,
      amount: bill.amount,
      discountAmount: bill.discountAmount,
      finalAmount: bill.finalAmount,
      paymentType: bill.paymentType,
      billNo: bill.billNo,
      description: bill.description,
    };

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
        isDeleted: false,
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
      createdBy: userId,
      isDeleted: false,
    });

    const attachmentsToDelete = formatPayBillAttachments(bill);

    for (const att of attachmentsToDelete) {
      await deletePayBillAttachment(att);
    }

    await JournalEntry.updateMany(
      {
        referenceId: bill._id,
        sourceType: "pay_bill",
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    bill.isDeleted = true;
    await bill.save();

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

    await logActivity({
      req,
      action: "delete",
      module: "pay_bills",
      entityType: "PayBill",
      entityId: bill._id,
      title: `Pay Bill ${bill.billNo}`,
      description: `Pay Bill ${bill.billNo} Delete کی گئی`,
      billNo: bill.billNo,
      before: beforeDelete,
      after: {
        isDeleted: true,
      },
    });

    res.json({
      message: "Bill deleted successfully",
    });
  } catch (err) {
    console.error("❌ Delete Pay Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
