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
      isOpening: isOpening || false,
      items,
      createdBy: userId,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
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
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      lines,
    });

    await journal.save();
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

    res.json({
      ...refund.toObject(),
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
      return res.status(404).json({ error: "Refund not found" });
    }

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
    refund.isOpening = isOpening || false;

    refund.items = items;

    if (req.file) {
      refund.attachmentUrl = req.file.filename;
      refund.attachmentType = req.file.mimetype?.split("/")[0] || "";
    }

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
        referenceId: refund._id,
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
      attachmentUrl: refund.attachmentUrl || "",
      attachmentType: refund.attachmentType || "",
      lines,
    });

    await journal.save();
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

    // 🔍 Step 0: Find refund invoice with items
    const refundInvoice = await RefundInvoice.findOne({
      _id: id,
      createdBy: userId,
    });

    if (!refundInvoice) {
      return res
        .status(404)
        .json({ error: "Refund not found or already deleted" });
    }

    // 🗑️ Step 2: Delete InventoryTransaction
    if (!refundInvoice.isOpening) {
      await deleteTransactionsByReference({
        referenceId: id,
        invoiceModel: "RefundInvoice",
        userId,
      });
    }

    // 🧾 Step 3: Delete journal entry
    await JournalEntry.updateMany(
      {
        referenceId: id,
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

    // 🧾 Step 4: Delete refund invoice itself
    refundInvoice.isDeleted = true;
    await refundInvoice.save();

    if (!refundInvoice) {
      return res
        .status(404)
        .json({ error: "Refund not found or already deleted" });
    }

    res.json({ message: "✅ Refund deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Refund Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
