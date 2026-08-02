const RefundInvoice = require("../models/RefundInvoice");

const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const Party = require("../models/Party");
const Account = require("../models/Account");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

const Counter = require("../models/Counter");

const { createPaymentEntry } = require("../utils/paymentService");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");
const { logActivity } = require("../utils/activityLogger");

// ✅ Create Refund - Updated Version (with InventoryTransaction)
exports.createRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      billNo,
      invoiceDate,
      invoiceTime,
      customerId,
      partyId,
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
      isOpening,
    } = req.body;

    const openingRefund = isOpening === true || isOpening === "true";

    const items =
      typeof req.body.items === "string"
        ? JSON.parse(req.body.items || "[]")
        : req.body.items || [];

    // ✅ Normal refund needs items
    if ((!openingRefund || openingRefund === "false") && items.length === 0) {
      return res.status(400).json({
        error: "Refund items required",
      });
    }

    // ✅ Basic validation
    if (!customerId && !partyId) {
      return res.status(400).json({
        error: "Customer or Party required",
      });
    }

    // ✅ Customer
    let customer = null;
    let party = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }
    } else {
      customer = await Customer.findOne({
        _id: customerId,
        createdBy: userId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
    }

    // ✅ Accounts
    const salesReturnAccount = await Account.findOne({
      name: "sales return",
      type: "Income",
      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId,
    });

    if (!salesReturnAccount || !inventoryAccount || !cogsAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    // ✅ Customer account (MOST IMPORTANT FOR LEDGER)
    const counterPartyAccountId = party
      ? party.account
      : typeof customer.account === "object"
        ? customer.account?._id
        : customer.account;

    if (!counterPartyAccountId) {
      return res.status(400).json({
        error: "Account not linked",
      });
    }

    // ✅ Refund Counter (Per User)
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

    const refundBillNo = `R-${counter.seq}`;

    const attachments = [];

    if (req.files?.length) {
      for (const file of req.files) {
        const uploaded = await uploadFile({
          buffer: file.buffer,
          userId,
          moduleName: "refunds",
          originalName: file.originalname,
          mimeType: file.mimetype,
        });

        attachments.push(uploaded);
      }
    }

    // ✅ Save Refund Invoice
    const refundInvoice = new RefundInvoice({
      billNo: refundBillNo,
      invoiceDate,
      invoiceTime,
      customerId: customer?._id || null,
      partyId: party?._id || null,
      customerName: customer?.name || party?.name || "",
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType: openingRefund ? "credit" : paymentType,
      accountId: Number(paidAmount || 0) > 0 ? accountId : null,
      notes,
      originalInvoiceId: originalInvoiceId || null,
      isOpening: openingRefund,
      items,
      createdBy: userId,
      attachments,
    });

    if (originalInvoiceId) {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original sale invoice not found",
        });
      }

      // اصل quantity محفوظ کریں
      const originalQtyMap = {};
      originalInvoice.items.forEach((item) => {
        originalQtyMap[item.productId.toString()] = item.quantity;
      });

      // پہلے کتنے ریفنڈ ہو چکے
      const previousRefunds = await RefundInvoice.find({
        originalInvoiceId,
      });

      const refundedQtyMap = {};

      previousRefunds.forEach((ref) => {
        ref.items.forEach((item) => {
          const key = item.productId.toString();
          if (!refundedQtyMap[key]) refundedQtyMap[key] = 0;
          refundedQtyMap[key] += item.quantity;
        });
      });

      // اب نیا ریفنڈ چیک کریں
      for (const item of items) {
        const key = item.productId.toString();

        const originalQty = originalQtyMap[key] || 0;
        const alreadyRefunded = refundedQtyMap[key] || 0;

        if (item.quantity + alreadyRefunded > originalQty) {
          return res.status(400).json({
            error: "Refund quantity exceeds original sold quantity",
          });
        }
      }
    }

    await refundInvoice.save();

    // ✅ Date handling
    let refundDateTime = new Date(`${invoiceDate}T${invoiceTime}`);
    if (isNaN(refundDateTime.getTime())) {
      refundDateTime = new Date(invoiceDate);
    }

    // ✅ Calculate refund cost
    let totalRefundCost = 0;
    const refundCostMap = {};

    if (!openingRefund || openingRefund === "false") {
      let originalInvoice = null;

      if (originalInvoiceId) {
        originalInvoice = await Invoice.findById(originalInvoiceId);
      }

      const productIds = items.map((i) => i.productId).filter(Boolean);

      const products = await Product.find({
        _id: { $in: productIds },
        userId,
      });

      for (const item of items) {
        const productId = item.productId?.toString();

        const originalItem = originalInvoice?.items?.find(
          (i) => i.productId?.toString() === productId,
        );

        const product = products.find((p) => p._id.toString() === productId);

        const costRate =
          Number(originalItem?.costPrice || 0) > 0
            ? Number(originalItem.costPrice)
            : Number(product?.unitCost || 0);

        refundCostMap[productId] = costRate;

        totalRefundCost += costRate * Number(item.quantity || 0);
      }
    }

    // ✅ JOURNAL LINES
    const lines = openingRefund
      ? [
          {
            account: (
              await Account.findOne({
                code: "OPENING_BALANCE",
                userId,
              })
            )._id,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: totalAmount,
          },
        ]
      : [
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: totalAmount,
          },
          {
            account: salesReturnAccount._id,
            type: "debit",
            amount: totalAmount,
          },
          ...(totalRefundCost > 0
            ? [
                {
                  account: inventoryAccount._id,
                  type: "debit",
                  amount: totalRefundCost,
                },
                {
                  account: cogsAccount._id,
                  type: "credit",
                  amount: totalRefundCost,
                },
              ]
            : []),
        ];

    // ✅ Journal Entry
    const journal = new JournalEntry({
      date: refundDateTime,
      time: invoiceTime || "",
      description: notes || "",

      sourceType: openingRefund ? "opening_refund_invoice" : "refund_invoice",
      referenceId: refundInvoice._id,
      invoiceId: refundInvoice._id,
      billNo: refundBillNo,
      paymentType,
      createdBy: userId,
      customerId: customer?._id || null,
      partyId: party?._id || null,
      attachmentUrl:
        attachments.length > 0 ? getFileUrl(attachments[0].key) : "",

      attachmentType: attachments.length > 0 ? attachments[0].type : "",
      lines,
    });

    await journal.save();
    await recalculateAccountBalance(counterPartyAccountId);
    if (
      (!openingRefund || openingRefund === "false") &&
      Number(paidAmount || 0) > 0 &&
      paymentType &&
      accountId
    ) {
      await createPaymentEntry({
        userId,
        referenceId: refundInvoice._id,
        sourceType: "refund_payment",
        billNo: refundInvoice.billNo,
        accountId,
        counterPartyAccountId,
        amount: Number(paidAmount || 0),
        paymentType,
        description: `Refund Payment - ${refundInvoice.billNo}`,
        customerId: customer?._id || null,
        partyId: party?._id || null,
      });
      await recalculateAccountBalance(counterPartyAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    // ✅ Inventory transactions
    if (!openingRefund || openingRefund === "false") {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      for (const item of items) {
        const originalItem = originalInvoice?.items.find(
          (i) => i.productId?.toString() === item.productId?.toString(),
        );

        await createInventoryEntry({
          productId: item.productId,
          type: "IN",
          quantity: item.quantity,
          note: `Refund Invoice #${refundInvoice.billNo}`,
          invoiceId: refundInvoice._id,
          invoiceModel: "RefundInvoice",
          userId,

          // ✅ Historical refund rate
          rate: Number(refundCostMap[item.productId?.toString()] || 0),
        });
      }
    }

    await logActivity({
      req,
      action: "create",
      module: "refunds",
      entityType: "RefundInvoice",
      entityId: refundInvoice._id,
      title: `Refund Invoice ${refundInvoice.billNo}`,
      description: `${refundInvoice.customerName} کی Refund Invoice بنائی گئی`,
      billNo: refundInvoice.billNo,
      after: {
        customerName: refundInvoice.customerName,
        customerPhone: refundInvoice.customerPhone,
        invoiceDate: refundInvoice.invoiceDate,
        invoiceTime: refundInvoice.invoiceTime,
        totalAmount: refundInvoice.totalAmount,
        paidAmount: refundInvoice.paidAmount,
        paymentType: refundInvoice.paymentType,
        accountId: refundInvoice.accountId,
        notes: refundInvoice.notes,
        itemCount: refundInvoice.items?.length || 0,
        isOpening: refundInvoice.isOpening,
      },
    });

    res.status(201).json({
      message: "✅ Refund created successfully",
      refundInvoice,
    });
  } catch (err) {
    console.error("❌ Refund Save Error:", err);
    res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Get Refund by ID
exports.getRefundById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const refund = await RefundInvoice.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: { $ne: true },
    })
      .select(
        [
          "billNo",
          "invoiceDate",
          "invoiceTime",
          "customerId",
          "partyId",
          "customerName",
          "customerPhone",
          "totalAmount",
          "paidAmount",
          "paymentType",
          "accountId",
          "notes",
          "originalInvoiceId",
          "isOpening",
          "items",
          "attachments",
          "attachmentUrl",
          "attachmentType",
          "createdAt",
        ].join(" "),
      )
      .populate({
        path: "customerId",
        select: "name phone account",
      })
      .populate({
        path: "partyId",
        select: "name phone account",
      })
      .populate({
        path: "items.productId",
        select: "name description salePrice unitPrice price",
      })
      .lean();

    if (!refund) {
      return res.status(404).json({
        error: "Refund not found",
      });
    }

    const paymentJournal = await JournalEntry.findOne({
      referenceId: refund._id,
      sourceType: "refund_payment",
      createdBy: userId,
      isDeleted: false,
    })
      .select("lines")
      .populate("lines.account", "name")
      .lean();

    const paymentLine = paymentJournal?.lines?.find(
      (line) => line.paymentType && line.account,
    );

    const formattedAttachments =
      refund.attachments?.length > 0
        ? refund.attachments.map((att) => ({
            ...att,
            fullUrl: getFileUrl(att.key),
          }))
        : refund.attachmentUrl
          ? [
              {
                key: refund.attachmentUrl,
                type: refund.attachmentType || "",
                size: 0,
                originalName: "",
                fullUrl: refund.attachmentUrl.startsWith("users/")
                  ? getFileUrl(refund.attachmentUrl)
                  : `/uploads/${refund.attachmentUrl}`,
              },
            ]
          : [];

    return res.json({
      ...refund,

      attachments: formattedAttachments,

      paymentMode: paymentLine?.paymentType || refund.paymentType || "credit",

      accountId: paymentLine?.account?._id || refund.accountId || "",

      accountName: paymentLine?.account?.name || "-",
    });
  } catch (err) {
    console.error("❌ Get Refund Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Update Refund Invoice with Journal + Stock Update
exports.updateRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // ✅ Refund find
    const refund = await RefundInvoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!refund) {
      return res.status(404).json({
        error: "Refund not found",
      });
    }

    const beforeUpdate = {
      billNo: refund.billNo,
      invoiceDate: refund.invoiceDate,
      invoiceTime: refund.invoiceTime,
      customerId: refund.customerId,
      partyId: refund.partyId,
      customerName: refund.customerName,
      customerPhone: refund.customerPhone,
      totalAmount: refund.totalAmount,
      paidAmount: refund.paidAmount,
      paymentType: refund.paymentType,
      accountId: refund.accountId,
      notes: refund.notes,
      itemCount: refund.items?.length || 0,
      isOpening: refund.isOpening,
    };

    const {
      billNo,
      invoiceDate,
      invoiceTime,
      customerId,
      partyId,
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
      isOpening,
    } = req.body;

    const openingRefund = isOpening === true || isOpening === "true";

    const items =
      typeof req.body.items === "string"
        ? JSON.parse(req.body.items || "[]")
        : req.body.items || [];

    let attachments = refund.attachments?.length
      ? refund.attachments.map((att) => ({
          key: att.key,
          type: att.type || "",
          size: att.size || 0,
          originalName: att.originalName || "",
        }))
      : refund.attachmentUrl
        ? [
            {
              key: refund.attachmentUrl,
              type: refund.attachmentType || "",
              size: 0,
              originalName: "",
            },
          ]
        : [];

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
      if (att.key?.startsWith("users/")) {
        await deleteFile(att.key);
      }
    }

    attachments = attachments.filter((att) =>
      keepAttachmentKeys.includes(att.key),
    );

    if (req.files?.length) {
      for (const file of req.files) {
        const uploaded = await uploadFile({
          buffer: file.buffer,
          userId,
          moduleName: "refunds",
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
    }

    if (attachments.length > 3) {
      return res.status(400).json({
        error: "Maximum 3 attachments allowed",
      });
    }

    // ✅ Normal refund needs items
    if (!openingRefund && items.length === 0) {
      return res.status(400).json({
        error: "Refund items required",
      });
    }

    // ✅ Customer
    let customer = null;
    let party = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({ error: "Party not found" });
      }
    } else {
      customer = await Customer.findOne({
        _id: customerId,
        createdBy: userId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
    }

    // ✅ Accounts
    const salesReturnAccount = await Account.findOne({
      name: "sales return",
      type: "Income",
      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId,
    });

    if (!salesReturnAccount || !inventoryAccount || !cogsAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    // ✅ Customer account (ledger key)
    const counterPartyAccountId = party
      ? party.account
      : typeof customer.account === "object"
        ? customer.account?._id
        : customer.account;

    if (!counterPartyAccountId) {
      return res.status(400).json({
        error: "Account not linked",
      });
    }

    // ✅ Update refund invoice

    refund.billNo = billNo;
    refund.invoiceDate = invoiceDate;
    refund.invoiceTime = invoiceTime;
    refund.customerId = customer?._id || null;
    refund.partyId = party?._id || null;
    refund.customerName = customer?.name || party?.name || "";
    refund.customerPhone = customerPhone;
    refund.totalAmount = totalAmount;
    refund.paidAmount = paidAmount;
    refund.paymentType = openingRefund ? "credit" : paymentType;
    refund.accountId = paymentType === "cash" ? accountId : null;
    refund.notes = notes;
    refund.originalInvoiceId = originalInvoiceId || null;
    refund.isOpening = openingRefund;

    refund.items = items;

    refund.attachments = attachments;

    refund.attachmentUrl =
      attachments.length > 0 ? getFileUrl(attachments[0].key) : "";

    refund.attachmentType = attachments.length > 0 ? attachments[0].type : "";

    if (originalInvoiceId) {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original sale invoice not found",
        });
      }

      // اصل quantity map
      const originalQtyMap = {};
      originalInvoice.items.forEach((item) => {
        originalQtyMap[item.productId.toString()] = item.quantity;
      });

      const previousRefunds = await RefundInvoice.find({
        originalInvoiceId,
        _id: { $ne: refund._id },
      });

      const refundedQtyMap = {};

      previousRefunds.forEach((ref) => {
        ref.items.forEach((item) => {
          const key = item.productId.toString();
          if (!refundedQtyMap[key]) refundedQtyMap[key] = 0;
          refundedQtyMap[key] += item.quantity;
        });
      });

      // نیا ریفنڈ چیک کریں
      for (const item of items) {
        const key = item.productId.toString();

        const originalQty = originalQtyMap[key] || 0;
        const alreadyRefunded = refundedQtyMap[key] || 0;

        if (item.quantity + alreadyRefunded > originalQty) {
          return res.status(400).json({
            error: "Refund quantity exceeds original sold quantity",
          });
        }
      }
    }

    await refund.save();

    // ✅ Delete old journal
    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: refund._id }, { invoiceId: refund._id }],
        sourceType: {
          $in: ["refund_invoice", "opening_refund_invoice", "refund_payment"],
        },
        createdBy: userId,
        isDeleted: false,
      },
      {
        $set: { isDeleted: true },
      },
    );

    // ✅ Delete old inventory transactions
    if (!refund.isOpening) {
      await deleteTransactionsByReference({
        referenceId: refund._id,
        invoiceModel: "RefundInvoice",
        userId,
      });
    }

    // ✅ Date handling
    let refundDateTime = new Date(`${invoiceDate}T${invoiceTime}`);
    if (isNaN(refundDateTime.getTime())) {
      refundDateTime = new Date(invoiceDate);
    }

    // ✅ Calculate refund cost
    let totalRefundCost = 0;
    const refundCostMap = {};

    if (!openingRefund) {
      let originalInvoice = null;

      if (originalInvoiceId) {
        originalInvoice = await Invoice.findById(originalInvoiceId);
      }

      const productIds = items.map((i) => i.productId).filter(Boolean);

      const products = await Product.find({
        _id: { $in: productIds },
        userId,
      });

      for (const item of items) {
        const productId = item.productId?.toString();

        const originalItem = originalInvoice?.items?.find(
          (i) => i.productId?.toString() === productId,
        );

        const product = products.find((p) => p._id.toString() === productId);

        const costRate =
          Number(originalItem?.costPrice || 0) > 0
            ? Number(originalItem.costPrice)
            : Number(product?.unitCost || 0);

        refundCostMap[productId] = costRate;

        totalRefundCost += costRate * Number(item.quantity || 0);
      }
    }

    // ✅ JOURNAL LINES
    const lines = openingRefund
      ? [
          {
            account: (
              await Account.findOne({
                code: "OPENING_BALANCE",
                userId,
              })
            )._id,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: totalAmount,
          },
        ]
      : [
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: totalAmount,
          },
          {
            account: salesReturnAccount._id,
            type: "debit",
            amount: totalAmount,
          },
          ...(totalRefundCost > 0
            ? [
                {
                  account: inventoryAccount._id,
                  type: "debit",
                  amount: totalRefundCost,
                },
                {
                  account: cogsAccount._id,
                  type: "credit",
                  amount: totalRefundCost,
                },
              ]
            : []),
        ];

    // ✅ New journal entry
    const journal = new JournalEntry({
      date: refundDateTime,
      time: invoiceTime || "",
      description: notes || "",
      sourceType: openingRefund ? "opening_refund_invoice" : "refund_invoice",
      referenceId: refund._id,
      invoiceId: refund._id,
      billNo: refund.billNo,
      paymentType: openingRefund ? "credit" : paymentType,
      createdBy: userId,
      customerId: customer?._id || null,
      partyId: party?._id || null,
      attachmentUrl:
        attachments.length > 0 ? getFileUrl(attachments[0].key) : "",

      attachmentType: attachments.length > 0 ? attachments[0].type : "",
      lines,
    });

    await journal.save();
    await recalculateAccountBalance(counterPartyAccountId);
    if (
      !openingRefund &&
      Number(paidAmount || 0) > 0 &&
      paymentType &&
      accountId
    ) {
      await createPaymentEntry({
        userId,
        referenceId: refund._id,
        sourceType: "refund_payment",
        billNo: refund.billNo,
        accountId,
        counterPartyAccountId,
        amount: Number(paidAmount || 0),
        paymentType,
        description: `Refund Payment - ${refund.billNo}`,
        customerId: customer?._id || null,
        partyId: party?._id || null,
      });
      await recalculateAccountBalance(counterPartyAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    // ✅ New inventory transactions
    if (!openingRefund) {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      for (const item of items) {
        const originalItem = originalInvoice?.items.find(
          (i) => i.productId?.toString() === item.productId?.toString(),
        );

        await createInventoryEntry({
          productId: item.productId,
          type: "IN",
          quantity: item.quantity,
          note: `Updated Refund Invoice #${refund.billNo}`,
          invoiceId: refund._id,
          invoiceModel: "RefundInvoice",
          userId,

          // ✅ Historical refund rate
          rate: Number(refundCostMap[item.productId?.toString()] || 0),
        });
      }
    }

    await logActivity({
      req,
      action: "update",
      module: "refunds",
      entityType: "RefundInvoice",
      entityId: refund._id,
      title: `Refund Invoice ${refund.billNo}`,
      description: `${refund.customerName} کی Refund Invoice Update کی گئی`,
      billNo: refund.billNo,
      before: beforeUpdate,
      after: {
        billNo: refund.billNo,
        invoiceDate: refund.invoiceDate,
        invoiceTime: refund.invoiceTime,
        customerId: refund.customerId,
        partyId: refund.partyId,
        customerName: refund.customerName,
        customerPhone: refund.customerPhone,
        totalAmount: refund.totalAmount,
        paidAmount: refund.paidAmount,
        paymentType: refund.paymentType,
        accountId: refund.accountId,
        notes: refund.notes,
        itemCount: refund.items?.length || 0,
        isOpening: refund.isOpening,
      },
    });

    res.json({
      message: "✅ Refund updated successfully",
      refund,
    });
  } catch (err) {
    console.error("❌ Update Refund Error:", err);
    res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Get All Refunds - Fast Pagination List
exports.getAllRefunds = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // ✅ Pagination
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);

    const requestedLimit = parseInt(req.query.limit || "10", 10);
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const skip = (page - 1) * limit;

    // ✅ Filters
    const search = String(req.query.search || "").trim();
    const customer = String(req.query.customer || "").trim();
    const paymentType = String(req.query.paymentType || "").trim();
    const fromDate = String(req.query.fromDate || "").trim();
    const toDate = String(req.query.toDate || "").trim();

    // ✅ Regex special characters safe
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ✅ Active customers and parties together
    const [activeCustomers, activeParties] = await Promise.all([
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
    ]);

    const activeCustomerIds = activeCustomers.map((item) => item._id);
    const activePartyIds = activeParties.map((item) => item._id);

    // ✅ Main filter
    const filter = {
      createdBy: userId,
      isDeleted: false,

      $and: [
        {
          $or: [
            { customerId: { $in: activeCustomerIds } },
            { partyId: { $in: activePartyIds } },
          ],
        },
      ],
    };

    // ✅ Selected customer or party filter
    if (customer) {
      filter.$and.push({
        $or: [{ customerId: customer }, { partyId: customer }],
      });
    }

    // ✅ Payment type filter
    if (paymentType) {
      filter.paymentType = paymentType;
    }

    // ✅ Search filter
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
            customerName: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            customerPhone: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            notes: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ],
      });
    }

    // ✅ Date filters
    if (fromDate || toDate) {
      filter.invoiceDate = {};

      if (fromDate) {
        filter.invoiceDate.$gte = new Date(`${fromDate}T00:00:00.000Z`);
      }

      if (toDate) {
        filter.invoiceDate.$lte = new Date(`${toDate}T23:59:59.999Z`);
      }
    }

    // ✅ Refund list and total count together
    const [refunds, totalRefunds] = await Promise.all([
      RefundInvoice.find(filter)
        // ✅ List کے لیے صرف ضروری fields
        .select(
          [
            "billNo",
            "invoiceDate",
            "invoiceTime",
            "customerId",
            "partyId",
            "customerName",
            "customerPhone",
            "totalAmount",
            "paidAmount",
            "paymentType",
            "notes",
            "isOpening",
            "createdAt",
          ].join(" "),
        )
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      RefundInvoice.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(totalRefunds / limit), 1);

    return res.status(200).json({
      refunds,

      pagination: {
        page,
        limit,
        totalRefunds,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (err) {
    console.error("❌ Get All Refunds Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Delete Refund Invoice (with stock update)
exports.deleteRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const refundInvoice = await RefundInvoice.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: { $ne: true },
    });

    if (!refundInvoice) {
      return res.status(404).json({
        error: "Refund not found or already deleted",
      });
    }

    const beforeDelete = {
      billNo: refundInvoice.billNo,
      invoiceDate: refundInvoice.invoiceDate,
      invoiceTime: refundInvoice.invoiceTime,
      customerId: refundInvoice.customerId,
      partyId: refundInvoice.partyId,
      customerName: refundInvoice.customerName,
      customerPhone: refundInvoice.customerPhone,
      totalAmount: refundInvoice.totalAmount,
      paidAmount: refundInvoice.paidAmount,
      paymentType: refundInvoice.paymentType,
      accountId: refundInvoice.accountId,
      notes: refundInvoice.notes,
      itemCount: refundInvoice.items?.length || 0,
      isOpening: refundInvoice.isOpening,
    };

    if (!refundInvoice.isOpening) {
      await deleteTransactionsByReference({
        referenceId: refundInvoice._id,
        invoiceModel: "RefundInvoice",
        userId,
      });
    }

    await JournalEntry.updateMany(
      {
        $or: [
          { referenceId: refundInvoice._id },
          { invoiceId: refundInvoice._id },
        ],
        sourceType: {
          $in: ["refund_invoice", "opening_refund_invoice", "refund_payment"],
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

    for (const att of refundInvoice.attachments || []) {
      if (att.key?.startsWith("users/")) {
        await deleteFile(att.key);
      }
    }

    refundInvoice.isDeleted = true;
    await refundInvoice.save();

    if (refundInvoice.accountId) {
      await recalculateAccountBalance(refundInvoice.accountId);
    }

    await logActivity({
      req,
      action: "delete",
      module: "refunds",
      entityType: "RefundInvoice",
      entityId: refundInvoice._id,
      title: `Refund Invoice ${refundInvoice.billNo}`,
      description: `${refundInvoice.customerName} کی Refund Invoice Delete کی گئی`,
      billNo: refundInvoice.billNo,
      before: beforeDelete,
      after: {
        isDeleted: true,
      },
    });

    return res.json({
      message: "✅ Refund deleted successfully",
    });
  } catch (err) {
    console.error("❌ Delete Refund Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};
