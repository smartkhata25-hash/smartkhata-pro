const { formatBusinessDate } = require("../utils/businessDate");

const safeNumber = (value) => Number(value || 0);

const formatDate = (value) => formatBusinessDate(value) || "";

const buildInventoryReportPrintData = ({
  products = [],
  filters = {},
  showCost = false,
  lang = "en",
}) => {
  const rows = products.map((product) => {
    const stock = safeNumber(product.stock);
    const threshold = safeNumber(product.lowStockThreshold);

    return {
      id: String(product._id || ""),
      name: product.name || "",
      category: product.categoryId?.name || "",
      rackNo: product.rackNo || "",
      description: product.description || "",
      unit: product.unit || "",
      unitCost: safeNumber(product.unitCost),
      salePrice: safeNumber(product.salePrice),
      stock,
      lowStockThreshold: threshold,
      isLowStock: stock <= threshold,
      isZeroStock: stock === 0,
    };
  });

  return {
    lang,
    documentTitle: "Inventory Report",
    generatedAt: formatDate(new Date()),
    filters: {
      search: filters.search || "",
      categoryName: filters.categoryName || "",
      stockFilter: filters.stockFilter || "",
    },
    columns: {
      showCost,
    },
    summary: {
      productCount: rows.length,
      totalStock: rows.reduce((sum, row) => sum + row.stock, 0),
      lowStockCount: rows.filter((row) => row.isLowStock).length,
      zeroStockCount: rows.filter((row) => row.isZeroStock).length,
    },
    rows,
    page: {
      pageSize: "A4",
    },
  };
};

const normalizeLedgerFilterType = (type) => {
  const value = String(type || "all").trim().toLowerCase();

  if (!value || value === "all") return "all";
  if (value === "purchase return") return "purchase_return";

  return value.replace(/\s+/g, "_");
};

const buildProductLedgerPrintData = ({
  product,
  openingStock = 0,
  rows = [],
  filters = {},
  lang = "en",
}) => {
  const filterType = normalizeLedgerFilterType(filters.type);
  const partySearch = String(filters.partySearch || "").trim().toLowerCase();

  const allRows = rows.map((row) => ({
    date: formatDate(row.date),
    billNo: row.billNo || "",
    type: row.type || "",
    typeKey: row.typeKey || "",
    party: row.party || "",
    quantity: safeNumber(row.quantity),
    signedQuantity: safeNumber(row.signedQuantity),
    balance: safeNumber(row.balance),
  }));

  const filteredRows = allRows.filter((row) => {
    const typeMatch = filterType === "all" || row.typeKey === filterType;
    const partyMatch =
      !partySearch || row.party.toLowerCase().includes(partySearch);

    return typeMatch && partyMatch;
  });

  const closingStock =
    allRows.length > 0
      ? safeNumber(allRows[allRows.length - 1].balance)
      : safeNumber(openingStock);

  return {
    lang,
    documentTitle: "Product Ledger",
    generatedAt: formatDate(new Date()),
    product: {
      name: product?.name || "",
      unit: product?.unit || "",
    },
    filters: {
      startDate: filters.startDate || "",
      endDate: filters.endDate || "",
      type: filterType,
      partySearch: filters.partySearch || "",
    },
    summary: {
      openingStock: safeNumber(openingStock),
      closingStock,
    },
    rows: filteredRows,
    page: {
      pageSize: "A4",
    },
  };
};

module.exports = {
  buildInventoryReportPrintData,
  buildProductLedgerPrintData,
};
