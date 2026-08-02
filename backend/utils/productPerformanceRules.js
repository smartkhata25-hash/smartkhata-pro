const PERFORMANCE_VIEWS = Object.freeze({
  ALL: "all",
  TOP_PERFORMING: "top-performing",
  BEST_SELLING: "best-selling",
  MOST_PROFITABLE: "most-profitable",
  SLOW_MOVING: "slow-moving",
  DEAD_STOCK: "dead-stock",
  NEVER_SOLD: "never-sold",
  NEGATIVE_STOCK: "negative-stock",
});

const PERFORMANCE_SORT_FIELDS = Object.freeze({
  PERFORMANCE_SCORE: "performanceScore",
  PRODUCT_NAME: "productName",
  CURRENT_STOCK: "currentStock",
  GROSS_SOLD_QTY: "grossSoldQty",
  REFUND_QTY: "refundQty",
  NET_SOLD_QTY: "netSoldQty",
  GROSS_SALES: "grossSales",
  REFUND_AMOUNT: "refundAmount",
  NET_SALES: "netSales",
  NET_COST: "netCost",
  NET_PROFIT: "netProfit",
  PROFIT_MARGIN: "profitMargin",
  INVOICE_COUNT: "invoiceCount",
  LAST_SALE_DATE: "lastSaleDate",
  LAST_PURCHASE_DATE: "lastPurchaseDate",
  DAYS_SINCE_LAST_SALE: "daysSinceLastSale",
  BLOCKED_STOCK_VALUE: "blockedStockValue",
});

const SORT_DIRECTIONS = Object.freeze({
  ASC: "asc",
  DESC: "desc",
});

const STOCK_MOVEMENT_DAYS = Object.freeze({
  ACTIVE_MAX_DAYS: 30,
  SLOW_MAX_DAYS: 60,
  VERY_SLOW_MAX_DAYS: 90,
  DEFAULT_DEAD_AFTER_DAYS: 90,

  MIN_DEAD_AFTER_DAYS: 1,
  MAX_DEAD_AFTER_DAYS: 3650,
});

const PRODUCT_STATUSES = Object.freeze({
  ACTIVE: "active",
  SLOW_MOVING: "slow-moving",
  VERY_SLOW: "very-slow",
  DEAD_STOCK: "dead-stock",
  NEVER_SOLD: "never-sold",
  ZERO_STOCK: "zero-stock",
  NEGATIVE_STOCK: "negative-stock",
});

const PERFORMANCE_SCORE_WEIGHTS = Object.freeze({
  NET_PROFIT: 0.4,
  NET_SALES: 0.3,
  NET_SOLD_QUANTITY: 0.2,
  SALE_FREQUENCY: 0.1,
});

const PERFORMANCE_SCORE_LABELS = Object.freeze([
  {
    min: 80,
    max: 100,
    key: "excellent",
  },
  {
    min: 60,
    max: 79.9999,
    key: "good",
  },
  {
    min: 40,
    max: 59.9999,
    key: "average",
  },
  {
    min: 20,
    max: 39.9999,
    key: "slow",
  },
  {
    min: 0,
    max: 19.9999,
    key: "weak",
  },
]);

const PERFORMANCE_DEFAULTS = Object.freeze({
  VIEW: PERFORMANCE_VIEWS.ALL,

  PAGE: 1,
  LIMIT: 25,
  MAX_LIMIT: 100,

  SORT_BY: PERFORMANCE_SORT_FIELDS.PERFORMANCE_SCORE,
  SORT_ORDER: SORT_DIRECTIONS.DESC,

  DEAD_AFTER_DAYS: STOCK_MOVEMENT_DAYS.DEFAULT_DEAD_AFTER_DAYS,

  HIDE_ZERO_STOCK: false,
  IN_STOCK_ONLY: false,
  INCLUDE_NEGATIVE_STOCK: true,

  SEARCH: "",
  CATEGORY_ID: "",
  START_DATE: "",
  END_DATE: "",
});

const toSafeNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const roundAmount = (value, decimals = 2) => {
  const number = toSafeNumber(value, 0);
  const multiplier = 10 ** decimals;

  return Math.round((number + Number.EPSILON) * multiplier) / multiplier;
};

const clampNumber = (value, min = 0, max = 100) => {
  const number = toSafeNumber(value, min);

  return Math.min(Math.max(number, min), max);
};

const normalizeMetric = (value, maximumValue) => {
  const safeValue = Math.max(toSafeNumber(value, 0), 0);
  const safeMaximum = Math.max(toSafeNumber(maximumValue, 0), 0);

  if (safeMaximum <= 0 || safeValue <= 0) {
    return 0;
  }

  return clampNumber((safeValue / safeMaximum) * 100, 0, 100);
};

const calculatePerformanceScore = ({
  netProfit = 0,
  netSales = 0,
  netSoldQty = 0,
  invoiceCount = 0,

  maximumNetProfit = 0,
  maximumNetSales = 0,
  maximumNetSoldQty = 0,
  maximumInvoiceCount = 0,
} = {}) => {
  const profitScore = normalizeMetric(netProfit, maximumNetProfit);

  const salesScore = normalizeMetric(netSales, maximumNetSales);

  const quantityScore = normalizeMetric(netSoldQty, maximumNetSoldQty);

  const frequencyScore = normalizeMetric(invoiceCount, maximumInvoiceCount);

  const finalScore =
    profitScore * PERFORMANCE_SCORE_WEIGHTS.NET_PROFIT +
    salesScore * PERFORMANCE_SCORE_WEIGHTS.NET_SALES +
    quantityScore * PERFORMANCE_SCORE_WEIGHTS.NET_SOLD_QUANTITY +
    frequencyScore * PERFORMANCE_SCORE_WEIGHTS.SALE_FREQUENCY;

  return roundAmount(clampNumber(finalScore, 0, 100), 2);
};

const getPerformanceScoreLabel = (score) => {
  const safeScore = clampNumber(score, 0, 100);

  const matchedLabel = PERFORMANCE_SCORE_LABELS.find(
    (item) => safeScore >= item.min && safeScore <= item.max,
  );

  return matchedLabel?.key || "weak";
};

const calculateDaysDifference = (olderDate, newerDate = new Date()) => {
  if (!olderDate) {
    return null;
  }

  const start = new Date(olderDate);
  const end = new Date(newerDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  const difference = Math.floor(
    (end.getTime() - start.getTime()) / millisecondsPerDay,
  );

  return Math.max(difference, 0);
};

const classifyProductStatus = ({
  currentStock = 0,
  lastSaleDate = null,
  referenceDate = new Date(),
  deadAfterDays = PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,
} = {}) => {
  const stock = toSafeNumber(currentStock, 0);

  if (stock < 0) {
    return PRODUCT_STATUSES.NEGATIVE_STOCK;
  }

  if (stock === 0) {
    return PRODUCT_STATUSES.ZERO_STOCK;
  }

  if (!lastSaleDate) {
    return PRODUCT_STATUSES.NEVER_SOLD;
  }

  const daysSinceLastSale = calculateDaysDifference(
    lastSaleDate,
    referenceDate,
  );

  if (daysSinceLastSale === null) {
    return PRODUCT_STATUSES.NEVER_SOLD;
  }

  const safeDeadAfterDays = clampNumber(
    deadAfterDays,
    STOCK_MOVEMENT_DAYS.MIN_DEAD_AFTER_DAYS,
    STOCK_MOVEMENT_DAYS.MAX_DEAD_AFTER_DAYS,
  );

  if (daysSinceLastSale > safeDeadAfterDays) {
    return PRODUCT_STATUSES.DEAD_STOCK;
  }

  if (daysSinceLastSale > STOCK_MOVEMENT_DAYS.SLOW_MAX_DAYS) {
    return PRODUCT_STATUSES.VERY_SLOW;
  }

  if (daysSinceLastSale > STOCK_MOVEMENT_DAYS.ACTIVE_MAX_DAYS) {
    return PRODUCT_STATUSES.SLOW_MOVING;
  }

  return PRODUCT_STATUSES.ACTIVE;
};

const calculateBlockedStockValue = ({
  currentStock = 0,
  unitCost = 0,
  status = "",
} = {}) => {
  const stock = toSafeNumber(currentStock, 0);
  const cost = toSafeNumber(unitCost, 0);

  const isBlockedStock =
    status === PRODUCT_STATUSES.DEAD_STOCK ||
    status === PRODUCT_STATUSES.NEVER_SOLD;

  if (!isBlockedStock || stock <= 0 || cost <= 0) {
    return 0;
  }

  return roundAmount(stock * cost, 2);
};

const validatePerformanceConfiguration = () => {
  const totalWeight = Object.values(PERFORMANCE_SCORE_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );

  if (Math.abs(totalWeight - 1) > 0.0001) {
    throw new Error("Product performance score weights must total exactly 1.");
  }
};

validatePerformanceConfiguration();

module.exports = {
  PERFORMANCE_VIEWS,
  PERFORMANCE_SORT_FIELDS,
  SORT_DIRECTIONS,
  STOCK_MOVEMENT_DAYS,
  PRODUCT_STATUSES,
  PERFORMANCE_SCORE_WEIGHTS,
  PERFORMANCE_SCORE_LABELS,
  PERFORMANCE_DEFAULTS,

  toSafeNumber,
  roundAmount,
  clampNumber,
  normalizeMetric,
  calculatePerformanceScore,
  getPerformanceScoreLabel,
  calculateDaysDifference,
  classifyProductStatus,
  calculateBlockedStockValue,
};
