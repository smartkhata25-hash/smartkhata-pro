// backend/controllers/supplierController.js
const mongoose = require("mongoose");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const TravelServiceCategory = require("../models/TravelServiceCategory");
const {
  TRAVEL_VENDOR_TYPES,
  isSupportedTravelCurrency,
  normalizeCurrencyCode,
} = require("../config/travelConfig");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const Counter = require("../models/Counter");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const XLSX = require("xlsx");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getSupplierBalanceFromJournal } = require("../utils/balanceHelper");
const { logActivity } = require("../utils/activityLogger");
const {
  MODULE_SCOPES,
  applySupplierModuleScopeFilter,
  getRequestedModuleScope,
  normalizeModuleScope,
} = require("../utils/moduleScope");
const {
  getTravelVendorBalanceMap,
  getTravelVendorJournalFilter,
  roundMoney,
} = require("../services/travel/travelAccountingMetricsService");
const {
  buildBusinessDateRange,
  getCurrentBusinessTimeInput,
  parseBusinessDateTime,
  startOfBusinessDay,
} = require("../utils/businessDate");
const PurchaseInvoice = require("../models/purchaseInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const escapeRegex = (text = "") => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const cleanString = (value = "") => String(value || "").trim();

const TRAVEL_VENDOR_OPENING_ORIGIN = "travel_vendor_opening_balance";
const TRAVEL_OPENING_BALANCE_CODE = "TRAVEL_OPENING_BALANCE";

const getCurrentTravelOpeningTimestamp = () => {
  const time = getCurrentBusinessTimeInput();

  return {
    date: parseBusinessDateTime(new Date(), time, {
      defaultTime: "00:00",
      label: "travel opening balance date",
    }),
    time,
  };
};

const getOrCreateTravelOpeningBalanceAccount = async (userId) => {
  let openingAccount = await Account.findOne({
    userId,
    code: TRAVEL_OPENING_BALANCE_CODE,
  });

  if (!openingAccount) {
    return Account.create({
      userId,
      name: "travel opening balance equity",
      type: "Equity",
      normalBalance: "credit",
      code: TRAVEL_OPENING_BALANCE_CODE,
      category: "other",
      isSystem: true,
      isActive: true,
      moduleScope: MODULE_SCOPES.TRAVEL,
    });
  }

  if (
    openingAccount.moduleScope !== MODULE_SCOPES.TRAVEL ||
    openingAccount.isSystem !== true
  ) {
    openingAccount.moduleScope = MODULE_SCOPES.TRAVEL;
    openingAccount.isSystem = true;
    openingAccount.isActive = true;
    await openingAccount.save();
  }

  return openingAccount;
};

const resolveTravelVendorOpeningBalance = (body = {}, fallback = 0) => {
  const hasAmount = hasOwn(body, "openingBalanceAmount");
  const hasDirection = hasOwn(body, "openingBalanceDirection");
  const hasSigned = hasOwn(body, "openingBalance");

  if (!hasAmount && !hasDirection && !hasSigned) {
    return Number(fallback) || 0;
  }

  const rawAmount = hasAmount ? body.openingBalanceAmount : body.openingBalance;
  const amount = Math.abs(Number(rawAmount) || 0);

  if (amount === 0) {
    return 0;
  }

  const direction = String(
    body.openingBalanceDirection || body.openingBalanceType || "",
  )
    .trim()
    .toLowerCase();

  if (["advance", "receivable", "debit"].includes(direction)) {
    return -amount;
  }

  if (["payable", "credit", "due"].includes(direction)) {
    return amount;
  }

  if (hasSigned) {
    return Number(body.openingBalance) || 0;
  }

  return amount;
};

const replaceTravelVendorOpeningBalanceJournal = async ({
  userId,
  supplier,
  accountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  const oldJournals = await JournalEntry.find({
    supplierId: supplier._id,
    createdBy: userId,
    sourceType: "travel_adjustment",
    originModule: TRAVEL_VENDOR_OPENING_ORIGIN,
    isDeleted: false,
  }).lean();

  if (oldJournals.length > 0) {
    await JournalEntry.updateMany(
      {
        supplierId: supplier._id,
        createdBy: userId,
        sourceType: "travel_adjustment",
        originModule: TRAVEL_VENDOR_OPENING_ORIGIN,
        isDeleted: false,
      },
      {
        $set: { isDeleted: true },
      },
    );

    const oldAccountIds = new Set();
    oldJournals.forEach((journal) => {
      (journal.lines || []).forEach((line) => {
        if (line?.account) oldAccountIds.add(String(line.account));
      });
    });

    for (const oldAccountId of oldAccountIds) {
      await recalculateAccountBalance(oldAccountId);
    }
  }

  if (amount === 0) {
    await recalculateAccountBalance(accountId);
    return null;
  }

  const absAmount = Math.abs(amount);
  const openingBalanceAccount = await getOrCreateTravelOpeningBalanceAccount(userId);
  const journal = await JournalEntry.create({
    ...getCurrentTravelOpeningTimestamp(),
    description: "Travel Vendor Opening Balance",
    createdBy: userId,
    supplierId: supplier._id,
    sourceType: "travel_adjustment",
    originModule: TRAVEL_VENDOR_OPENING_ORIGIN,
    referenceId: supplier._id,
    billNo: `TVO-${String(supplier._id).slice(-6).toUpperCase()}`,
    lines:
      amount > 0
        ? [
            {
              account: openingBalanceAccount._id,
              type: "debit",
              amount: absAmount,
            },
            {
              account: accountId,
              type: "credit",
              amount: absAmount,
            },
          ]
        : [
            {
              account: accountId,
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

  await recalculateAccountBalance(accountId);
  await recalculateAccountBalance(openingBalanceAccount._id);

  return journal;
};

const buildTravelVendorResponse = async (userId, supplier) => {
  const record = await Supplier.findOne({
    _id: supplier._id,
    userId,
  })
    .select(
      "name phone email address notes openingBalance supplierType moduleScope account isDeleted hiddenReason isTravelVendor travelVendorType travelServiceCategories contactPerson preferredCurrency createdAt updatedAt",
    )
    .populate("travelServiceCategories", "name code isActive")
    .lean();

  const balanceMap = await getTravelVendorBalanceMap(userId, [record]);
  const accountId = String(record?.account?._id || record?.account || "");
  const balance = roundMoney(balanceMap.get(accountId) || 0);

  return {
    ...record,
    balance,
    currentPayable: Math.max(balance, 0),
    vendorCredit: Math.max(-balance, 0),
  };
};

exports.getSupplierDataVersion = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const supplierVersionQuery = applySupplierModuleScopeFilter(
      {
        userId: userObjectId,
      },
      getRequestedModuleScope(req.query, MODULE_SCOPES.TRADING),
    );

    const supplierAccounts = await Supplier.find(supplierVersionQuery)
      .select("account")
      .lean();

    const accountIds = supplierAccounts
      .map((supplier) => supplier.account)
      .filter(Boolean);

    const [latestSupplier, latestJournal] = await Promise.all([
      Supplier.findOne(supplierVersionQuery)
        .sort({ updatedAt: -1 })
        .select("updatedAt")
        .lean(),

      accountIds.length > 0
        ? JournalEntry.findOne({
            createdBy: userObjectId,
            isDeleted: { $ne: true },
            "lines.account": { $in: accountIds },
          })
            .sort({ updatedAt: -1 })
            .select("updatedAt")
            .lean()
        : null,
    ]);

    const supplierTime = latestSupplier?.updatedAt
      ? new Date(latestSupplier.updatedAt).getTime()
      : 0;

    const journalTime = latestJournal?.updatedAt
      ? new Date(latestJournal.updatedAt).getTime()
      : 0;

    return res.json({
      version: String(Math.max(supplierTime, journalTime)),
    });
  } catch (error) {
    console.error("Get Supplier Data Version Error:", error);

    return res.status(500).json({
      message: "Failed to check supplier data version",
    });
  }
};

const cleanCurrency = (value = "") => {
  const currency = normalizeCurrencyCode(value);

  if (!currency) {
    return "";
  }

  if (!isSupportedTravelCurrency(currency)) {
    throw createHttpError(400, "Unsupported travel currency");
  }

  return currency;
};

const normalizeTravelVendorType = (value = "") => {
  const cleanValue = cleanString(value);

  if (!cleanValue) {
    return "";
  }

  return TRAVEL_VENDOR_TYPES.includes(cleanValue) ? cleanValue : "other";
};

const normalizeTravelServiceCategories = async (categoryIds = [], userId) => {
  const ids = Array.isArray(categoryIds) ? categoryIds : [];

  const validIds = ids
    .map((id) => String(id || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return [];
  }

  const categories = await TravelServiceCategory.find({
    _id: { $in: validIds },
    userId,
    isActive: { $ne: false },
    isDeleted: false,
  })
    .select("_id")
    .lean();

  return categories.map((category) => category._id);
};

const buildTravelSupplierPayload = async (
  body = {},
  userId,
  { partial = false } = {},
) => {
  const payload = {};

  const hasTravelFields =
    hasOwn(body, "isTravelVendor") ||
    hasOwn(body, "travelVendorType") ||
    hasOwn(body, "travelServiceCategories") ||
    hasOwn(body, "contactPerson") ||
    hasOwn(body, "preferredCurrency");

  if (!partial && hasTravelFields) {
    payload.isTravelVendor = Boolean(
      body.isTravelVendor ||
      body.travelVendorType ||
      body.contactPerson ||
      body.preferredCurrency ||
      (Array.isArray(body.travelServiceCategories) &&
        body.travelServiceCategories.length > 0),
    );
  }

  if (hasOwn(body, "isTravelVendor")) {
    payload.isTravelVendor = body.isTravelVendor !== false;
  }

  if (hasOwn(body, "travelVendorType")) {
    payload.travelVendorType = normalizeTravelVendorType(body.travelVendorType);
  }

  if (hasOwn(body, "travelServiceCategories")) {
    payload.travelServiceCategories = await normalizeTravelServiceCategories(
      body.travelServiceCategories,
      userId,
    );
  }

  if (hasOwn(body, "contactPerson")) {
    payload.contactPerson = cleanString(body.contactPerson);
  }

  if (hasOwn(body, "preferredCurrency")) {
    payload.preferredCurrency = cleanCurrency(body.preferredCurrency);
  }

  return payload;
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
    const {
      name,
      phone,
      email,
      address,
      notes,
      openingBalance,
      supplierType,
      moduleScope,
    } = req.body;
    const userId = req.user?.id || req.userId;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Supplier name is required" });
    }

    const travelPayload = await buildTravelSupplierPayload(req.body, userId);
    const safeModuleScope = normalizeModuleScope(
      moduleScope,
      MODULE_SCOPES.TRADING,
    );

    const existing = await Supplier.findOne({
      name: new RegExp(`^${escapeRegex(name.trim())}$`, "i"),
      userId,
      isDeleted: false,
    });
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
      moduleScope: safeModuleScope,
      supplierType,
      ...travelPayload,
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

    await logActivity({
      req,
      action: "create",
      module: "suppliers",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Supplier ${supplier.name}`,
      description: `${supplier.name} Supplier بنایا گیا`,
      after: {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        supplierType: supplier.supplierType,
        moduleScope: supplier.moduleScope,
        isTravelVendor: supplier.isTravelVendor,
        travelVendorType: supplier.travelVendorType,
        travelServiceCategories: supplier.travelServiceCategories,
        contactPerson: supplier.contactPerson,
        preferredCurrency: supplier.preferredCurrency,
        openingBalance: supplier.openingBalance,
        account: supplier.account,
      },
    });

    res.status(201).json(supplier);
  } catch (err) {
    console.error("❌ Supplier create error:", err);
    res.status(400).json({ message: err.message });
  }
};

/* ───────────── Get Suppliers ───────────── */
exports.getSuppliers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const requestQuery = req.scopedQuery || req.query || {};

    const {
      search = "",
      type = "",
      status = "active",
      sort = "createdAt",
      page = 1,
      limit = 0,
      forTravel = "",
      moduleScope = "",
      travelVendor = "",
      vendorType = "",
      light = "",
    } = requestQuery;

    const query = { userId };

    applySupplierModuleScopeFilter(
      query,
      forTravel === "true"
        ? MODULE_SCOPES.TRAVEL
        : getRequestedModuleScope(
            { ...requestQuery, moduleScope },
            MODULE_SCOPES.TRADING,
          ),
    );

    // ✅ Active / Hidden / All
    if (status === "active") {
      query.isDeleted = false;
    } else if (status === "hidden") {
      query.isDeleted = true;
    }

    // ✅ Safe search
    const cleanSearch = String(search || "").trim();

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (type) {
      query.supplierType = type;
    }

    if (travelVendor === "true" || travelVendor === "tagged") {
      query.isTravelVendor = true;
    }

    if (vendorType) {
      query.travelVendorType = normalizeTravelVendorType(vendorType);
    }

    // ✅ Only allowed sorting fields
    const allowedSortFields = [
      "createdAt",
      "name",
      "supplierType",
      "openingBalance",
    ];

    const sortField = allowedSortFields.includes(sort) ? sort : "createdAt";

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 0, 0);
    const isTravelList = forTravel === "true";
    const isLightRequest = light === "true" || isTravelList;

    let supplierQuery = Supplier.find(query)
      .select(
        "name phone email address notes openingBalance supplierType moduleScope account isDeleted hiddenReason isTravelVendor travelVendorType travelServiceCategories contactPerson preferredCurrency createdAt updatedAt",
      )
      .sort({ [sortField]: 1 })
      .lean();

    if (isTravelList) {
      supplierQuery = supplierQuery.populate(
        "travelServiceCategories",
        "name code isActive",
      );
    }

    // ✅ Pagination MongoDB پر ہوگی، memory میں نہیں
    if (limitNumber > 0) {
      supplierQuery = supplierQuery
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber);
    }

    const suppliers = await supplierQuery;

    if (suppliers.length === 0) {
      return res.json([]);
    }

    if (isLightRequest) {
      return res.json(suppliers);
    }

    const supplierAccountIds = suppliers
      .map((supplier) => supplier.account)
      .filter(Boolean)
      .map((accountId) => new mongoose.Types.ObjectId(accountId));

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const balanceRows =
      supplierAccountIds.length > 0
        ? await JournalEntry.aggregate([
            {
              $match: {
                createdBy: userObjectId,
                isDeleted: { $ne: true },
                "lines.account": {
                  $in: supplierAccountIds,
                },
              },
            },
            {
              $unwind: "$lines",
            },
            {
              $match: {
                "lines.account": {
                  $in: supplierAccountIds,
                },
              },
            },
            {
              $group: {
                _id: "$lines.account",

                balance: {
                  $sum: {
                    $switch: {
                      branches: [
                        {
                          case: {
                            $eq: ["$lines.type", "credit"],
                          },
                          then: {
                            $toDouble: "$lines.amount",
                          },
                        },
                        {
                          case: {
                            $eq: ["$lines.type", "debit"],
                          },
                          then: {
                            $multiply: [
                              {
                                $toDouble: "$lines.amount",
                              },
                              -1,
                            ],
                          },
                        },
                      ],
                      default: 0,
                    },
                  },
                },
              },
            },
          ])
        : [];

    const accountBalanceMap = new Map(
      balanceRows.map((row) => [String(row._id), Number(row.balance) || 0]),
    );

    const suppliersWithBalance = suppliers.map((supplier) => ({
      ...supplier,

      balance: supplier.account
        ? accountBalanceMap.get(String(supplier.account)) || 0
        : 0,
    }));

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

exports.getTravelVendors = async (req, res) => {
  if (req.query?.includeBalance === "true") {
    try {
      const userId = req.user?.id || req.userId;

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ message: "Invalid user" });
      }

      const {
        search = "",
        status = "active",
        vendorType = "",
        travelVendor = "",
        limit = 500,
      } = req.query || {};
      const query = {
        userId: new mongoose.Types.ObjectId(userId),
      };

      applySupplierModuleScopeFilter(query, MODULE_SCOPES.TRAVEL);

      if (status === "active") {
        query.isDeleted = false;
      } else if (status === "hidden") {
        query.isDeleted = true;
      }

      if (travelVendor === "true" || travelVendor === "tagged") {
        query.isTravelVendor = true;
      }

      if (vendorType) {
        query.travelVendorType = normalizeTravelVendorType(vendorType);
      }

      const cleanSearch = String(search || "").trim();

      if (cleanSearch) {
        const safeSearch = escapeRegex(cleanSearch);
        query.$or = [
          { name: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
        ];
      }

      const limitNumber = Math.min(Math.max(Number(limit) || 500, 1), 1000);
      const vendors = await Supplier.find(query)
        .select(
          "name phone email address notes openingBalance supplierType moduleScope account isDeleted hiddenReason isTravelVendor travelVendorType travelServiceCategories contactPerson preferredCurrency createdAt updatedAt",
        )
        .populate("travelServiceCategories", "name code isActive")
        .sort({ name: 1, createdAt: -1 })
        .limit(limitNumber)
        .lean();

      const balanceMap = await getTravelVendorBalanceMap(userId, vendors);

      return res.json(
        vendors.map((vendor) => {
          const accountId = String(vendor.account?._id || vendor.account || "");
          const balance = roundMoney(balanceMap.get(accountId) || 0);

          return {
            ...vendor,
            balance,
            currentPayable: Math.max(balance, 0),
            vendorCredit: Math.max(-balance, 0),
          };
        }),
      );
    } catch (error) {
      console.error("Travel vendor fetch failed:", error);

      return res.status(500).json({
        message: "Travel vendor fetch failed",
        error: error.message,
      });
    }
  }

  const scopedReq = Object.create(req);

  scopedReq.scopedQuery = {
    ...(req.query || {}),
    forTravel: "true",
    light: "true",
    status: req.query?.status || "active",
  };

  return exports.getSuppliers(scopedReq, res);
};

exports.createTravelVendor = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, phone = "", email = "", address = "", notes = "" } =
      req.body || {};
    const cleanName = cleanString(name);

    if (!cleanName) {
      return res.status(400).json({ message: "Supplier name is required" });
    }

    const requestedScope = normalizeModuleScope(
      req.body?.moduleScope,
      MODULE_SCOPES.TRAVEL,
    );
    const safeModuleScope =
      requestedScope === MODULE_SCOPES.TRADING
        ? MODULE_SCOPES.TRAVEL
        : requestedScope;
    const openingBalance = resolveTravelVendorOpeningBalance(req.body, 0);

    const existing = await Supplier.findOne({
      name: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
      userId,
      isDeleted: false,
    });

    if (existing) {
      return res.status(400).json({ message: "Supplier already exists" });
    }

    const travelPayload = await buildTravelSupplierPayload(
      {
        ...req.body,
        isTravelVendor: true,
      },
      userId,
    );

    const account = await Account.create({
      userId,
      name: cleanName,
      code: await generateAccountCode(userId),
      type: "Liability",
      normalBalance: "credit",
      category: "supplier",
      openingBalance,
      isActive: true,
      moduleScope: MODULE_SCOPES.TRAVEL,
    });

    const supplier = await Supplier.create({
      name: cleanName,
      phone,
      email,
      address,
      notes,
      openingBalance,
      moduleScope: safeModuleScope,
      supplierType: "vendor",
      ...travelPayload,
      isTravelVendor: true,
      userId,
      account: account._id,
    });

    await replaceTravelVendorOpeningBalanceJournal({
      userId,
      supplier,
      accountId: account._id,
      openingBalance,
    });

    const responseSupplier = await buildTravelVendorResponse(userId, supplier);

    await logActivity({
      req,
      action: "create",
      module: "travel.vendors",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Travel vendor ${supplier.name}`,
      description: `Travel vendor ${supplier.name} created`,
      after: {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        moduleScope: supplier.moduleScope,
        isTravelVendor: supplier.isTravelVendor,
        travelVendorType: supplier.travelVendorType,
        travelServiceCategories: supplier.travelServiceCategories,
        contactPerson: supplier.contactPerson,
        preferredCurrency: supplier.preferredCurrency,
        openingBalance: supplier.openingBalance,
        account: supplier.account,
      },
    });

    return res.status(201).json(responseSupplier);
  } catch (error) {
    console.error("Travel vendor create error:", error);

    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Travel vendor create failed",
      error: error.message,
    });
  }
};

exports.updateSupplierTravelMetadata = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const supplierId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(String(supplierId))) {
      return res.status(400).json({ message: "Invalid supplier ID" });
    }

    const supplier = await Supplier.findOne(
      applySupplierModuleScopeFilter(
        {
          _id: supplierId,
          userId,
          isDeleted: false,
        },
        MODULE_SCOPES.TRAVEL,
      ),
    );

    if (!supplier) {
      return res.status(404).json({ message: "Travel vendor not found" });
    }

    const before = {
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      moduleScope: supplier.moduleScope,
      isTravelVendor: supplier.isTravelVendor,
      travelVendorType: supplier.travelVendorType,
      travelServiceCategories: supplier.travelServiceCategories,
      contactPerson: supplier.contactPerson,
      preferredCurrency: supplier.preferredCurrency,
      openingBalance: supplier.openingBalance,
      account: supplier.account,
    };
    const oldOpeningBalance = Number(supplier.openingBalance) || 0;
    const openingBalance = resolveTravelVendorOpeningBalance(
      req.body,
      oldOpeningBalance,
    );

    if (hasOwn(req.body, "name")) {
      const name = cleanString(req.body.name);

      if (!name) {
        return res.status(400).json({ message: "Supplier name is required" });
      }

      if (name.toLowerCase() !== supplier.name.trim().toLowerCase()) {
        const duplicate = await Supplier.findOne({
          name: new RegExp(`^${escapeRegex(name)}$`, "i"),
          userId,
          isDeleted: false,
          _id: { $ne: supplier._id },
        }).select("_id");

        if (duplicate) {
          return res.status(400).json({
            message:
              "Supplier name already exists. Please choose a different name.",
          });
        }
      }

      supplier.name = name;
    }

    if (hasOwn(req.body, "phone")) {
      supplier.phone = cleanString(req.body.phone);
    }

    if (hasOwn(req.body, "email")) {
      supplier.email = cleanString(req.body.email).toLowerCase();
    }

    if (hasOwn(req.body, "address")) {
      supplier.address = cleanString(req.body.address);
    }

    if (hasOwn(req.body, "notes")) {
      supplier.notes = cleanString(req.body.notes);
    }

    const travelPayload = await buildTravelSupplierPayload(
      {
        ...req.body,
        isTravelVendor: true,
      },
      userId,
      { partial: true },
    );

    const requestedModuleScope = hasOwn(req.body, "moduleScope")
      ? normalizeModuleScope(req.body.moduleScope, MODULE_SCOPES.TRAVEL)
      : normalizeModuleScope(supplier.moduleScope, MODULE_SCOPES.TRAVEL);

    Object.assign(supplier, travelPayload, {
      isTravelVendor: true,
      moduleScope:
        requestedModuleScope === MODULE_SCOPES.TRADING
          ? MODULE_SCOPES.TRAVEL
          : requestedModuleScope,
      openingBalance,
    });

    await supplier.save();
    await Account.updateOne(
      {
        _id: supplier.account,
        userId,
      },
      {
        $set: {
          name: supplier.name,
          type: "Liability",
          normalBalance: "credit",
          category: "supplier",
          openingBalance,
          moduleScope: MODULE_SCOPES.TRAVEL,
          isActive: true,
        },
      },
    );

    if (oldOpeningBalance !== openingBalance) {
      await replaceTravelVendorOpeningBalanceJournal({
        userId,
        supplier,
        accountId: supplier.account,
        openingBalance,
      });
    } else {
      await recalculateAccountBalance(supplier.account);
    }

    await supplier.populate("travelServiceCategories", "name code isActive");
    const responseSupplier = await buildTravelVendorResponse(userId, supplier);

    await logActivity({
      req,
      action: "update",
      module: "travel.vendors",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Travel vendor ${supplier.name}`,
      description: `Travel vendor ${supplier.name} updated`,
      before,
      after: {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        moduleScope: supplier.moduleScope,
        isTravelVendor: supplier.isTravelVendor,
        travelVendorType: supplier.travelVendorType,
        travelServiceCategories: supplier.travelServiceCategories,
        contactPerson: supplier.contactPerson,
        preferredCurrency: supplier.preferredCurrency,
        openingBalance: supplier.openingBalance,
        account: supplier.account,
      },
    });

    return res.json(responseSupplier);
  } catch (error) {
    console.error("Travel vendor update error:", error);

    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error?.name === "ValidationError" || error?.code === 11000) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: "Travel vendor update failed" });
  }
};

exports.deleteTravelVendor = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const actorId = req.actorId || userId;
    const supplierId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(String(supplierId))) {
      return res.status(400).json({ message: "Invalid vendor ID" });
    }

    const supplier = await Supplier.findOne(
      applySupplierModuleScopeFilter(
        {
          _id: supplierId,
          userId,
          isDeleted: false,
        },
        MODULE_SCOPES.TRAVEL,
      ),
    );

    if (!supplier) {
      return res.status(404).json({ message: "Travel vendor not found" });
    }

    const before = supplier.toObject();
    const reason = String(
      req.body?.deleteReason || req.query?.reason || "",
    ).trim();

    if (supplier.moduleScope === MODULE_SCOPES.BOTH) {
      if (Number(supplier.openingBalance || 0) !== 0) {
        await replaceTravelVendorOpeningBalanceJournal({
          userId,
          supplier,
          accountId: supplier.account,
          openingBalance: 0,
        });
      }

      supplier.moduleScope = MODULE_SCOPES.TRADING;
      supplier.isTravelVendor = false;
      supplier.openingBalance = 0;
      await Account.updateOne(
        {
          _id: supplier.account,
          userId,
        },
        {
          $set: {
            moduleScope: MODULE_SCOPES.TRADING,
            openingBalance: 0,
          },
        },
      );
    } else {
      supplier.isDeleted = true;
      supplier.supplierType = "blocked";
      supplier.hiddenReason = "deleted";
      supplier.deletedAt = new Date();
      supplier.deletedBy = actorId;
      supplier.deleteReason = reason;
    }

    await supplier.save();

    await logActivity({
      req,
      action: "delete",
      module: "travel.vendors",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Travel vendor ${supplier.name}`,
      description:
        before.moduleScope === MODULE_SCOPES.BOTH
          ? `${supplier.name} removed from Travel`
          : `${supplier.name} archived from Travel`,
      before,
      after: {
        isDeleted: supplier.isDeleted,
        supplierType: supplier.supplierType,
        moduleScope: supplier.moduleScope,
        isTravelVendor: supplier.isTravelVendor,
        hiddenReason: supplier.hiddenReason,
        deleteReason: supplier.deleteReason,
      },
    });

    return res.json({
      message:
        before.moduleScope === MODULE_SCOPES.BOTH
          ? "Vendor removed from Travel successfully"
          : "Travel vendor archived successfully",
      supplier,
    });
  } catch (error) {
    console.error("Travel vendor delete error:", error);

    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return res.status(500).json({ message: "Travel vendor delete failed" });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const supplierId = req.params.id;

    const {
      name,
      phone,
      email,
      address,
      notes,
      openingBalance,
      supplierType,
      moduleScope,
    } = req.body;

    // 1️⃣ Current supplier (جو edit ہو رہا ہے)
    const currentSupplier = await Supplier.findOne({
      _id: supplierId,
      userId,
      isDeleted: false,
    });

    if (!currentSupplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const beforeUpdate = {
      name: currentSupplier.name,
      phone: currentSupplier.phone,
      email: currentSupplier.email,
      address: currentSupplier.address,
      notes: currentSupplier.notes,
      openingBalance: currentSupplier.openingBalance,
      supplierType: currentSupplier.supplierType,
      moduleScope: currentSupplier.moduleScope,
      isTravelVendor: currentSupplier.isTravelVendor,
      travelVendorType: currentSupplier.travelVendorType,
      travelServiceCategories: currentSupplier.travelServiceCategories,
      contactPerson: currentSupplier.contactPerson,
      preferredCurrency: currentSupplier.preferredCurrency,
      account: currentSupplier.account,
    };
    const travelPayload = await buildTravelSupplierPayload(req.body, userId, {
      partial: true,
    });

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
          createdBy: userId,
          isDeleted: false,
        });

        const otherLedgerCount = await JournalEntry.countDocuments({
          supplierId: otherSupplier._id,
          createdBy: userId,
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
    if (hasOwn(req.body, "moduleScope")) {
      currentSupplier.moduleScope = normalizeModuleScope(
        moduleScope,
        currentSupplier.moduleScope || MODULE_SCOPES.TRADING,
      );
    }
    Object.assign(currentSupplier, travelPayload);

    // =====================================================
    // ✅ OPENING BALANCE UPDATE HANDLING
    // =====================================================

    const parsedOpeningBalance = Number(openingBalance) || 0;

    // 🔥 OLD opening journals remove
    await JournalEntry.updateMany(
      {
        supplierId: currentSupplier._id,
        createdBy: userId,
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
        userId,
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
        createdBy: userId,
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

      await JournalEntry.updateMany(
        {
          supplierId: currentSupplier._id,
          createdBy: userId,
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

    await logActivity({
      req,
      action: "update",
      module: "suppliers",
      entityType: "Supplier",
      entityId: currentSupplier._id,
      title: `Supplier ${currentSupplier.name}`,
      description: `${currentSupplier.name} Supplier Update کیا گیا`,
      before: beforeUpdate,
      after: {
        name: currentSupplier.name,
        phone: currentSupplier.phone,
        email: currentSupplier.email,
        address: currentSupplier.address,
        notes: currentSupplier.notes,
        openingBalance: currentSupplier.openingBalance,
        supplierType: currentSupplier.supplierType,
        moduleScope: currentSupplier.moduleScope,
        isTravelVendor: currentSupplier.isTravelVendor,
        travelVendorType: currentSupplier.travelVendorType,
        travelServiceCategories: currentSupplier.travelServiceCategories,
        contactPerson: currentSupplier.contactPerson,
        preferredCurrency: currentSupplier.preferredCurrency,
        account: currentSupplier.account,
      },
    });

    res.json(currentSupplier);
  } catch (error) {
    console.error("❌ Update Supplier Error:", error);

    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ CONFIRM MERGE SUPPLIER (SAFE ACCOUNTING VERSION)
exports.confirmMergeSupplier = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
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

    const beforeMerge = {
      sourceSupplierId: sourceSupplier._id,
      sourceName: sourceSupplier.name,
      sourceAccount: sourceSupplier.account,
      targetSupplierId: targetSupplier._id,
      targetName: targetSupplier.name,
      targetAccount: targetSupplier.account,
    };

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
      {
        _id: sourceSupplier.account,
        userId,
      },
      {
        $set: {
          isActive: false,
        },
      },
    );

    await logActivity({
      req,
      action: "merge",
      module: "suppliers",
      entityType: "Supplier",
      entityId: targetSupplier._id,
      title: "Supplier Merge",
      description: `${sourceSupplier.name} کو ${targetSupplier.name} میں Merge کیا گیا`,
      before: beforeMerge,
      after: {
        mergedInto: targetSupplier._id,
        sourceStatus: "merged",
        movedTransactions,
      },
    });

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
    const userId = req.user?.id || req.userId;
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

    const beforeDelete = {
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      openingBalance: supplier.openingBalance,
      supplierType: supplier.supplierType,
      account: supplier.account,
    };

    // 2️⃣ Check: supplier ka ledger hai ya nahi
    const hasLedger = await JournalEntry.exists({
      supplierId: supplier._id,
      createdBy: userId,
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

      await logActivity({
        req,
        action: "delete",
        module: "suppliers",
        entityType: "Supplier",
        entityId: supplier._id,
        title: `Supplier ${supplier.name}`,
        description: `${supplier.name} Supplier Hidden کیا گیا`,
        before: beforeDelete,
        after: {
          isDeleted: true,
          hiddenReason: "deleted",
          supplierType: "blocked",
          status: "hidden",
        },
      });

      return res.json({
        message: "Supplier has transactions, moved to hidden",
        status: "inactive",
        hiddenReason: "deleted",
      });
    }

    await Supplier.deleteOne({
      _id: supplier._id,
      userId,
    });

    await Account.deleteOne({
      _id: supplier.account,
      userId,
    });

    await logActivity({
      req,
      action: "delete",
      module: "suppliers",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Supplier ${supplier.name}`,
      description: `${supplier.name} Supplier Permanently Delete کیا گیا`,
      before: beforeDelete,
      after: {
        status: "deleted",
        isDeleted: true,
      },
    });

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
    const userId = req.user?.id || req.userId;
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

    await logActivity({
      req,
      action: "restore",
      module: "suppliers",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Supplier ${supplier.name}`,
      description: `${supplier.name} Supplier Restore کیا گیا`,
      before: {
        isDeleted: true,
        hiddenReason: "deleted",
        supplierType: "blocked",
      },
      after: {
        isDeleted: false,
        hiddenReason: null,
        supplierType: "vendor",
      },
    });

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
    const userId = req.user?.id || req.userId;
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
      {
        _id: supplier.account,
        userId,
      },
      { $set: { isActive: false } },
    );

    await recalculateAccountBalance(partyAccount._id);

    await logActivity({
      req,
      action: "convert",
      module: "suppliers",
      entityType: "Supplier",
      entityId: supplier._id,
      title: `Supplier ${supplier.name}`,
      description: `${supplier.name} Supplier کو Party میں Convert کیا گیا`,
      before: {
        supplierId: supplier._id,
        name: supplier.name,
        supplierAccount: supplier.account,
        closingBalance: supplierClosingBalance,
        isDeleted: false,
      },
      after: {
        partyId: party._id,
        partyAccount: partyAccount._id,
        openingBalance: partyOpeningBalance,
        supplierStatus: "converted",
      },
    });

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
    const userId = req.user?.id || req.userId;
    const { id: supplierId } = req.params;
    const { startDate, endDate, moduleScope = "" } = req.query;

    // 1️⃣ Supplier + account
    const supplier = await Supplier.findOne({
      _id: supplierId,
      userId,
    }).populate("account");

    if (!supplier || !supplier.account) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const accountId = supplier.account._id.toString();
    const travelJournalFilter =
      moduleScope === "travel" ? getTravelVendorJournalFilter() : {};

    // ===============================
    // 🔑 STEP 1: OPENING BALANCE (DATE WISE)
    // ===============================
    let openingBalance = 0;

    if (startDate) {
      const prevJournals = await JournalEntry.find({
        createdBy: userId,
        "lines.account": new mongoose.Types.ObjectId(accountId),
        isDeleted: false,
        ...travelJournalFilter,
        date: { $lt: startOfBusinessDay(startDate) },
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
      "lines.account": new mongoose.Types.ObjectId(accountId),
      isDeleted: false,
      ...travelJournalFilter,
    };

    const ledgerDateRange = buildBusinessDateRange({
      startDate,
      endDate,
    }).date;

    if (ledgerDateRange) {
      match.date = ledgerDateRange;
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
        originModule: entry.originModule || "",
        sourceLabel:
          entry.originModule === "travel_vendor_payment" &&
          entry.sourceType === "pay_bill"
            ? "Travel Vendor Payment"
            : entry.originModule === TRAVEL_VENDOR_OPENING_ORIGIN &&
                entry.sourceType === "travel_adjustment"
              ? "Travel Vendor Opening Balance"
            : entry.originModule === "travel_vendor_return" &&
                entry.sourceType === "purchase_return_payment"
              ? "Travel Vendor Return Receipt"
              : entry.sourceType === "travel_vendor_return"
                ? "Travel Vendor Return/Credit"
                : entry.sourceType === "reversal"
                  ? "Travel Reversal"
                  : entry.sourceType === "travel_vendor_cost"
                    ? "Travel Vendor Cost"
                    : entry.sourceType === "travel_refund"
                      ? "Travel Vendor Recovery"
                      : "",
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
    const userId = req.user?.id || req.userId;

    if (!req.file) {
      return res.status(400).json({ message: "File missing" });
    }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sh);

    const inserted = [];

    for (let r of rows) {
      const code = await generateAccountCode(userId);

      const account = await Account.create({
        name: r.Name || "",
        type: "Liability",
        normalBalance: "credit",
        code,
        category: "supplier",
        openingBalance: Number(r.OpeningBalance) || 0,
        userId,
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

    await logActivity({
      req,
      action: "create",
      module: "suppliers",
      entityType: "Supplier",
      entityId: inserted[0]?._id || null,
      title: `Supplier Import (${inserted.length})`,
      description: `${inserted.length} Suppliers Import کیے گئے`,
      after: {
        supplierCount: inserted.length,
        supplierNames: inserted.map((supplier) => supplier.name),
      },
    });

    res.json({ message: `${inserted.length} suppliers imported.` });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ message: err.message });
  }
};
