const { t } = require("../i18n/i18n");

/**
 * Supplier Detailed Ledger HTML Template
 * ---------------------------------------
 * Professional accounting block layout
 * Supports A4 + A5
 */

const money = (value) => {
  const num = Number(value || 0);
  return num < 0 ? `(${Math.abs(num).toFixed(2)})` : num.toFixed(2);
};

const safeText = (value, fallback = "-") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const getSourceLabel = (sourceType, fallback, lang) => {
  switch (sourceType) {
    case "opening_purchase_invoice":
      return t("ledger.openingBalance", lang);

    case "purchase_invoice":
      return t("purchaseInvoice", lang);

    case "purchase_return":
      return t("purchaseReturn", lang);

    case "pay_bill":
    case "purchase_payment":
      return t("payment", lang);

    case "opening_balance":
      return t("ledger.openingBalance", lang);

    default:
      return fallback || "-";
  }
};

const generateSupplierDetailLedgerHTML = (data, pageSize = "A4") => {
  const lang = data?.lang || "ur";
  const { documentTitle, supplier, period, summary, blocks } = data;

  const title =
    documentTitle && documentTitle !== "Supplier Detailed Ledger"
      ? documentTitle
      : t("ledger.supplierDetailed", lang);

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${title}</title>

<style>
@page {
  size: ${pageSize};
  margin: 6mm;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
  margin: 0;
  color: #000;
}

.container {
  width: 100%;
}

.header {
  text-align: center;
  margin-bottom: ${pageSize === "A5" ? "8px" : "14px"};
}

.header h2 {
  margin: 0;
  font-size: ${pageSize === "A5" ? "16px" : "20px"};
  font-weight: 800;
}

.sub-info {
  margin-top: 4px;
  font-weight: 600;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
}

.summary {
  margin-top: ${pageSize === "A5" ? "6px" : "10px"};
  margin-bottom: ${pageSize === "A5" ? "6px" : "12px"};
  padding: ${pageSize === "A5" ? "4px" : "8px"};
  font-weight: 800;
  font-size: ${pageSize === "A5" ? "12px" : "15px"};
  border-top: 2px solid #000;
  border-bottom: 2px solid #000;
}

.block {
  border: 2px solid #000;
  padding: ${pageSize === "A5" ? "6px" : "10px"};
  margin-bottom: ${pageSize === "A5" ? "6px" : "10px"};
  page-break-inside: avoid;
}

.block-header {
  font-weight: 800;
  margin-bottom: 6px;
  font-size: ${pageSize === "A5" ? "12px" : "14px"};
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-top: 4px;
}

th {
  border: 1px solid #000;
  padding: ${pageSize === "A5" ? "4px" : "6px"};
  text-align: center;
  font-weight: 800;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
}

td {
  border: 1px solid #000;
  padding: ${pageSize === "A5" ? "4px" : "6px"};
  text-align: center;
  font-weight: 600;
}

td.left {
  text-align: left;
}

td.right {
  text-align: right;
}

.totals-table td {
  font-weight: 700;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
}

.footer {
  margin-top: ${pageSize === "A5" ? "10px" : "16px"};
  text-align: center;
  font-size: ${pageSize === "A5" ? "9px" : "11px"};
  border-top: 1px solid #ccc;
  padding-top: 6px;
}
</style>
</head>

<body>
<div class="container">

<div class="header">
  <h2>${title}</h2>
  <div class="sub-info">
    ${t("supplier", lang)}: ${safeText(supplier?.name)}
    &nbsp;&nbsp; | &nbsp;&nbsp;
    ${t("ledger.period", lang)}: ${safeText(period?.from)} ${t("date.to", lang)} ${safeText(period?.to)}
  </div>
</div>

<div class="summary">
  ${t("ledger.opening", lang)}: ${money(summary?.opening)} |
  ${t("ledger.totalDebit", lang)}: ${money(summary?.totalDebit)} |
  ${t("ledger.totalCredit", lang)}: ${money(summary?.totalCredit)} |
  ${t("ledger.closing", lang)}: ${money(summary?.closingBalance)}
</div>

${(blocks || [])
  .map(
    (blk) => `
<div class="block">

<div class="block-header">
${getSourceLabel(blk.sourceType, blk.sourceLabel, lang)} #${safeText(blk.billNo)}
&nbsp;&nbsp; | &nbsp;&nbsp;
${t("date", lang)}: ${safeText(blk.date)}
</div>

${
  blk.items && blk.items.length > 0
    ? `
<table>
<thead>
<tr>
<th style="width:60%">${t("inventory.product", lang)}</th>
<th style="width:10%">${t("common.qty", lang)}</th>
<th style="width:12%">${t("rate", lang)}</th>
<th style="width:18%">${t("common.total", lang)}</th>
</tr>
</thead>

<tbody>
${blk.items
  .map(
    (it) => `
<tr>
<td class="left">${safeText(it.productName, t("inventory.product", lang))}</td>
<td>${Number(it.quantity || 0)}</td>
<td>${money(it.rate)}</td>
<td>${money(it.total)}</td>
</tr>
`,
  )
  .join("")}
</tbody>
</table>
`
    : ""
}

<table class="totals-table" style="width:100%; border-collapse:collapse;">
  <tr>
    <td style="border:none; width:55%;"></td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:20%;">
      ${t("debit", lang)}
    </td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:25%;">
      ${blk.debit ? money(blk.debit) : "-"}
    </td>
  </tr>

  <tr>
    <td style="border:none; width:55%;"></td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:20%;">
      ${t("credit", lang)}
    </td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:25%;">
      ${blk.credit ? money(blk.credit) : "-"}
    </td>
  </tr>

  <tr>
    <td style="border:none; width:55%;"></td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:20%;">
      ${t("balance", lang)}
    </td>
    <td style="border:1px solid #333; text-align:center; padding:4px; width:25%;">
      ${money(blk.balance)}
    </td>
  </tr>
</table>

</div>
`,
  )
  .join("")}

<div class="footer">
${t("app.name", lang)} • ${new Date().toLocaleDateString("en-GB")}
</div>

</div>
</body>
</html>
`;
};

module.exports = generateSupplierDetailLedgerHTML;
