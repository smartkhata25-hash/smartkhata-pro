const PurchaseReturn = require("../models/PurchaseReturn");
const PurchaseInvoice = require("../models/purchaseInvoice");

const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const Account = require("../models/Account");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

const { createPaymentEntry } = require("../utils/paymentService");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");

function formatPurchaseReturnAttachments(pr) {
  if (pr.attachments?.length > 0) {
    return pr.attachments.map((att) => {
      const plainAtt = att.toObject ? att.toObject() : att;

      return {
        ...plainAtt,
        fullUrl: getFileUrl(plainAtt.key),
      };
    });
  }

  if (pr.attachmentUrl) {
    return [
      {
        key: pr.attachmentUrl,
        type: pr.attachmentType || "",
        size: 0,
        originalName: "",
        fullUrl: pr.attachmentUrl.startsWith("users/")
          ? getFileUrl(pr.attachmentUrl)
          : `/uploads/${pr.attachmentUrl}`,
      },
    ];
  }

  return [];
}

async function uploadPurchaseReturnFiles(files, userId) {
  const attachments = [];

  if (!files || files.length === 0) return attachments;

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const uploaded = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName: "purchase-returns",
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

async function deletePurchaseReturnAttachment(att) {
  if (!att?.key) return;

  if (att.key.startsWith("users/")) {
    await deleteFile(att.key);
  }
}

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
      partyId,
      supplierPhone,
      totalAmount,
      paidAmount = 0,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
      isOpening,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    const attachments = await uploadPurchaseReturnFiles(req.files, userId);
    const attachmentUrl = attachments[0]?.key || "";
    const attachmentType = attachments[0]?.type || "";

    /* =============================
       BASIC VALIDATION
    ============================== */
    const openingMode = isOpening === true || isOpening === "true";

    if ((!supplierId && !partyId) || (!openingMode && items.length === 0)) {
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

    let supplier = null;
    let party = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({
          error: "Party not found",
        });
      }
    } else {
      supplier = await Supplier.findOne({
        _id: supplierId,
        userId,
        isDeleted: false,
      });

      if (!supplier) {
        return res.status(404).json({
          error: "Supplier not found",
        });
      }
    }

    const counterPartyAccountId = party
      ? party.account
      : typeof supplier.account === "object"
        ? supplier.account?._id
        : supplier.account;

    if (!counterPartyAccountId) {
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

    const openingBalanceAccount = await Account.findOne({
      code: "OPENING_BALANCE",
      userId,
    });

    if (
      !purchaseReturnAccount ||
      !inventoryAccount ||
      (openingMode && !openingBalanceAccount)
    ) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    const purchaseReturn = new PurchaseReturn({
      billNo,
      returnDate,
      returnTime,
      supplierId: supplier?._id || null,
      partyId: party?._id || null,
      supplierName: supplier?.name || party?.name || "",
      supplierPhone,
      originalInvoiceId: originalInvoiceId || null,
      totalAmount,
      paidAmount,
      paymentType,
      accountId: paymentType ? accountId : null,
      notes,
      items,
      createdBy: userId,
      attachments,
      attachmentUrl,
      attachmentType,
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

    const isOpeningReturn =
      openingMode ||
      billNo === "OPENING" ||
      notes?.toLowerCase()?.includes("opening");

    const lines = isOpeningReturn
      ? [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: openingBalanceAccount._id,
            type: "credit",
            amount: totalAmount,
          },
        ]
      : [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: inventoryAccount._id,
            type: "credit",
            amount: totalAmount,
          },
        ];

    const journal = new JournalEntry({
      date: dateTime,
      time: returnTime || "",
      description: `Purchase Return - ${supplier?.name || party?.name} (Bill# ${billNo})`,

      sourceType: isOpeningReturn
        ? "opening_purchase_return"
        : "purchase_return",

      referenceId: purchaseReturn._id,
      invoiceId: purchaseReturn._id,
      billNo,
      createdBy: userId,
      supplierId: supplier?._id || null,
      partyId: party?._id || null,
      attachmentUrl,
      attachmentType,
      lines,
    });

    await journal.save();

    await recalculateAccountBalance(counterPartyAccountId);

    if (paidAmount > 0 && paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: purchaseReturn._id,
        sourceType: "purchase_return_payment",
        billNo: purchaseReturn.billNo,
        accountId,
        counterPartyAccountId: counterPartyAccountId,
        amount: paidAmount,
        paymentType,
        description: `Purchase Return Payment - ${purchaseReturn.billNo}`,
        supplierId: supplier?._id || null,
        partyId: party?._id || null,
      });

      await recalculateAccountBalance(counterPartyAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    /* =============================
       STOCK REDUCE + INVENTORY LOG
    ============================== */
    const originalInvoice = await PurchaseInvoice.findById(originalInvoiceId);

    if (!isOpeningReturn) {
      for (const item of items) {
        const originalItem = originalInvoice?.items.find(
          (i) => i.productId?.toString() === item.productId?.toString(),
        );

        await createInventoryEntry({
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          note: `Purchase Return #${billNo}`,
          invoiceId: purchaseReturn._id,
          invoiceModel: "PurchaseReturn",
          userId,

          // ✅ Historical purchase rate
          rate: Number(originalItem?.price || 0),
        });
      }
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
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    let paymentLine = null;

    const paymentJournal = await JournalEntry.findOne({
      referenceId: pr._id,
      sourceType: "purchase_return_payment",
      createdBy: userId,
      isDeleted: false,
    }).populate("lines.account", "name");

    paymentLine = paymentJournal?.lines?.find((line) => line.paymentType);

    const attachments = formatPurchaseReturnAttachments(pr);

    return res.json({
      ...pr.toObject(),
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
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
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = [];

    for (const pr of returns) {
      /* =============================
         FIND PAYMENT LINE
      ============================== */
      let paymentLine = null;

      const paymentJournal = await JournalEntry.findOne({
        referenceId: pr._id,
        sourceType: "purchase_return_payment",
        createdBy: userId,
        isDeleted: false,
      }).populate("lines.account", "name");

      paymentLine = paymentJournal?.lines?.find((line) => line.paymentType);

      const attachments = formatPurchaseReturnAttachments(pr);

      formatted.push({
        ...pr,
        attachments,
        attachmentFullUrl: attachments[0]?.fullUrl || "",
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
   ✅ UPDATE PURCHASE RETURN (SAFE PRO VERSION)
========================================================= */
exports.updatePurchaseReturn = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      billNo,
      returnDate,
      returnTime,
      supplierId,
      partyId,
      supplierPhone,
      totalAmount,
      paidAmount = 0,
      paymentType,
      accountId,
      notes,
      isOpening,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    const openingMode = isOpening === true || isOpening === "true";

    /* =============================
       FIND EXISTING RECORD
    ============================== */
    const pr = await PurchaseReturn.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    let attachments = formatPurchaseReturnAttachments(pr).map((att) => ({
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
      await deletePurchaseReturnAttachment(att);
    }

    attachments = attachments.filter((att) =>
      keepAttachmentKeys.includes(att.key),
    );

    const newAttachments = await uploadPurchaseReturnFiles(req.files, userId);

    if (attachments.length + newAttachments.length > 3) {
      for (const att of newAttachments) {
        await deletePurchaseReturnAttachment(att);
      }

      return res.status(400).json({
        error: "Maximum 3 attachments allowed",
      });
    }

    attachments = [...attachments, ...newAttachments];

    const attachmentUrl = attachments[0]?.key || "";
    const attachmentType = attachments[0]?.type || "";

    /* =============================
       BASIC VALIDATION
    ============================== */
    if ((!supplierId && !partyId) || (!openingMode && items.length === 0)) {
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
    let supplier = null;
    let party = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({
          error: "Party not found",
        });
      }
    } else {
      supplier = await Supplier.findOne({
        _id: supplierId,
        userId,
        isDeleted: false,
      });

      if (!supplier) {
        return res.status(404).json({
          error: "Supplier not found",
        });
      }
    }

    const counterPartyAccountId = party
      ? party.account
      : typeof supplier.account === "object"
        ? supplier.account?._id
        : supplier.account;

    if (!counterPartyAccountId) {
      return res.status(400).json({
        error: "Account not linked",
      });
    }

    /* =============================
       ACCOUNT VALIDATION
    ============================== */
    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    if (!inventoryAccount) {
      return res.status(400).json({
        error: "Inventory account not found",
      });
    }

    const openingBalanceAccount = await Account.findOne({
      code: "OPENING_BALANCE",
      userId,
    });

    /* =============================
       ORIGINAL INVOICE VALIDATION
    ============================== */
    if (pr.originalInvoiceId) {
      const invoice = await PurchaseInvoice.findById(pr.originalInvoiceId);

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
        originalInvoiceId: pr.originalInvoiceId,
        _id: { $ne: pr._id },
        isDeleted: false,
      });

      const returnedQtyMap = {};

      previousReturns.forEach((ret) => {
        ret.items.forEach((item) => {
          const key =
            typeof item.productId === "object"
              ? item.productId._id?.toString()
              : item.productId.toString();

          if (!returnedQtyMap[key]) {
            returnedQtyMap[key] = 0;
          }

          returnedQtyMap[key] += item.quantity;
        });
      });

      if (!openingMode) {
        for (const item of items) {
          const key =
            typeof item.productId === "object"
              ? item.productId._id?.toString()
              : item.productId.toString();

          const originalQty = originalQtyMap[key] || 0;

          const alreadyReturned = returnedQtyMap[key] || 0;

          if (item.quantity + alreadyReturned > originalQty) {
            return res.status(400).json({
              error: "Return quantity exceeds original invoice quantity",
            });
          }
        }
      }
    }
    /* =============================
       REMOVE OLD STOCK ENTRIES
    ============================== */
    await deleteTransactionsByReference({
      referenceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    /* =============================
       SOFT DELETE OLD JOURNALS
    ============================== */
    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: pr._id }, { invoiceId: pr._id }],
        sourceType: "purchase_return_payment",
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: pr._id }, { invoiceId: pr._id }],
        sourceType: {
          $in: ["purchase_return", "opening_purchase_return"],
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
    /* =============================
       UPDATE MAIN DOCUMENT
    ============================== */
    pr.billNo = billNo;
    pr.returnDate = returnDate;
    pr.returnTime = returnTime;
    pr.supplierId = supplier?._id || null;
    pr.partyId = party?._id || null;
    pr.supplierName = supplier?.name || party?.name || "";
    pr.supplierPhone = supplierPhone;
    pr.totalAmount = totalAmount;
    pr.paidAmount = paidAmount;
    pr.paymentType = paymentType;
    pr.accountId = paymentType ? accountId : null;
    pr.notes = notes;
    pr.items = items;

    pr.attachments = attachments;
    pr.attachmentUrl = attachmentUrl;
    pr.attachmentType = attachmentType;

    await pr.save();

    /* =============================
       DATE SAFE
    ============================== */
    let dateTime = new Date(`${returnDate}T${returnTime}`);

    if (isNaN(dateTime.getTime())) {
      dateTime = new Date(returnDate);
    }

    /* =============================
       CREATE JOURNAL ENTRY
    ============================== */
    const isOpeningReturn =
      openingMode ||
      billNo === "OPENING" ||
      notes?.toLowerCase()?.includes("opening");

    const lines = isOpeningReturn
      ? [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: openingBalanceAccount._id,
            type: "credit",
            amount: totalAmount,
          },
        ]
      : [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: inventoryAccount._id,
            type: "credit",
            amount: totalAmount,
          },
        ];

    const journal = new JournalEntry({
      date: dateTime,
      time: returnTime || "",
      description: `Purchase Return - ${supplier?.name || party?.name} (Bill# ${billNo})`,

      sourceType: isOpeningReturn
        ? "opening_purchase_return"
        : "purchase_return",

      referenceId: pr._id,
      invoiceId: pr._id,
      billNo,
      createdBy: userId,
      supplierId: supplier?._id || null,
      partyId: party?._id || null,
      attachmentUrl: pr.attachmentUrl || "",
      attachmentType: pr.attachmentType || "",
      lines,
    });

    await journal.save();

    /* =============================
       CREATE PAYMENT ENTRY
    ============================== */
    if (paidAmount > 0 && paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: pr._id,
        sourceType: "purchase_return_payment",
        billNo: pr.billNo,
        accountId,
        counterPartyAccountId: counterPartyAccountId,
        amount: paidAmount,
        paymentType,
        description: `Purchase Return Payment - ${pr.billNo}`,
        supplierId: supplier?._id || null,
        partyId: party?._id || null,
      });
    }

    /* =============================
       APPLY STOCK OUT
    ============================== */
    const originalInvoice = await PurchaseInvoice.findById(
      pr.originalInvoiceId,
    );

    if (!isOpeningReturn) {
      for (const item of items) {
        const originalItem = originalInvoice?.items.find(
          (i) => i.productId?.toString() === item.productId?.toString(),
        );

        await createInventoryEntry({
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          note: `Updated Purchase Return #${billNo}`,
          invoiceId: pr._id,
          invoiceModel: "PurchaseReturn",
          userId,

          // ✅ Historical purchase rate
          rate: Number(originalItem?.price || 0),
        });
      }
    }
    /* =============================
       RECALCULATE BALANCES
    ============================== */
    await recalculateAccountBalance(counterPartyAccountId);

    if (accountId) {
      await recalculateAccountBalance(accountId);
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
// ✅ DELETE PURCHASE RETURN (SAFE ACCOUNTING VERSION)
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
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found or already deleted",
      });
    }

    /* =============================
       REVERSE STOCK ENTRIES
    ============================== */
    await deleteTransactionsByReference({
      referenceId: id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    /* =============================
       SOFT DELETE MAIN JOURNAL
    ============================== */
    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: id }, { invoiceId: id }],
        sourceType: {
          $in: ["purchase_return", "opening_purchase_return"],
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

    /* =============================
       SOFT DELETE PAYMENT JOURNALS
    ============================== */
    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: pr._id }, { invoiceId: pr._id }],
        sourceType: "purchase_return_payment",
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    /* =============================
       RECALCULATE PAYMENT ACCOUNT
    ============================== */
    if (pr.accountId) {
      await recalculateAccountBalance(pr.accountId);
    }

    /* =============================
       RECALCULATE SUPPLIER ACCOUNT
    ============================== */
    const supplier = pr.supplierId
      ? await Supplier.findById(pr.supplierId)
      : null;

    const party = pr.partyId ? await Party.findById(pr.partyId) : null;

    if (supplier?.account) {
      await recalculateAccountBalance(supplier.account);
    }

    if (party?.account) {
      await recalculateAccountBalance(party.account);
    }

    const attachmentsToDelete = formatPurchaseReturnAttachments(pr);

    for (const att of attachmentsToDelete) {
      await deletePurchaseReturnAttachment(att);
    }

    /* =============================
       SOFT DELETE PURCHASE RETURN
    ============================== */
    pr.isDeleted = true;

    await pr.save();

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
