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

    const items =
      typeof req.body.items === "string"
        ? JSON.parse(req.body.items || "[]")
        : req.body.items || [];

    // ✅ Normal refund needs items
    if ((!isOpening || isOpening === "false") && items.length === 0) {
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
      paymentType: isOpening ? "credit" : paymentType,
      accountId: Number(paidAmount || 0) > 0 ? accountId : null,
      notes,
      originalInvoiceId: originalInvoiceId || null,
      isOpening: isOpening || false,
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

    if (!isOpening || isOpening === "false") {
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
    const lines = isOpening
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

      sourceType: isOpening ? "opening_refund_invoice" : "refund_invoice",
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
      (!isOpening || isOpening === "false") &&
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
    if (!isOpening || isOpening === "false") {
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
    });

    if (!refund) {
      return res.status(404).json({ error: "Refund not found" });
    }

    // 🔍 Journal Entry نکالیں
    const journal = await JournalEntry.findOne({
      referenceId: refund._id,
      sourceType: {
        $in: ["refund_invoice", "opening_refund_invoice"],
      },
    }).populate("lines.account", "name");

    // 💡 Payment line (credit side)
    const paymentLine = journal?.lines?.find(
      (line) => line.type === "credit" && line.paymentType,
    );

    const formattedAttachments =
      refund.attachments?.length > 0
        ? refund.attachments.map((att) => {
            const plainAtt = att.toObject ? att.toObject() : att;

            return {
              ...plainAtt,
              fullUrl: getFileUrl(plainAtt.key),
            };
          })
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

    res.json({
      ...refund.toObject(),
      attachments: formattedAttachments,
      paymentMode: paymentLine?.paymentType || refund.paymentType || "cash",
      accountId: paymentLine?.account?._id || "",
      accountName: paymentLine?.account?.name || "-",
    });
  } catch (err) {
    console.error("❌ Get Refund Error:", err);
    res.status(500).json({ error: "Server Error" });
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
    if ((!isOpening || isOpening === "false") && items.length === 0) {
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
    refund.paymentType = isOpening ? "credit" : paymentType;
    refund.accountId = paymentType === "cash" ? accountId : null;
    refund.notes = notes;
    refund.originalInvoiceId = originalInvoiceId || null;
    refund.isOpening = isOpening || false;

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

    if (!isOpening || isOpening === "false") {
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
    const lines = isOpening
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
      sourceType: isOpening ? "opening_refund_invoice" : "refund_invoice",
      referenceId: refund._id,
      invoiceId: refund._id,
      billNo: refund.billNo,
      paymentType: isOpening ? "credit" : paymentType,
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
      (!isOpening || isOpening === "false") &&
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
    if (!isOpening || isOpening === "false") {
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

// ✅ Get All Refunds
exports.getAllRefunds = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // ✅ Sirf active customers
    const activeCustomers = await Customer.find({
      createdBy: userId,
      isActive: true,
    }).select("_id");

    const activeCustomerIds = activeCustomers.map((c) => c._id);

    const activeParties = await Party.find({
      userId,
      isDeleted: false,
      isActive: true,
    }).select("_id");

    const activePartyIds = activeParties.map((p) => p._id);
    const refunds = await RefundInvoice.find({
      createdBy: userId,
      isDeleted: { $ne: true },
      $or: [
        { customerId: { $in: activeCustomerIds } },
        { partyId: { $in: activePartyIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = [];

    for (const r of refunds) {
      const journal = await JournalEntry.findOne({
        referenceId: r._id,
        sourceType: {
          $in: ["refund_invoice", "opening_refund_invoice"],
        },
      }).populate("lines.account", "name");

      const paymentLine = journal?.lines?.find(
        (l) => l.paymentType && l.account,
      );

      formatted.push({
        ...r,
        attachments:
          r.attachments?.length > 0
            ? r.attachments.map((att) => ({
                ...att,
                fullUrl: getFileUrl(att.key),
              }))
            : r.attachmentUrl
              ? [
                  {
                    key: r.attachmentUrl,
                    type: r.attachmentType || "",
                    size: 0,
                    originalName: "",
                    fullUrl: r.attachmentUrl.startsWith("users/")
                      ? getFileUrl(r.attachmentUrl)
                      : `/uploads/${r.attachmentUrl}`,
                  },
                ]
              : [],
        paymentMode: paymentLine?.paymentType || r.paymentType || "-",
        accountName: paymentLine?.account?.name || "-",
      });
    }

    res.json(formatted);
  } catch (err) {
    console.error("❌ Get All Refunds Error:", err);
    res.status(500).json({ error: "Server Error" });
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
