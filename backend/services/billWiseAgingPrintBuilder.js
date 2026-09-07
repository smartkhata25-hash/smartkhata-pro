const { formatBusinessDate } = require("../utils/businessDate");

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatDate = (value) => formatBusinessDate(value) || "-";

const buildBillWiseAgingPrintData = ({ agingData, lang = "en" }) => {
  const data = agingData || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const entityType = data.entityType === "party" ? "party" : "customer";
  const entityName = data.entity?.name || "-";

  return {
    lang,
    documentTitle:
      entityType === "party"
        ? "Party Aging Ledger"
        : "Customer Aging Ledger",
    entityType,
    entity: {
      name: entityName,
      phone: data.entity?.phone || "",
      role: data.entity?.role || "",
    },
    asOfDate: formatDate(data.asOfDate),
    summary: {
      originalTotal: safeNumber(data.summary?.originalTotal),
      paidAdjustedTotal: safeNumber(data.summary?.paidAdjustedTotal),
      totalOutstanding: safeNumber(data.summary?.totalOutstanding),
      billCount: safeNumber(data.summary?.billCount),
      buckets: {
        days0to30: safeNumber(data.summary?.buckets?.days0to30),
        days31to60: safeNumber(data.summary?.buckets?.days31to60),
        days61to90: safeNumber(data.summary?.buckets?.days61to90),
        days90plus: safeNumber(data.summary?.buckets?.days90plus),
      },
    },
    rows: rows.map((row) => ({
      billNo: row.billNo || "-",
      invoiceDate: formatDate(row.invoiceDateKey || row.invoiceDate),
      dueDate: row.dueDateKey || row.dueDate ? formatDate(row.dueDateKey || row.dueDate) : "-",
      days: safeNumber(row.days),
      daysType: row.daysType === "overdue" ? "overdue" : "age",
      bucket: row.bucket || "days0to30",
      originalAmount: safeNumber(row.originalAmount),
      paidAdjusted: safeNumber(row.paidAdjusted),
      outstanding: safeNumber(row.outstanding),
    })),
  };
};

module.exports = buildBillWiseAgingPrintData;
