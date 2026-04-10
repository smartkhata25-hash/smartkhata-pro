/**
 * Aging Report Print Builder
 * --------------------------------
 * Purpose:
 *  - Convert raw aging data to print-ready format
 *  - Calculate totals safely
 *  - Prevent null / undefined issues
 *  - Keep template logic clean
 */

/* =================================
   Helpers
================================= */

const safeNumber = (value) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const formatDate = (date) => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("en-GB");
};

/* =================================
   Main Builder
================================= */

const buildAgingPrintData = ({ asOfDate, aging = [] }) => {
  const reportDate = asOfDate ? formatDate(asOfDate) : formatDate(new Date());

  let totalRecent = 0;
  let totalMid1 = 0;
  let totalMid2 = 0;
  let totalOldest = 0;
  let grandTotal = 0;

  const rows = [];

  if (Array.isArray(aging)) {
    for (const item of aging) {
      const recent = safeNumber(item.aging?.recent);
      const mid1 = safeNumber(item.aging?.mid1);
      const mid2 = safeNumber(item.aging?.mid2);
      const oldest = safeNumber(item.aging?.oldest);

      const total = safeNumber(item.total) || recent + mid1 + mid2 + oldest;

      totalRecent += recent;
      totalMid1 += mid1;
      totalMid2 += mid2;
      totalOldest += oldest;
      grandTotal += total;

      rows.push({
        customer: item.customerName || "-",
        recent,
        mid1,
        mid2,
        oldest,
        total,
      });
    }
  }

  /* =================================
     Final Object For Template
  ================================= */

  return {
    documentTitle: "Customer Aging Report",

    reportDate,

    summary: {
      totalRecent,
      totalMid1,
      totalMid2,
      totalOldest,
      grandTotal,
    },

    rows,
  };
};

module.exports = buildAgingPrintData;
