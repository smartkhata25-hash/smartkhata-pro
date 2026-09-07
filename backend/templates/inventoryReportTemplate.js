const { t } = require("../i18n/i18n");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatNumber = (value) => Number(value || 0).toFixed(2);

const renderFilter = (label, value) =>
  value ? `<span><strong>${label}:</strong> ${escapeHtml(value)}</span>` : "";

const generateInventoryReportHTML = (data) => {
  const lang = data?.lang || "en";
  const dir = lang === "ur" ? "rtl" : "ltr";
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const showCost = data?.columns?.showCost === true;
  const totalColumns = showCost ? 9 : 8;

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${t("inventory.report", lang)}</title>
<style>
@page {
  size: ${data?.page?.pageSize || "A4"};
  margin: 8mm;
}

body {
  margin: 0;
  color: #111827;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  direction: ${dir};
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
  margin: 0;
  font-size: 22px;
  font-weight: 800;
}

.meta,
.summary {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-between;
  margin: 8px 0;
}

.summary {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  font-weight: 700;
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

thead {
  display: table-header-group;
}

tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

td.name,
td.description {
  text-align: ${lang === "ur" ? "right" : "left"};
}

.muted {
  color: #6b7280;
}

.low {
  background: #fff7ed;
}

.zero {
  background: #fef2f2;
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
    <h1>${t("inventory.report", lang)}</h1>
    <div class="muted">${t("print.generatedBy", lang)} ${t("app.name", lang)} - ${escapeHtml(data?.generatedAt || "")}</div>
  </div>

  <div class="meta">
    ${renderFilter(t("search", lang), data?.filters?.search)}
    ${renderFilter(t("inventory.category", lang), data?.filters?.categoryName)}
    ${renderFilter(t("filter", lang), data?.filters?.stockFilter)}
  </div>

  <div class="summary">
    <span>${t("inventory.products", lang)}: ${Number(data?.summary?.productCount || 0)}</span>
    <span>${t("inventory.stock", lang)}: ${formatNumber(data?.summary?.totalStock)}</span>
    <span>${t("inventory.lowStock", lang)}: ${Number(data?.summary?.lowStockCount || 0)}</span>
    <span>${t("inventory.outOfStock", lang)}: ${Number(data?.summary?.zeroStockCount || 0)}</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:5%">#</th>
        <th style="width:22%">${t("inventory.product", lang)}</th>
        <th style="width:14%">${t("inventory.category", lang)}</th>
        <th style="width:10%">${t("inventory.rack", lang)}</th>
        <th style="width:18%">${t("description", lang)}</th>
        <th style="width:8%">${t("inventory.unit", lang)}</th>
        ${showCost ? `<th style="width:10%">${t("inventory.cost", lang)}</th>` : ""}
        <th style="width:10%">${t("price", lang)}</th>
        <th style="width:8%">${t("inventory.stock", lang)}</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map(
                (row, index) => `
      <tr class="${row.isZeroStock ? "zero" : row.isLowStock ? "low" : ""}">
        <td>${index + 1}</td>
        <td class="name">${escapeHtml(row.name || "-")}</td>
        <td>${escapeHtml(row.category || "-")}</td>
        <td>${escapeHtml(row.rackNo || "-")}</td>
        <td class="description">${escapeHtml(row.description || "-")}</td>
        <td>${escapeHtml(row.unit || "-")}</td>
        ${showCost ? `<td>${formatNumber(row.unitCost)}</td>` : ""}
        <td>${formatNumber(row.salePrice)}</td>
        <td>${formatNumber(row.stock)}</td>
      </tr>`,
              )
              .join("")
          : `<tr><td colspan="${totalColumns}">${t("common.noRecords", lang)}</td></tr>`
      }
    </tbody>
  </table>

  <div class="footer">${t("app.name", lang)}</div>
</div>
</body>
</html>
`;
};

module.exports = generateInventoryReportHTML;
