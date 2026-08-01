const ReceivePayment = require("../models/ReceivePayment");
const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const Party = require("../models/Party");

const { recalculateAccountBalance } = require("../utils/accountHelper");
const {
  createPaymentEntry,
  createReceivePaymentDiscountEntry,
} = require("../utils/paymentService");

const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");

const fs = require("fs");
const path = require("path");
const { logActivity } = require("../utils/activityLogger");

// ATTACHMENT HELPERS

function formatAttachments(payment) {
  if (payment.attachments?.length > 0) {
    return payment.attachments.map((att) => {
      const plainAtt = att.toObject ? att.toObject() : att;

      return {
        ...plainAtt,
        fullUrl: getFileUrl(plainAtt.key),
      };
    });
  }

  if (payment.attachment) {
    const oldAttachment = payment.attachment;

    return [
      {
        key: oldAttachment,
        type: "",
        size: 0,
        originalName: "",
        fullUrl: oldAttachment.startsWith("users/")
          ? getFileUrl(oldAttachment)
          : `/${oldAttachment}`,
      },
    ];
  }

  return [];
}

async function uploadReceivePaymentFiles(files, userId) {
  const uploadedAttachments = [];

  if (!files || files.length === 0) return uploadedAttachments;

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const uploadedFile = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName: "receive-payments",
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    uploadedAttachments.push({
      key: uploadedFile.key,
      type: uploadedFile.mimeType,
      size: uploadedFile.size,
      originalName: uploadedFile.originalName,
    });
  }

  return uploadedAttachments;
}

async function deleteAttachmentSafe(att) {
  if (!att?.key) return;

  if (att.key.startsWith("users/")) {
    await deleteFile(att.key);
    return;
  }

  if (att.key.startsWith("uploads/")) {
    try {
      const filePath = path.resolve(att.key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn("⚠️ Old local attachment delete failed:", err.message);
    }
  }
}

async function safeRecalculate(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    try {
      await recalculateAccountBalance(id);
    } catch (err) {
      console.warn("⚠️ Error recalculating balance:", err.message);
    }
  }
}

async function calculateBalanceSnapshot({
  accountId,
  userId,
  beforeCreatedAt = null,
  excludeReferenceId = null,
}) {
  if (!accountId || !userId) return 0;

  const filter = {
    createdBy: userId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
    "lines.account": accountId,
  };

  if (beforeCreatedAt) {
    filter.createdAt = {
      $lt: beforeCreatedAt,
    };
  }

  if (excludeReferenceId) {
    filter.referenceId = {
      $ne: excludeReferenceId,
    };
  }

  const journals = await JournalEntry.find(filter).select("lines").lean();

  let debit = 0;
  let credit = 0;

  journals.forEach((journal) => {
    journal.lines?.forEach((line) => {
      if (String(line.account) === String(accountId)) {
        if (line.type === "debit") {
          debit += Number(line.amount || 0);
        }

        if (line.type === "credit") {
          credit += Number(line.amount || 0);
        }
      }
    });
  });

  return debit - credit;
}
// CREATE RECEIVE PAYMENT

exports.createReceivePayment = async (req, res) => {
  try {
    const {
      customer,
      partyId,
      date,
      time,
      description,
      paymentType,
      paymentEntries,
      discountAmount,
    } = req.body;

    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const payments =
      typeof paymentEntries === "string"
        ? JSON.parse(paymentEntries || "[]")
        : paymentEntries || [];

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    const rawDiscount = Array.isArray(discountAmount)
      ? discountAmount[0]
      : discountAmount;

    const parsedDiscount = isNaN(Number(rawDiscount)) ? 0 : Number(rawDiscount);

    const finalAmount = totalAmount + parsedDiscount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const uploadedAttachments = await uploadReceivePaymentFiles(
      req.files,
      userId,
    );

    const cleanPaymentType = paymentType?.toLowerCase() || "";

    let customerData = null;
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
      customerData = await Customer.findOne({
        _id: customer,
        createdBy: userId,
        isActive: true,
      }).populate("account");

      if (!customerData || !customerData.account) {
        return res.status(404).json({
          error: "Customer or linked account not found",
        });
      }

      counterPartyAccountId = customerData.account._id;
    }

    const previousBalance = await calculateBalanceSnapshot({
      accountId: counterPartyAccountId,
      userId,
    });

    const count = await ReceivePayment.countDocuments({ userId });
    const billNo = `RCV-${1001 + count}`;

    const newPayment = await ReceivePayment.create({
      customer: customerData?._id || null,
      partyId: partyData?._id || null,
      date,
      time,
      amount: totalAmount,
      discountAmount: parsedDiscount,
      finalAmount,
      previousBalance,
      paymentType: cleanPaymentType,
      billNo,
      description,
      attachments: uploadedAttachments,
      attachment: uploadedAttachments[0]?.key || "",
      userId,
    });

    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: newPayment._id,
        sourceType: "receive_payment",
        originModule: "receive_payment_form",
        billNo,
        accountId: p.account,
        counterPartyAccountId,
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || cleanPaymentType || "cash",
        description: description || "Receive Payment",
        customerId: customerData?._id || null,
        partyId: partyData?._id || null,
        entryDate: date ? new Date(`${date}T00:00:00.000+05:00`) : new Date(),
        entryTime: time || "00:00",
      });
    }

    if (parsedDiscount > 0) {
      await createReceivePaymentDiscountEntry({
        userId,
        referenceId: newPayment._id,
        billNo,
        customerAccountId: counterPartyAccountId,
        discountAmount: parsedDiscount,
        description: "Receive Payment Discount",
        originModule: "receive_payment_form",
        customerId: customerData?._id || null,
        partyId: partyData?._id || null,

        // ✅ اصل Payment کی تاریخ اور وقت
        entryDate: date ? new Date(`${date}T00:00:00.000+05:00`) : new Date(),
        entryTime: time || "00:00",
      });
    }

    await logActivity({
      req,
      action: "create",
      module: "receive_payments",
      entityType: "ReceivePayment",
      entityId: newPayment._id,
      title: `Receive Payment ${newPayment.billNo}`,
      description: `${
        customerData?.name || partyData?.name || "Party"
      } سے Payment وصول کی گئی`,
      billNo: newPayment.billNo,
      after: {
        customer: newPayment.customer,
        partyId: newPayment.partyId,
        customerName: customerData?.name || partyData?.name || "",
        date: newPayment.date,
        time: newPayment.time,
        amount: newPayment.amount,
        discountAmount: newPayment.discountAmount,
        finalAmount: newPayment.finalAmount,
        paymentType: newPayment.paymentType,
        paymentEntryCount: payments.length,
      },
    });

    res.status(201).json({
      message: "Receive payment saved successfully",
      data: newPayment,
    });
  } catch (err) {
    console.error("❌ Receive Payment Save Error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};

// GET ALL RECEIVE PAYMENTS

exports.getAllReceivePayments = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    const {
      page = 1,
      limit = 10,
      search = "",
      customer = "",
      paymentType = "",
      fromDate = "",
      toDate = "",
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (currentPage - 1) * pageLimit;

    const safeSearch = String(search || "")
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const activeCustomerQuery = {
      createdBy: userId,
      isActive: true,
    };

    const activePartyQuery = {
      userId,
      isDeleted: false,
      isActive: true,
    };

    if (safeSearch) {
      activeCustomerQuery.name = {
        $regex: safeSearch,
        $options: "i",
      };

      activePartyQuery.name = {
        $regex: safeSearch,
        $options: "i",
      };
    }

    const [
      allActiveCustomers,
      allActiveParties,
      matchedCustomers,
      matchedParties,
    ] = await Promise.all([
      Customer.find({
        createdBy: userId,
        isActive: true,
      })
        .select("_id")
        .lean(),

      Party.find({
        userId,
        isDeleted: false,
        isActive: true,
      })
        .select("_id")
        .lean(),

      safeSearch
        ? Customer.find(activeCustomerQuery).select("_id").lean()
        : Promise.resolve([]),

      safeSearch
        ? Party.find(activePartyQuery).select("_id").lean()
        : Promise.resolve([]),
    ]);

    const activeCustomerIds = allActiveCustomers.map((item) => item._id);

    const activePartyIds = allActiveParties.map((item) => item._id);

    const matchedCustomerIds = matchedCustomers.map((item) => item._id);

    const matchedPartyIds = matchedParties.map((item) => item._id);

    const filter = {
      userId,
      isDeleted: { $ne: true },
      $and: [
        {
          $or: [
            {
              customer: {
                $in: activeCustomerIds,
              },
            },
            {
              partyId: {
                $in: activePartyIds,
              },
            },
          ],
        },
      ],
    };

    if (customer && mongoose.Types.ObjectId.isValid(customer)) {
      filter.$and.push({
        $or: [
          {
            customer: new mongoose.Types.ObjectId(customer),
          },
          {
            partyId: new mongoose.Types.ObjectId(customer),
          },
        ],
      });
    }

    if (paymentType) {
      filter.paymentType = String(paymentType).toLowerCase();
    }

    if (fromDate || toDate) {
      filter.date = {};

      if (fromDate) {
        filter.date.$gte = fromDate;
      }

      if (toDate) {
        filter.date.$lte = toDate;
      }
    }

    /*
      Search Filter
    */
    if (safeSearch) {
      filter.$and.push({
        $or: [
          {
            billNo: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            description: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            paymentType: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            customer: {
              $in: matchedCustomerIds,
            },
          },
          {
            partyId: {
              $in: matchedPartyIds,
            },
          },
        ],
      });
    }

    const [totalPayments, payments] = await Promise.all([
      ReceivePayment.countDocuments(filter),

      ReceivePayment.find(filter)
        .select(
          "customer partyId date time amount discountAmount finalAmount paymentType billNo account description createdAt",
        )
        .populate("customer", "name")
        .populate("partyId", "name")
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(pageLimit)
        .lean(),
    ]);

    const paymentIds = payments.map((payment) => payment._id);

    const journals =
      paymentIds.length > 0
        ? await JournalEntry.find({
            referenceId: {
              $in: paymentIds,
            },
            sourceType: "receive_payment",
            createdBy: userId,
            isDeleted: false,
          })
            .select("referenceId lines")
            .populate("lines.account", "name")
            .lean()
        : [];

    const journalMap = new Map();

    for (const journal of journals) {
      const referenceKey = String(journal.referenceId);

      if (!journalMap.has(referenceKey)) {
        journalMap.set(referenceKey, []);
      }

      journalMap.get(referenceKey).push(journal);
    }

    const formattedPayments = payments.map((payment) => {
      const paymentJournals = journalMap.get(String(payment._id)) || [];

      let firstDebitLine = null;

      for (const journal of paymentJournals) {
        const debitLine = journal.lines?.find((line) => line.type === "debit");

        if (debitLine) {
          firstDebitLine = debitLine;
          break;
        }
      }

      return {
        ...payment,

        customerName: payment.customer?.name || payment.partyId?.name || "-",

        paymentMode: firstDebitLine?.paymentType || payment.paymentType || "-",

        accountName: firstDebitLine?.account?.name || "-",
      };
    });

    const totalPages = Math.max(Math.ceil(totalPayments / pageLimit), 1);

    return res.json({
      payments: formattedPayments,

      pagination: {
        page: currentPage,
        limit: pageLimit,
        totalPayments,
        totalPages,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
      },
    });
  } catch (err) {
    console.error("❌ Get Receive Payments Error:", err);

    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};
// GET SINGLE RECEIVE PAYMENT

exports.getReceivePaymentById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    })
      .select(
        [
          "customer",
          "partyId",
          "date",
          "time",
          "amount",
          "discountAmount",
          "finalAmount",
          "previousBalance",
          "paymentType",
          "billNo",
          "description",
          "attachments",
          "attachment",
          "createdAt",
        ].join(" "),
      )
      .populate({
        path: "customer",
        select: "name phone account",
      })
      .populate({
        path: "partyId",
        select: "name phone account",
      })
      .lean();

    if (!payment) {
      return res.status(404).json({
        error: "Record not found",
      });
    }

    const journal = await JournalEntry.findOne({
      referenceId: payment._id,
      sourceType: "receive_payment",
      createdBy: userId,
      isDeleted: false,
    })
      .select("lines")
      .lean();

    const paymentEntries = Array.isArray(journal?.lines)
      ? journal.lines
          .filter((line) => line.type === "debit")
          .map((line) => ({
            account: line.account,
            amount: Number(line.amount || 0),
            paymentType: line.paymentType || payment.paymentType || "cash",
          }))
      : [];

    const attachments = formatAttachments(payment);

    return res.json({
      ...payment,
      paymentEntries,
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
    });
  } catch (err) {
    console.error("❌ Get ReceivePayment Error:", err);

    return res.status(500).json({
      error: err.message || "Receive payment load failed",
    });
  }
};
// UPDATE RECEIVE PAYMENT

exports.updateReceivePayment = async (req, res) => {
  try {
    const {
      customer,
      partyId,
      date,
      time,
      description,
      paymentType,
      paymentEntries,
      discountAmount,
    } = req.body;

    const userId = req.user?.id || req.userId;

    const payments =
      typeof paymentEntries === "string"
        ? JSON.parse(paymentEntries || "[]")
        : paymentEntries || [];

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    const rawDiscount = Array.isArray(discountAmount)
      ? discountAmount[0]
      : discountAmount;

    const parsedDiscount = isNaN(Number(rawDiscount)) ? 0 : Number(rawDiscount);

    const finalAmount = totalAmount + parsedDiscount;

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    });

    if (!payment) {
      return res.status(404).json({ error: "Record not found" });
    }

    const beforeUpdate = {
      customer: payment.customer,
      partyId: payment.partyId,
      date: payment.date,
      time: payment.time,
      amount: payment.amount,
      discountAmount: payment.discountAmount,
      finalAmount: payment.finalAmount,
      paymentType: payment.paymentType,
      billNo: payment.billNo,
      description: payment.description,
    };

    const oldJournals = await JournalEntry.find({
      referenceId: payment._id,
      sourceType: {
        $in: ["receive_payment", "receive_payment_discount"],
      },
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

    if (
      payment.previousBalance === null ||
      payment.previousBalance === undefined
    ) {
      const oldReceiveJournal = oldJournals.find(
        (entry) => entry.sourceType === "receive_payment",
      );

      const oldCustomerLine = oldReceiveJournal?.lines?.find(
        (line) => line.type === "credit",
      );

      if (oldCustomerLine?.account && oldReceiveJournal?.createdAt) {
        payment.previousBalance = await calculateBalanceSnapshot({
          accountId: oldCustomerLine.account,
          userId,
          beforeCreatedAt: oldReceiveJournal.createdAt,
          excludeReferenceId: payment._id,
        });
      }
    }

    let currentAttachments = formatAttachments(payment).map((att) => ({
      key: att.key,
      type: att.type || "",
      size: att.size || 0,
      originalName: att.originalName || "",
    }));

    let keepAttachmentKeys = null;

    if (req.body.keepAttachmentKeys) {
      try {
        keepAttachmentKeys = JSON.parse(req.body.keepAttachmentKeys);
      } catch (err) {
        keepAttachmentKeys = null;
      }
    }

    if (Array.isArray(keepAttachmentKeys)) {
      const removedAttachments = currentAttachments.filter(
        (att) => !keepAttachmentKeys.includes(att.key),
      );

      for (const att of removedAttachments) {
        await deleteAttachmentSafe(att);
      }

      currentAttachments = currentAttachments.filter((att) =>
        keepAttachmentKeys.includes(att.key),
      );
    }

    const newAttachments = await uploadReceivePaymentFiles(req.files, userId);

    if (currentAttachments.length + newAttachments.length > 3) {
      for (const att of newAttachments) {
        await deleteAttachmentSafe(att);
      }

      return res.status(400).json({
        error: "Maximum 3 attachments allowed",
      });
    }

    const finalAttachments = [...currentAttachments, ...newAttachments];

    let customerData = null;
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
      customerData = await Customer.findOne({
        _id: customer,
        createdBy: userId,
        isActive: true,
      }).populate("account");

      if (!customerData || !customerData.account) {
        return res.status(404).json({
          error: "Customer or linked account not found",
        });
      }

      counterPartyAccountId = customerData.account._id;
    }

    const existingJournal = await JournalEntry.findOne({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    const billNo = existingJournal?.billNo || payment.billNo || "RCV-1001";

    payment.customer = customerData?._id || null;
    payment.partyId = partyData?._id || null;
    payment.date = date;
    payment.time = time;
    payment.amount = totalAmount;
    payment.discountAmount = parsedDiscount;
    payment.finalAmount = finalAmount;
    payment.paymentType = paymentType?.toLowerCase() || "";
    payment.billNo = billNo;
    payment.description = description;
    payment.attachments = finalAttachments;
    payment.attachment = finalAttachments[0]?.key || "";

    await payment.save();

    await JournalEntry.updateMany(
      {
        referenceId: payment._id,
        sourceType: {
          $in: [
            "receive_payment",
            "refund_payment",
            "receive_payment_discount",
          ],
        },
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

    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: payment._id,
        sourceType: "receive_payment",
        originModule: "receive_payment_form",
        billNo,
        accountId: p.account,
        counterPartyAccountId,
        amount: Number(p.amount),
        paymentType:
          p.paymentType?.toLowerCase() || payment.paymentType || "cash",
        description: description || "Receive Payment",
        customerId: customerData?._id || null,
        partyId: partyData?._id || null,

        // ✅ Edit کے دن کی بجائے Payment کی اصل منتخب تاریخ
        entryDate: date ? new Date(`${date}T00:00:00.000+05:00`) : new Date(),
        entryTime: time || payment.time || "00:00",
      });
    }

    if (parsedDiscount > 0) {
      await createReceivePaymentDiscountEntry({
        userId,
        referenceId: payment._id,
        billNo,
        customerAccountId: counterPartyAccountId,
        discountAmount: parsedDiscount,
        description: "Updated Receive Payment Discount",
        originModule: "receive_payment_form",
        customerId: customerData?._id || null,
        partyId: partyData?._id || null,

        // ✅ اصل Payment کی تاریخ اور وقت
        entryDate: date ? new Date(`${date}T00:00:00.000+05:00`) : new Date(),
        entryTime: time || payment.time || "00:00",
      });
    }

    await safeRecalculate(counterPartyAccountId);

    await logActivity({
      req,
      action: "update",
      module: "receive_payments",
      entityType: "ReceivePayment",
      entityId: payment._id,
      title: `Receive Payment ${payment.billNo}`,
      description: `${
        customerData?.name || partyData?.name || "Party"
      } کی Receive Payment Update کی گئی`,
      billNo: payment.billNo,
      before: beforeUpdate,
      after: {
        customer: payment.customer,
        partyId: payment.partyId,
        customerName: customerData?.name || partyData?.name || "",
        date: payment.date,
        time: payment.time,
        amount: payment.amount,
        discountAmount: payment.discountAmount,
        finalAmount: payment.finalAmount,
        paymentType: payment.paymentType,
        billNo: payment.billNo,
        description: payment.description,
        paymentEntryCount: payments.length,
      },
    });

    res.json({
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (err) {
    console.error("❌ Error updating payment:", err);
    res.status(500).json({ error: err.message });
  }
};

// DELETE RECEIVE PAYMENT

exports.deleteReceivePayment = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
      isDeleted: { $ne: true },
    });

    if (!payment) {
      return res.status(404).json({ error: "Not found" });
    }

    const beforeDelete = {
      customer: payment.customer,
      partyId: payment.partyId,
      date: payment.date,
      time: payment.time,
      amount: payment.amount,
      discountAmount: payment.discountAmount,
      finalAmount: payment.finalAmount,
      paymentType: payment.paymentType,
      billNo: payment.billNo,
      description: payment.description,
    };

    const journals = await JournalEntry.find({
      referenceId: payment._id,
      sourceType: {
        $in: ["receive_payment", "receive_payment_discount"],
      },
      createdBy: userId,
      isDeleted: false,
    });

    const attachmentsToDelete = formatAttachments(payment);

    for (const att of attachmentsToDelete) {
      await deleteAttachmentSafe(att);
    }

    await JournalEntry.updateMany(
      {
        referenceId: payment._id,
        sourceType: {
          $in: ["receive_payment", "receive_payment_discount"],
        },
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    for (const entry of journals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    payment.isDeleted = true;
    await payment.save();

    await logActivity({
      req,
      action: "delete",
      module: "receive_payments",
      entityType: "ReceivePayment",
      entityId: payment._id,
      title: `Receive Payment ${payment.billNo}`,
      description: `Receive Payment ${payment.billNo} Delete کی گئی`,
      billNo: payment.billNo,
      before: beforeDelete,
      after: {
        isDeleted: true,
      },
    });

    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Payment Error:", err);
    res.status(500).json({ error: err.message });
  }
};
