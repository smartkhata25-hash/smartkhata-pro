// Customer Detailed Ledger HTML Template

const { t } = require("../i18n/i18n");

const safeText = (value, fallback = "-") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const money = (value) => {
  const num = Number(value || 0);

  if (num < 0) {
    return `(${Math.abs(num).toFixed(2)})`;
  }

  return num.toFixed(2);
};

const getSourceLabel = (sourceType, fallback, lang) => {
  switch (sourceType) {
    case "opening_sale_invoice":
      return t("ledger.openingSaleInvoice", lang);

    case "sale_invoice":
      return t("saleInvoice", lang);

    case "refund_invoice":
      return t("refund.new", lang);

    case "receive_payment":
      return t("receivePayment", lang);

    case "opening_balance":
      return t("ledger.openingBalance", lang);

    default:
      return fallback || "-";
  }
};

const generateCustomerDetailLedgerHTML = (data, pageSize = "A4") => {
  const { documentTitle, customer, period, summary, blocks } = data;

  const lang = data?.lang || "ur";
  const isUrdu = lang === "ur";
  const dir = isUrdu ? "rtl" : "ltr";

  const title =
    documentTitle && documentTitle !== "Customer Detailed Ledger"
      ? documentTitle
      : t("ledger.customerDetailed", lang);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${title}</title>

<style>

@page {
  size: ${pageSize};
  margin: 6mm;
}

/* ===== BASE ===== */

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
  margin: 0;
  color: #000;
  direction: ${dir};
}

.container {
  width: 100%;
}

/* ===== HEADER ===== */

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

/* ===== SUMMARY ===== */

.summary {
  margin-top: ${pageSize === "A5" ? "6px" : "10px"};
  margin-bottom: ${pageSize === "A5" ? "6px" : "12px"};
  padding: ${pageSize === "A5" ? "4px" : "8px"};
  font-weight: 800;
  font-size: ${pageSize === "A5" ? "12px" : "15px"};
  border-top: 2px solid #000;
  border-bottom: 2px solid #000;
}

/* ===== BLOCK ===== */

.block {
  border: 2px solid #000;
  padding: ${pageSize === "A5" ? "6px" : "10px"};
  margin-bottom: ${pageSize === "A5" ? "6px" : "10px"};
  page-break-inside: avoid;
}

/* ===== BLOCK HEADER ===== */

.block-header {
  font-weight: 800;
  margin-bottom: 6px;
  font-size: ${pageSize === "A5" ? "12px" : "14px"};
}

/* ===== TABLE ===== */

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
  text-align: ${isUrdu ? "right" : "left"};
}

td.right {
  text-align: ${isUrdu ? "left" : "right"};
}

/* ===== TOTAL ROW ===== */

.totals-table td {
  font-weight: 700;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
}

/* ===== FOOTER ===== */

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

<!-- ===== HEADER ===== -->

<div class="header">
  <h2>${title}</h2>
  <div class="sub-info">
    ${t("customer", lang)}: ${safeText(customer?.name)}
    &nbsp;&nbsp; | &nbsp;&nbsp;
    ${t("ledger.period", lang)}: ${safeText(period?.from, t("common.all", lang))} ${t(
      "date.to",
      lang,
    )} ${safeText(period?.to, t("common.all", lang))}
  </div>
</div>

<!-- ===== SUMMARY ===== -->

<div class="summary">
  ${t("ledger.opening", lang)}: ${money(summary?.opening)} |
  ${t("credit", lang)}: ${money(summary?.totalDebit)} |
${t("debit", lang)}: ${money(summary?.totalCredit)} |
  ${t("ledger.closing", lang)}: ${money(summary?.closingBalance)}
</div>

<!-- ===== BLOCKS ===== -->

${(blocks || [])
  .map(
    (blk) => `

<div class="block">

<div class="block-header">
${getSourceLabel(blk.sourceType, blk.sourceLabel, lang)} #${safeText(blk.billNo)}
&nbsp;&nbsp; | &nbsp;&nbsp;
${t("common.date", lang)}: ${safeText(blk.date)}
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
<td class="right">${money(it.rate)}</td>
<td class="right">${money(it.total)}</td>
</tr>
`,
  )
  .join("")}

</tbody>
</table>
`
    : ""
}

<table class="totals-table">

<tr>
<td style="width:70%" class="right">${t("credit", lang)}</td>
<td style="width:30%" class="right">${
      blk.debit !== null && blk.debit !== undefined ? money(blk.debit) : "-"
    }</td>
</tr>

<tr>
<td class="right">${t("debit", lang)}</td>
<td class="right">${
      blk.credit !== null && blk.credit !== undefined ? money(blk.credit) : "-"
    }</td>
</tr>

<tr>
<td class="right">${t("common.balance", lang)}</td>
<td class="right">${money(blk.balance)}</td>
</tr>

</table>

</div>

`,
  )
  .join("")}

<!-- ===== FOOTER ===== -->

<div class="footer">
${t("print.generatedBy", lang)} ${t("app.name", lang)} • ${new Date().toLocaleDateString("en-GB")}
</div>

</div>

</body>
</html>
`;
};

module.exports = generateCustomerDetailLedgerHTML;
