const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const Party = require("../models/Party");
const Product = require("../models/Product");
const Account = require("../models/Account");
const InventoryTransaction = require("../models/InventoryTransaction");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
} = require("../utils/moduleScope");

const getOwnerId = (req) => {
  return (
    req.user?.businessOwnerId ||
    req.user?.id ||
    req.user?._id ||
    req.userId ||
    null
  );
};

const toObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};

const getDocumentTimestamp = (document) => {
  if (!document) {
    return 0;
  }

  const value = document.updatedAt || document.createdAt || null;

  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildSectionVersion = (prefix, count, latestDocument) => {
  return `${prefix}:${count}:${getDocumentTimestamp(latestDocument)}`;
};

const getTradingCustomerQuery = (userId, extra = {}) =>
  applyModuleScopeFilter(
    {
      createdBy: userId,
      ...extra,
    },
    MODULE_SCOPES.TRADING,
  );

const buildInvoiceOptionsVersions = async (userId) => {
  const [
    latestCustomer,
    customerCount,
    latestParty,
    partyCount,
    latestProduct,
    productCount,
    latestInventoryTransaction,
    inventoryTransactionCount,
    latestPaymentAccount,
    paymentAccountCount,
  ] = await Promise.all([
    Customer.findOne(getTradingCustomerQuery(userId, { isActive: true }))
      .sort({ updatedAt: -1, _id: -1 })
      .select("updatedAt createdAt")
      .lean(),

    Customer.countDocuments(getTradingCustomerQuery(userId, { isActive: true })),

    Party.findOne({
      userId,
      isDeleted: false,
      isActive: true,
      role: {
        $in: ["customer", "both"],
      },
    })
      .sort({ updatedAt: -1, _id: -1 })
      .select("updatedAt createdAt")
      .lean(),

    Party.countDocuments({
      userId,
      isDeleted: false,
      isActive: true,
      role: {
        $in: ["customer", "both"],
      },
    }),

    Product.findOne({
      userId,
    })
      .sort({ updatedAt: -1, _id: -1 })
      .select("updatedAt createdAt")
      .lean(),

    Product.countDocuments({
      userId,
    }),

    InventoryTransaction.findOne({
      userId,
    })
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .select("updatedAt createdAt")
      .lean(),

    InventoryTransaction.countDocuments({
      userId,
    }),

    Account.findOne({
      userId,
      isActive: { $ne: false },
      type: "Asset",
      category: {
        $in: ["cash", "bank", "online", "cheque"],
      },
    })
      .sort({ updatedAt: -1, _id: -1 })
      .select("updatedAt createdAt")
      .lean(),

    Account.countDocuments({
      userId,
      isActive: { $ne: false },
      type: "Asset",
      category: {
        $in: ["cash", "bank", "online", "cheque"],
      },
    }),
  ]);

  const customersVersion = buildSectionVersion(
    "c",
    customerCount,
    latestCustomer,
  );

  const partiesVersion = buildSectionVersion("p", partyCount, latestParty);

  const productMasterVersion = buildSectionVersion(
    "pr",
    productCount,
    latestProduct,
  );

  const inventoryVersion = buildSectionVersion(
    "it",
    inventoryTransactionCount,
    latestInventoryTransaction,
  );

  const productsVersion = `${productMasterVersion}|${inventoryVersion}`;

  const paymentAccountsVersion = buildSectionVersion(
    "a",
    paymentAccountCount,
    latestPaymentAccount,
  );

  return {
    customers: customersVersion,
    parties: partiesVersion,
    products: productsVersion,
    paymentAccounts: paymentAccountsVersion,
  };
};

const getProductStockMap = async ({ userId, productIds }) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return new Map();
  }

  const stockRows = await InventoryTransaction.aggregate([
    {
      $match: {
        userId,
        productId: {
          $in: productIds,
        },
      },
    },
    {
      $group: {
        _id: "$productId",
        stock: {
          $sum: {
            $switch: {
              branches: [
                {
                  case: {
                    $eq: ["$type", "IN"],
                  },
                  then: "$quantity",
                },
                {
                  case: {
                    $eq: ["$type", "OUT"],
                  },
                  then: {
                    $multiply: ["$quantity", -1],
                  },
                },
                {
                  case: {
                    $eq: ["$type", "ADJUST_IN"],
                  },
                  then: "$quantity",
                },
                {
                  case: {
                    $eq: ["$type", "ADJUST_OUT"],
                  },
                  then: {
                    $multiply: ["$quantity", -1],
                  },
                },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);

  return new Map(
    stockRows.map((row) => [String(row._id), Number(row.stock || 0)]),
  );
};

const getCustomers = async (userId) => {
  return Customer.find(getTradingCustomerQuery(userId, { isActive: true }))
    .select("name phone account balance")
    .sort({
      name: 1,
      _id: 1,
    })
    .lean();
};

const getParties = async (userId) => {
  return Party.find({
    userId,
    isDeleted: false,
    isActive: true,
    role: {
      $in: ["customer", "both"],
    },
  })
    .select("name phone role account balance")
    .sort({
      name: 1,
      _id: 1,
    })
    .lean();
};

const getProducts = async (userId) => {
  const products = await Product.find({
    userId,
  })
    .select(
      [
        "name",
        "description",
        "unit",
        "uom",
        "unitCost",
        "salePrice",
        "lowStockThreshold",
        "categoryId",
      ].join(" "),
    )
    .populate("categoryId", "name")
    .sort({
      name: 1,
      _id: 1,
    })
    .lean();

  const productIds = products.map((product) => product._id);

  const stockMap = await getProductStockMap({
    userId,
    productIds,
  });

  return products.map((product) => {
    const stock = stockMap.get(String(product._id)) || 0;

    const lowStockThreshold = Number(product.lowStockThreshold || 0);

    return {
      _id: product._id,
      name: product.name || "",
      description: product.description || "",
      unit: product.unit || product.uom || "",
      uom: product.uom || product.unit || "",
      unitCost: Number(product.unitCost || 0),
      salePrice: Number(product.salePrice || 0),
      lowStockThreshold,
      categoryId: product.categoryId || null,
      stock,
      isLowStock: stock <= lowStockThreshold,
      isNegativeStock: stock < 0,
    };
  });
};

const getPaymentAccounts = async (userId) => {
  return Account.find({
    userId,
    isActive: {
      $ne: false,
    },
    type: "Asset",
    category: {
      $in: ["cash", "bank", "online", "cheque"],
    },
  })
    .select("name code category type")
    .sort({
      category: 1,
      name: 1,
      _id: 1,
    })
    .lean();
};

exports.getInvoiceFormOptions = async (req, res) => {
  try {
    const rawUserId = getOwnerId(req);
    const userId = toObjectId(rawUserId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid or missing user.",
      });
    }

    const currentVersions = await buildInvoiceOptionsVersions(userId);

    const clientVersions = {
      customers: String(req.query.customersVersion || "").trim(),

      parties: String(req.query.partiesVersion || "").trim(),

      products: String(req.query.productsVersion || "").trim(),

      paymentAccounts: String(req.query.paymentAccountsVersion || "").trim(),
    };

    const changed = {
      customers: clientVersions.customers !== currentVersions.customers,

      parties: clientVersions.parties !== currentVersions.parties,

      products: clientVersions.products !== currentVersions.products,

      paymentAccounts:
        clientVersions.paymentAccounts !== currentVersions.paymentAccounts,
    };

    const nothingChanged =
      !changed.customers &&
      !changed.parties &&
      !changed.products &&
      !changed.paymentAccounts;

    res.setHeader("Cache-Control", "private, no-store, max-age=0");

    if (nothingChanged) {
      return res.status(200).json({
        success: true,
        notModified: true,
        versions: currentVersions,
        changed,
      });
    }

    const loaders = [];

    if (changed.customers) {
      loaders.push(["customers", getCustomers(userId)]);
    }

    if (changed.parties) {
      loaders.push(["parties", getParties(userId)]);
    }

    if (changed.products) {
      loaders.push(["products", getProducts(userId)]);
    }

    if (changed.paymentAccounts) {
      loaders.push(["paymentAccounts", getPaymentAccounts(userId)]);
    }

    const loadedSections = await Promise.all(
      loaders.map(async ([key, promise]) => {
        const data = await promise;

        return [key, data];
      }),
    );

    const data = Object.fromEntries(loadedSections);

    return res.status(200).json({
      success: true,
      notModified: false,
      versions: currentVersions,
      changed,
      generatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    console.error("Invoice Form Options Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load invoice form options.",
      error: error.message,
    });
  }
};
