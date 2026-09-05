const mongoose = require("mongoose");

const PurchaseReturn = require("../models/PurchaseReturn");
const PurchaseInvoice = require("../models/purchaseInvoice");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");
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

const { logActivity } = require("../utils/activityLogger");
const {
  buildBusinessDateRange,
  parseBusinessDateTime,
} = require("../utils/businessDate");

const getUserId = (req) => req.user?.id || req.userId;

const getAccountId = (value) => {
  if (!value) return null;

  if (typeof value === "object" && value._id) {
    return value._id;
  }

  return value;
};

const getProductId = (value) => {
  if (!value) return "";

  if (typeof value === "object" && value._id) {
    return value._id.toString();
  }

  return value.toString();
};

const parseItems = (rawItems) => {
  try {
    const parsed = JSON.parse(rawItems || "[]");

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getExplicitOpeningMode = (isOpening) => {
  return isOpening === true || isOpening === "true";
};

const getAccountingOpeningMode = ({ explicitOpeningMode, billNo, notes }) => {
  return (
    explicitOpeningMode ||
    billNo === "OPENING" ||
    String(notes || "")
      .toLowerCase()
      .includes("opening")
  );
};

const getReturnDateTime = (returnDate, returnTime) => {
  return parseBusinessDateTime(returnDate || new Date(), returnTime, {
    defaultTime: "00:00",
    label: "purchase return date",
  });
};

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

async function deletePurchaseReturnAttachment(att) {
  if (!att?.key || !att.key.startsWith("users/")) {
    return;
  }

  await deleteFile(att.key);
}

async function deletePurchaseReturnAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return;
  }

  await Promise.allSettled(
    attachments.map((att) => deletePurchaseReturnAttachment(att)),
  );
}

async function uploadPurchaseReturnFiles(files, userId) {
  if (!files?.length) {
    return [];
  }

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  const attachments = [];

  try {
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
  } catch (error) {
    await deletePurchaseReturnAttachments(attachments);

    throw error;
  }
}

const validateBasicInput = ({
  supplierId,
  partyId,
  items,
  explicitOpeningMode,
  totalAmount,
  paidAmount,
  paymentType,
  accountId,
}) => {
  if (!supplierId && !partyId) {
    return "Supplier is required";
  }

  if (!explicitOpeningMode && items.length === 0) {
    return "Supplier and items required";
  }

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return "Invalid total amount";
  }

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return "Invalid paid amount";
  }

  if (paidAmount > totalAmount) {
    return "Paid amount cannot exceed total amount";
  }

  if (paidAmount > 0 && (!paymentType || !accountId)) {
    return "Payment account is required";
  }

  if (!explicitOpeningMode) {
    for (const item of items) {
      const productId = getProductId(item?.productId);
      const quantity = Number(item?.quantity || 0);

      if (
        !mongoose.Types.ObjectId.isValid(productId) ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        return "Invalid purchase return item";
      }
    }
  }

  return null;
};

const getSupplierOrParty = async ({ userId, supplierId, partyId }) => {
  if (partyId) {
    if (!mongoose.Types.ObjectId.isValid(partyId)) {
      return {
        supplier: null,
        party: null,
      };
    }

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: true,
    });

    return {
      supplier: null,
      party,
    };
  }

  if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
    return {
      supplier: null,
      party: null,
    };
  }

  const supplier = await Supplier.findOne({
    _id: supplierId,
    userId,
    isDeleted: false,
  });

  return {
    supplier,
    party: null,
  };
};

const getRequiredAccounts = async ({ userId, accountingOpeningMode }) => {
  const [purchaseReturnAccount, inventoryAccount, openingBalanceAccount] =
    await Promise.all([
      Account.findOne({
        code: "PURCHASE_RETURN",
        userId,
      }),

      Account.findOne({
        code: "INVENTORY",
        userId,
      }),

      accountingOpeningMode
        ? Account.findOne({
            code: "OPENING_BALANCE",
            userId,
          })
        : Promise.resolve(null),
    ]);

  if (
    !purchaseReturnAccount ||
    !inventoryAccount ||
    (accountingOpeningMode && !openingBalanceAccount)
  ) {
    return null;
  }

  return {
    purchaseReturnAccount,
    inventoryAccount,
    openingBalanceAccount,
  };
};

const getOwnedOriginalInvoice = async (originalInvoiceId, userId) => {
  if (!originalInvoiceId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(originalInvoiceId)) {
    return null;
  }

  return PurchaseInvoice.findOne({
    _id: originalInvoiceId,
    userId,
    isDeleted: false,
  })
    .select("items")
    .lean();
};

const validateReturnQuantities = async ({
  originalInvoice,
  originalInvoiceId,
  userId,
  items,
  excludeReturnId = null,
}) => {
  if (!originalInvoice || !originalInvoiceId) {
    return null;
  }

  const originalQtyMap = {};

  for (const item of originalInvoice.items || []) {
    const key = getProductId(item.productId);

    originalQtyMap[key] = Number(item.quantity || 0);
  }

  const filter = {
    originalInvoiceId,
    createdBy: userId,
    isDeleted: false,
  };

  if (excludeReturnId) {
    filter._id = {
      $ne: excludeReturnId,
    };
  }

  const previousReturns = await PurchaseReturn.find(filter)
    .select("items")
    .lean();

  const returnedQtyMap = {};

  for (const ret of previousReturns) {
    for (const item of ret.items || []) {
      const key = getProductId(item.productId);

      returnedQtyMap[key] =
        Number(returnedQtyMap[key] || 0) + Number(item.quantity || 0);
    }
  }

  for (const item of items) {
    const key = getProductId(item.productId);

    const originalQty = Number(originalQtyMap[key] || 0);
    const alreadyReturned = Number(returnedQtyMap[key] || 0);
    const currentQty = Number(item.quantity || 0);

    if (currentQty + alreadyReturned > originalQty) {
      return "Return quantity exceeds original invoice quantity";
    }
  }

  return null;
};

const createReturnInventoryEntries = async ({
  items,
  originalInvoice,
  purchaseReturnId,
  billNo,
  userId,
  notePrefix,
  entryDate = null,
}) => {
  const rateMap = new Map();

  for (const item of originalInvoice?.items || []) {
    rateMap.set(getProductId(item.productId), Number(item.price || 0));
  }

  await Promise.all(
    items.map((item) =>
      createInventoryEntry({
        productId: item.productId,
        type: "OUT",
        quantity: Number(item.quantity),
        note: `${notePrefix} #${billNo}`,
        invoiceId: purchaseReturnId,
        invoiceModel: "PurchaseReturn",
        userId,
        rate: Number(rateMap.get(getProductId(item.productId)) || 0),
        date: entryDate,
      }),
    ),
  );
};

const getLinkedJournalFilter = (purchaseReturnId, userId) => ({
  $or: [
    {
      referenceId: purchaseReturnId,
    },
    {
      invoiceId: purchaseReturnId,
    },
  ],

  sourceType: {
    $in: [
      "purchase_return",
      "opening_purchase_return",
      "purchase_return_payment",
    ],
  },

  createdBy: userId,
});

const collectJournalAccountIds = (entries = []) => {
  const ids = new Set();

  for (const entry of entries) {
    for (const line of entry.lines || []) {
      const accountId = getAccountId(line.account);

      if (accountId) {
        ids.add(accountId.toString());
      }
    }
  }

  return ids;
};

const recalculateUniqueAccounts = async (accountIds = []) => {
  const uniqueAccountIds = [
    ...new Set(
      accountIds
        .map((id) => getAccountId(id))
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  ];

  if (uniqueAccountIds.length === 0) {
    return;
  }

  await Promise.all(
    uniqueAccountIds.map((accountId) => recalculateAccountBalance(accountId)),
  );
};

const restorePurchaseReturnSnapshot = async (purchaseReturnId, snapshot) => {
  if (!snapshot) {
    return;
  }

  const restoreData = {
    ...snapshot,
  };

  delete restoreData._id;
  delete restoreData.__v;

  await PurchaseReturn.updateOne(
    {
      _id: purchaseReturnId,
    },
    {
      $set: restoreData,
    },
  );
};

const restoreInventorySnapshot = async ({
  purchaseReturnId,
  userId,
  snapshot,
}) => {
  await InventoryTransaction.deleteMany({
    invoiceId: purchaseReturnId,
    invoiceModel: "PurchaseReturn",
    userId,
  });

  if (!snapshot?.length) {
    return;
  }

  const documents = snapshot.map((item) => {
    const document = {
      ...item,
    };

    delete document.__v;

    return document;
  });

  await InventoryTransaction.insertMany(documents, {
    ordered: false,
  });
};

const rollbackCreatedPurchaseReturn = async ({
  purchaseReturnId,
  userId,
  attachments,
  affectedAccounts,
}) => {
  try {
    if (purchaseReturnId) {
      await Promise.all([
        JournalEntry.deleteMany(
          getLinkedJournalFilter(purchaseReturnId, userId),
        ),

        InventoryTransaction.deleteMany({
          invoiceId: purchaseReturnId,
          invoiceModel: "PurchaseReturn",
          userId,
        }),
      ]);

      await PurchaseReturn.deleteOne({
        _id: purchaseReturnId,
        createdBy: userId,
      });
    }

    await deletePurchaseReturnAttachments(attachments);

    await recalculateUniqueAccounts(affectedAccounts);
  } catch (rollbackError) {
    console.error("❌ Purchase Return Create Rollback Error:", rollbackError);
  }
};

exports.createPurchaseReturn = async (req, res) => {
  const userId = getUserId(req);

  let uploadedAttachments = [];
  let createdPurchaseReturnId = null;
  let affectedAccounts = [];

  try {
    const {
      billNo,
      returnDate,
      returnTime,
      supplierId,
      partyId,
      supplierPhone,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
      isOpening,
    } = req.body;

    const items = parseItems(req.body.items);

    if (!items) {
      return res.status(400).json({
        error: "Invalid items data",
      });
    }

    const totalAmount = Number(req.body.totalAmount);
    const paidAmount = Number(req.body.paidAmount || 0);

    const explicitOpeningMode = getExplicitOpeningMode(isOpening);

    const accountingOpeningMode = getAccountingOpeningMode({
      explicitOpeningMode,
      billNo,
      notes,
    });

    const validationError = validateBasicInput({
      supplierId,
      partyId,
      items,
      explicitOpeningMode,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
    });

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    const { supplier, party } = await getSupplierOrParty({
      userId,
      supplierId,
      partyId,
    });

    if (partyId && !party) {
      return res.status(404).json({
        error: "Party not found",
      });
    }

    if (!partyId && !supplier) {
      return res.status(404).json({
        error: "Supplier not found",
      });
    }

    const counterPartyAccountId = getAccountId(
      party ? party.account : supplier?.account,
    );

    if (!counterPartyAccountId) {
      return res.status(400).json({
        error: "Supplier account not linked",
      });
    }

    if (paidAmount > 0 && !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        error: "Invalid payment account",
      });
    }

    const accounts = await getRequiredAccounts({
      userId,
      accountingOpeningMode,
    });

    if (!accounts) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    let originalInvoice = null;

    if (originalInvoiceId) {
      originalInvoice = await getOwnedOriginalInvoice(
        originalInvoiceId,
        userId,
      );

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original invoice not found",
        });
      }

      if (!explicitOpeningMode) {
        const quantityError = await validateReturnQuantities({
          originalInvoice,
          originalInvoiceId,
          userId,
          items,
        });

        if (quantityError) {
          return res.status(400).json({
            error: quantityError,
          });
        }
      }
    }

    uploadedAttachments = await uploadPurchaseReturnFiles(req.files, userId);

    const attachmentUrl = uploadedAttachments[0]?.key || "";

    const attachmentType = uploadedAttachments[0]?.type || "";

    const resolvedReturnTime = returnTime || "";
    const returnDateTime = getReturnDateTime(
      returnDate || new Date(),
      resolvedReturnTime,
    );

    const purchaseReturn = new PurchaseReturn({
      billNo,
      returnDate: returnDateTime,
      returnTime: resolvedReturnTime,

      supplierId: supplier?._id || null,
      partyId: party?._id || null,

      supplierName: supplier?.name || party?.name || "",

      supplierPhone,

      originalInvoiceId: originalInvoiceId || null,

      totalAmount,
      paidAmount,
      paymentType,

      accountId: paidAmount > 0 && paymentType && accountId ? accountId : null,

      notes,
      items,

      createdBy: userId,

      isOpening: accountingOpeningMode,

      attachments: uploadedAttachments,
      attachmentUrl,
      attachmentType,
    });

    await purchaseReturn.save();

    createdPurchaseReturnId = purchaseReturn._id;

    affectedAccounts = [
      counterPartyAccountId,

      accountingOpeningMode
        ? accounts.openingBalanceAccount?._id
        : accounts.inventoryAccount?._id,

      paidAmount > 0 ? accountId : null,
    ];

    const lines = accountingOpeningMode
      ? [
          {
            account: counterPartyAccountId,
            type: "debit",
            amount: totalAmount,
          },
          {
            account: accounts.openingBalanceAccount._id,
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
            account: accounts.inventoryAccount._id,
            type: "credit",
            amount: totalAmount,
          },
        ];

    const journal = new JournalEntry({
      date: returnDateTime,

      time: resolvedReturnTime || "",

      description: `Purchase Return - ${
        supplier?.name || party?.name || ""
      } (Bill# ${billNo})`,

      sourceType: accountingOpeningMode
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

    if (paidAmount > 0) {
      await createPaymentEntry({
        userId,
        referenceId: purchaseReturn._id,
        sourceType: "purchase_return_payment",
        billNo: purchaseReturn.billNo,
        accountId,
        counterPartyAccountId,
        amount: paidAmount,
        paymentType,
        description: `Purchase Return Payment - ${purchaseReturn.billNo}`,
        supplierId: supplier?._id || null,
        partyId: party?._id || null,
        entryDate: returnDateTime,
        entryTime: resolvedReturnTime || "",
      });
    }

    if (!accountingOpeningMode) {
      await createReturnInventoryEntries({
        items,
        originalInvoice,
        purchaseReturnId: purchaseReturn._id,
        billNo,
        userId,
        notePrefix: "Purchase Return",
        entryDate: returnDateTime,
      });
    }

    await recalculateUniqueAccounts(affectedAccounts);

    await logActivity({
      req,
      action: "create",
      module: "purchase_returns",
      entityType: "PurchaseReturn",
      entityId: purchaseReturn._id,
      title: `Purchase Return ${purchaseReturn.billNo}`,
      description: `${purchaseReturn.supplierName} کی Purchase Return بنائی گئی`,
      billNo: purchaseReturn.billNo,

      after: {
        supplierName: purchaseReturn.supplierName,

        supplierPhone: purchaseReturn.supplierPhone,

        returnDate: purchaseReturn.returnDate,

        returnTime: purchaseReturn.returnTime,

        totalAmount: purchaseReturn.totalAmount,

        paidAmount: purchaseReturn.paidAmount,

        paymentType: purchaseReturn.paymentType,

        accountId: purchaseReturn.accountId,

        itemCount: purchaseReturn.items?.length || 0,

        isOpening: accountingOpeningMode,
      },
    });

    return res.status(201).json({
      message: "✅ Purchase Return created successfully",

      purchaseReturn,
    });
  } catch (err) {
    await rollbackCreatedPurchaseReturn({
      purchaseReturnId: createdPurchaseReturnId,

      userId,

      attachments: uploadedAttachments,

      affectedAccounts,
    });

    console.error("❌ Create Purchase Return Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

exports.getPurchaseReturnById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid Purchase Return ID",
      });
    }

    const pr = await PurchaseReturn.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    const paymentJournal = await JournalEntry.findOne({
      referenceId: pr._id,

      sourceType: "purchase_return_payment",

      createdBy: userId,

      isDeleted: false,
    })
      .select("lines paymentType")
      .populate("lines.account", "name");

    const paymentLine = paymentJournal?.lines?.find((line) => line.paymentType);

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

exports.getAllPurchaseReturns = async (req, res) => {
  try {
    const userId = getUserId(req);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);

    const requestedLimit = parseInt(req.query.limit || "10", 10);

    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();

    const supplier = String(req.query.supplier || "").trim();

    const paymentType = String(req.query.paymentType || "").trim();

    const fromDate = String(req.query.fromDate || "").trim();

    const toDate = String(req.query.toDate || "").trim();

    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const filter = {
      createdBy: userId,
      isDeleted: false,
    };

    if (supplier) {
      if (!mongoose.Types.ObjectId.isValid(supplier)) {
        return res.status(400).json({
          error: "Invalid supplier ID",
        });
      }

      filter.$or = [
        {
          supplierId: supplier,
        },
        {
          partyId: supplier,
        },
      ];
    }

    if (paymentType === "adjust") {
      filter.paymentType = {
        $in: ["", null],
      };
    } else if (paymentType) {
      filter.paymentType = paymentType;
    }

    if (safeSearch) {
      const searchConditions = [
        {
          billNo: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          supplierName: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          supplierPhone: {
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
      ];

      if (filter.$or) {
        filter.$and = [
          {
            $or: filter.$or,
          },
          {
            $or: searchConditions,
          },
        ];

        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const returnDateRange = buildBusinessDateRange({
      startDate: fromDate,
      endDate: toDate,
      field: "returnDate",
    }).returnDate;
    if (returnDateRange) {
      filter.returnDate = returnDateRange;
    }

    const [returns, totalReturns] = await Promise.all([
      PurchaseReturn.find(filter)
        .select(
          [
            "billNo",
            "returnDate",
            "returnTime",
            "supplierId",
            "partyId",
            "supplierName",
            "supplierPhone",
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

      PurchaseReturn.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(totalReturns / limit), 1);

    return res.status(200).json({
      returns,

      pagination: {
        page,
        limit,
        totalReturns,
        totalPages,

        hasPreviousPage: page > 1,

        hasNextPage: page < totalPages,
      },
    });
  } catch (err) {
    console.error("❌ Get All Purchase Returns Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

exports.updatePurchaseReturn = async (req, res) => {
  const userId = getUserId(req);

  let pr = null;
  let oldPurchaseReturnSnapshot = null;
  let oldJournalEntries = [];
  let oldInventoryTransactions = [];
  let newAttachments = [];
  let removedAttachments = [];
  let affectedAccountIds = new Set();
  let changesStarted = false;

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid Purchase Return ID",
      });
    }

    const {
      billNo,
      returnDate,
      returnTime,
      supplierId,
      partyId,
      supplierPhone,
      paymentType,
      accountId,
      notes,
      isOpening,
    } = req.body;

    const items = parseItems(req.body.items);

    if (!items) {
      return res.status(400).json({
        error: "Invalid items data",
      });
    }

    const totalAmount = Number(req.body.totalAmount);

    const paidAmount = Number(req.body.paidAmount || 0);

    const explicitOpeningMode = getExplicitOpeningMode(isOpening);

    const accountingOpeningMode = getAccountingOpeningMode({
      explicitOpeningMode,
      billNo,
      notes,
    });

    const validationError = validateBasicInput({
      supplierId,
      partyId,
      items,
      explicitOpeningMode,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
    });

    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    pr = await PurchaseReturn.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found",
      });
    }

    oldPurchaseReturnSnapshot = pr.toObject({
      depopulate: true,
    });

    const beforeUpdate = {
      billNo: pr.billNo,
      returnDate: pr.returnDate,
      returnTime: pr.returnTime,
      supplierId: pr.supplierId,
      partyId: pr.partyId,
      supplierName: pr.supplierName,
      supplierPhone: pr.supplierPhone,
      totalAmount: pr.totalAmount,
      paidAmount: pr.paidAmount,
      paymentType: pr.paymentType,
      accountId: pr.accountId,
      notes: pr.notes,
      itemCount: pr.items?.length || 0,
      isOpening: pr.isOpening || false,
    };

    const { supplier, party } = await getSupplierOrParty({
      userId,
      supplierId,
      partyId,
    });

    if (partyId && !party) {
      return res.status(404).json({
        error: "Party not found",
      });
    }

    if (!partyId && !supplier) {
      return res.status(404).json({
        error: "Supplier not found",
      });
    }

    const counterPartyAccountId = getAccountId(
      party ? party.account : supplier?.account,
    );

    if (!counterPartyAccountId) {
      return res.status(400).json({
        error: "Account not linked",
      });
    }

    if (paidAmount > 0 && !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        error: "Invalid payment account",
      });
    }

    const accounts = await getRequiredAccounts({
      userId,
      accountingOpeningMode,
    });

    if (!accounts) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    let originalInvoice = null;

    if (pr.originalInvoiceId) {
      originalInvoice = await getOwnedOriginalInvoice(
        pr.originalInvoiceId,
        userId,
      );

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original invoice not found",
        });
      }

      if (!explicitOpeningMode) {
        const quantityError = await validateReturnQuantities({
          originalInvoice,

          originalInvoiceId: pr.originalInvoiceId,

          userId,
          items,

          excludeReturnId: pr._id,
        });

        if (quantityError) {
          return res.status(400).json({
            error: quantityError,
          });
        }
      }
    }

    const existingAttachments = formatPurchaseReturnAttachments(pr).map(
      (att) => ({
        key: att.key,
        type: att.type || "",
        size: att.size || 0,
        originalName: att.originalName || "",
      }),
    );

    let keepAttachmentKeys = existingAttachments.map((att) => att.key);

    if (req.body.keepAttachmentKeys !== undefined) {
      try {
        const parsed = JSON.parse(req.body.keepAttachmentKeys || "[]");

        if (!Array.isArray(parsed)) {
          return res.status(400).json({
            error: "Invalid attachment data",
          });
        }

        keepAttachmentKeys = parsed;
      } catch {
        return res.status(400).json({
          error: "Invalid attachment data",
        });
      }
    }

    const keptAttachments = existingAttachments.filter((att) =>
      keepAttachmentKeys.includes(att.key),
    );

    removedAttachments = existingAttachments.filter(
      (att) => !keepAttachmentKeys.includes(att.key),
    );

    const incomingFileCount = req.files?.length || 0;

    if (keptAttachments.length + incomingFileCount > 3) {
      return res.status(400).json({
        error: "Maximum 3 attachments allowed",
      });
    }

    newAttachments = await uploadPurchaseReturnFiles(req.files, userId);

    const attachments = [...keptAttachments, ...newAttachments];

    const attachmentUrl = attachments[0]?.key || "";

    const attachmentType = attachments[0]?.type || "";

    oldJournalEntries = await JournalEntry.find({
      ...getLinkedJournalFilter(pr._id, userId),

      isDeleted: false,
    }).lean();

    oldInventoryTransactions = await InventoryTransaction.find({
      invoiceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    }).lean();

    affectedAccountIds = collectJournalAccountIds(oldJournalEntries);

    affectedAccountIds.add(counterPartyAccountId.toString());

    const newMainAccount = accountingOpeningMode
      ? accounts.openingBalanceAccount?._id
      : accounts.inventoryAccount?._id;

    if (newMainAccount) {
      affectedAccountIds.add(newMainAccount.toString());
    }

    if (paidAmount > 0 && accountId) {
      affectedAccountIds.add(accountId.toString());
    }

    changesStarted = true;

    await JournalEntry.updateMany(
      {
        ...getLinkedJournalFilter(pr._id, userId),

        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    await deleteTransactionsByReference({
      referenceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    const resolvedReturnTime =
      returnTime !== undefined ? returnTime || "" : pr.returnTime || "";
    const returnDateTime = getReturnDateTime(
      returnDate || pr.returnDate || new Date(),
      resolvedReturnTime,
    );

    pr.billNo = billNo;
    pr.returnDate = returnDateTime;
    pr.returnTime = resolvedReturnTime;

    pr.supplierId = supplier?._id || null;

    pr.partyId = party?._id || null;

    pr.supplierName = supplier?.name || party?.name || "";

    pr.supplierPhone = supplierPhone;
    pr.totalAmount = totalAmount;
    pr.paidAmount = paidAmount;
    pr.paymentType = paymentType;

    pr.accountId =
      paidAmount > 0 && paymentType && accountId ? accountId : null;

    pr.notes = notes;
    pr.items = items;

    pr.isOpening = accountingOpeningMode;

    pr.attachments = attachments;
    pr.attachmentUrl = attachmentUrl;
    pr.attachmentType = attachmentType;

    await pr.save();

    const lines = accountingOpeningMode
      ? [
          {
            account: counterPartyAccountId,

            type: "debit",

            amount: totalAmount,
          },
          {
            account: accounts.openingBalanceAccount._id,

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
            account: accounts.inventoryAccount._id,

            type: "credit",

            amount: totalAmount,
          },
        ];

    const journal = new JournalEntry({
      date: returnDateTime,

      time: resolvedReturnTime || "",

      description: `Purchase Return - ${
        supplier?.name || party?.name || ""
      } (Bill# ${billNo})`,

      sourceType: accountingOpeningMode
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

    if (paidAmount > 0) {
      await createPaymentEntry({
        userId,
        referenceId: pr._id,
        sourceType: "purchase_return_payment",

        billNo: pr.billNo,

        accountId,

        counterPartyAccountId,

        amount: paidAmount,

        paymentType,

        description: `Purchase Return Payment - ${pr.billNo}`,

        supplierId: supplier?._id || null,

        partyId: party?._id || null,

        entryDate: returnDateTime,

        entryTime: resolvedReturnTime || "",
      });
    }

    if (!accountingOpeningMode) {
      await createReturnInventoryEntries({
        items,
        originalInvoice,
        purchaseReturnId: pr._id,
        billNo,
        userId,
        notePrefix: "Updated Purchase Return",
        entryDate: returnDateTime,
      });
    }

    await recalculateUniqueAccounts([...affectedAccountIds]);

    await deletePurchaseReturnAttachments(removedAttachments);

    await logActivity({
      req,
      action: "update",
      module: "purchase_returns",
      entityType: "PurchaseReturn",
      entityId: pr._id,
      title: `Purchase Return ${pr.billNo}`,

      description: `${pr.supplierName} کی Purchase Return Update کی گئی`,

      billNo: pr.billNo,
      before: beforeUpdate,

      after: {
        billNo: pr.billNo,
        returnDate: pr.returnDate,
        returnTime: pr.returnTime,
        supplierId: pr.supplierId,
        partyId: pr.partyId,
        supplierName: pr.supplierName,
        supplierPhone: pr.supplierPhone,
        totalAmount: pr.totalAmount,
        paidAmount: pr.paidAmount,
        paymentType: pr.paymentType,
        accountId: pr.accountId,
        notes: pr.notes,
        itemCount: pr.items?.length || 0,
        isOpening: accountingOpeningMode,
      },
    });

    return res.json({
      message: "✅ Purchase Return updated successfully",

      purchaseReturn: pr,
    });
  } catch (err) {
    if (changesStarted && pr?._id && oldPurchaseReturnSnapshot) {
      try {
        const oldJournalIds = oldJournalEntries.map((entry) => entry._id);

        await JournalEntry.deleteMany({
          ...getLinkedJournalFilter(pr._id, userId),

          ...(oldJournalIds.length > 0
            ? {
                _id: {
                  $nin: oldJournalIds,
                },
              }
            : {}),
        });

        if (oldJournalIds.length > 0) {
          await JournalEntry.updateMany(
            {
              _id: {
                $in: oldJournalIds,
              },
            },
            {
              $set: {
                isDeleted: false,
              },
            },
          );
        }

        await restoreInventorySnapshot({
          purchaseReturnId: pr._id,

          userId,

          snapshot: oldInventoryTransactions,
        });

        await restorePurchaseReturnSnapshot(pr._id, oldPurchaseReturnSnapshot);

        await recalculateUniqueAccounts([...affectedAccountIds]);
      } catch (rollbackError) {
        console.error(
          "❌ Purchase Return Update Rollback Error:",
          rollbackError,
        );
      }
    }

    await deletePurchaseReturnAttachments(newAttachments);

    console.error("❌ Update Purchase Return Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

exports.deletePurchaseReturn = async (req, res) => {
  const userId = getUserId(req);

  let pr = null;
  let purchaseReturnSnapshot = null;
  let journalSnapshot = [];
  let inventorySnapshot = [];
  let affectedAccountIds = new Set();
  let changesStarted = false;

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid Purchase Return ID",
      });
    }

    pr = await PurchaseReturn.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!pr) {
      return res.status(404).json({
        error: "Purchase Return not found or already deleted",
      });
    }

    purchaseReturnSnapshot = pr.toObject({
      depopulate: true,
    });

    const beforeDelete = {
      billNo: pr.billNo,
      returnDate: pr.returnDate,
      returnTime: pr.returnTime,
      supplierId: pr.supplierId,
      partyId: pr.partyId,
      supplierName: pr.supplierName,
      supplierPhone: pr.supplierPhone,
      totalAmount: pr.totalAmount,
      paidAmount: pr.paidAmount,
      paymentType: pr.paymentType,
      accountId: pr.accountId,
      notes: pr.notes,
      itemCount: pr.items?.length || 0,
      isOpening: pr.isOpening || false,
    };

    journalSnapshot = await JournalEntry.find({
      ...getLinkedJournalFilter(pr._id, userId),

      isDeleted: false,
    }).lean();

    inventorySnapshot = await InventoryTransaction.find({
      invoiceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    }).lean();

    affectedAccountIds = collectJournalAccountIds(journalSnapshot);

    changesStarted = true;

    await JournalEntry.updateMany(
      {
        ...getLinkedJournalFilter(pr._id, userId),

        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    await deleteTransactionsByReference({
      referenceId: pr._id,
      invoiceModel: "PurchaseReturn",
      userId,
    });

    pr.isDeleted = true;

    await pr.save();

    await recalculateUniqueAccounts([...affectedAccountIds]);

    const attachmentsToDelete = formatPurchaseReturnAttachments(pr);

    await deletePurchaseReturnAttachments(attachmentsToDelete);

    await logActivity({
      req,
      action: "delete",
      module: "purchase_returns",
      entityType: "PurchaseReturn",
      entityId: pr._id,
      title: `Purchase Return ${pr.billNo}`,

      description: `${pr.supplierName} کی Purchase Return Delete کی گئی`,

      billNo: pr.billNo,
      before: beforeDelete,

      after: {
        isDeleted: true,
      },
    });

    return res.json({
      message: "✅ Purchase Return deleted successfully",
    });
  } catch (err) {
    if (changesStarted && pr?._id && purchaseReturnSnapshot) {
      try {
        if (journalSnapshot.length > 0) {
          await JournalEntry.updateMany(
            {
              _id: {
                $in: journalSnapshot.map((entry) => entry._id),
              },
            },
            {
              $set: {
                isDeleted: false,
              },
            },
          );
        }

        await restoreInventorySnapshot({
          purchaseReturnId: pr._id,

          userId,

          snapshot: inventorySnapshot,
        });

        await restorePurchaseReturnSnapshot(pr._id, purchaseReturnSnapshot);

        await recalculateUniqueAccounts([...affectedAccountIds]);
      } catch (rollbackError) {
        console.error(
          "❌ Purchase Return Delete Rollback Error:",
          rollbackError,
        );
      }
    }

    console.error("❌ Delete Purchase Return Error:", err);

    return res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};
