const { t } = require("../i18n/i18n");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatNumber = (value) => Number(value || 0).toFixed(2);

const typeLabel = (typeKey, lang) => {
  const labels = {
    purchase: t("purchases", lang),
    sale: t("sales", lang),
    refund: t("saleRefund", lang),
    purchase_return: t("purchaseReturn", lang),
    adjust: t("inventory.adjust", lang),
  };

  return labels[typeKey] || typeKey || "-";
};

const formatSignedQuantity = (value) => {
  const number = Number(value || 0);

  if (number > 0) return `+ ${formatNumber(number)}`;
  if (number < 0) return `- ${formatNumber(Math.abs(number))}`;

  return formatNumber(0);
};

const renderFilter = (label, value) =>
  value ? `<span><strong>${label}:</strong> ${escapeHtml(value)}</span>` : "";

const generateProductLedgerHTML = (data) => {
  const lang = data?.lang || "en";
  const dir = lang === "ur" ? "rtl" : "ltr";
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const filters = data?.filters || {};
  const period =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "-"} ${t("date.to", lang)} ${filters.endDate || "-"}`
      : t("ledger.allDates", lang);

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${t("inventory.productLedger", lang)}</title>
<style>
@page {
  size: ${data?.page?.pageSize || "A4"};
  margin: 8mm;
}

body {
  margin: 0;
  color: #111827;
  direction: ${dir};
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
}

.container {
  width: 100%;
}

.header {
  border-bottom: 2px solid #111827;
  margin-bottom: 10px;
  padding-bottom: 8px;
  text-align: center;
}

.header h1 {
  font-size: 22px;
  margin: 0;
}

.sub-info,
.filters,
.summary {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: center;
  margin: 8px 0;
}

.summary {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  font-weight: 800;
  justify-content: space-between;
  padding: 7px 9px;
}

table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
}

th,
td {
  border: 1px solid #111827;
  padding: 6px 5px;
  text-align: center;
  vertical-align: middle;
  word-break: break-word;
}

th {
  background: #e5e7eb;
  font-weight: 800;
}

td.party {
  text-align: ${lang === "ur" ? "right" : "left"};
}

.muted {
  color: #6b7280;
}

.footer {
  border-top: 1px solid #d1d5db;
  color: #6b7280;
  font-size: 10px;
  margin-top: 12px;
  padding-top: 6px;
  text-align: center;
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${t("inventory.productLedger", lang)}</h1>
    <div class="sub-info">
      <strong>${t("inventory.product", lang)}:</strong> ${escapeHtml(data?.product?.name || "-")}
      &nbsp; | &nbsp;
      <strong>${t("inventory.unit", lang)}:</strong> ${escapeHtml(data?.product?.unit || "-")}
      &nbsp; | &nbsp;
      <strong>${t("ledger.period", lang)}:</strong> ${escapeHtml(period)}
    </div>
    <div class="muted">${t("print.generatedBy", lang)} ${t("app.name", lang)} - ${escapeHtml(data?.generatedAt || "")}</div>
  </div>

  <div class="filters">
    ${renderFilter(t("common.type", lang), filters.type && filters.type !== "all" ? typeLabel(filters.type, lang) : "")}
    ${renderFilter(t("search", lang), filters.partySearch)}
  </div>

  <div class="summary">
    <span>${t("inventory.openingStock", lang)}: ${formatNumber(data?.summary?.openingStock)}</span>
    <span>${t("inventory.closingStock", lang)}: ${formatNumber(data?.summary?.closingStock)}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:14%">${t("date", lang)}</th>
        <th style="width:14%">${t("billNo", lang)}</th>
        <th style="width:18%">${t("common.type", lang)}</th>
        <th style="width:28%">${t("common.party", lang)}</th>
        <th style="width:13%">${t("qty", lang)}</th>
        <th style="width:13%">${t("balance", lang)}</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map(
                (row) => `
      <tr>
        <td>${escapeHtml(row.date || "-")}</td>
        <td>${escapeHtml(row.billNo || "-")}</td>
        <td>${escapeHtml(typeLabel(row.typeKey, lang))}</td>
        <td class="party">${escapeHtml(row.party || "-")}</td>
        <td>${formatSignedQuantity(row.signedQuantity)}</td>
        <td>${formatNumber(row.balance)}</td>
      </tr>`,
              )
              .join("")
          : `<tr><td colspan="6">${t("ledger.noTransactions", lang)}</td></tr>`
      }
    </tbody>
  </table>

  <div class="footer">${t("app.name", lang)}</div>
</div>
</body>
</html>
`;
};

module.exports = generateProductLedgerHTML;
