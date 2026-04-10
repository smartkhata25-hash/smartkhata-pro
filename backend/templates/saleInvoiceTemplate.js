const generateSaleInvoiceHTML = (data) => {
  if (!data) {
  }

  const {
    documentTitle,
    header,
    documentInfo,
    party,
    columns,
    items,
    totals,
    footer,
    page,
  } = data;

  if (!items || !Array.isArray(items)) {
  }

  const total = totals?.totalAmount ?? 0;
  const paid = totals?.paidAmount ?? 0;

  const balance =
    totals?.balance !== null && totals?.balance !== undefined
      ? totals.balance
      : total - paid;

  /* ================= HEADER & FOOTER SIZE SCALE ================= */

  const headerScale =
    header?.headerSize === "compact"
      ? 0.85
      : header?.headerSize === "spacious"
        ? 1.2
        : 1;

  const footerScale =
    footer?.footerSize === "compact"
      ? 0.85
      : footer?.footerSize === "spacious"
        ? 1.2
        : 1;

  /* ================= SCALE SYSTEM (KEPT INTACT) ================= */

  const BASE_FONT = 14;

  const layoutScale =
    columns?.rowHeight === "small"
      ? 0.9
      : columns?.rowHeight === "large"
        ? 1.15
        : 1;

  const bodyFontSize = BASE_FONT * layoutScale;
  const headerMainSize = BASE_FONT * 2 * layoutScale * headerScale;
  const sectionTitleSize = BASE_FONT * 1.2 * layoutScale;
  const footerTextSize = BASE_FONT * 0.85 * layoutScale * footerScale;
  const tableHeaderSize = BASE_FONT * 1.05 * layoutScale;

  const blockSpacing = 12 * layoutScale;
  const BASE_ROW_HEIGHT = 6; // 6mm base
  const rowHeightMM = BASE_ROW_HEIGHT * layoutScale;

  /* ================= COLUMN WIDTH SYSTEM (UNCHANGED) ================= */

  const sizeToPercent = {
    small: 8,
    compact: 12,
    medium: 18,
    large: 25,
  };

  const columnSizes = columns?.columnSizes || {};

  const defaultSizes = {
    name: "medium",
    description: "medium",
    uom: "compact",
    quantity: "compact",
    price: "compact",
    total: "compact",
  };

  const activeColumns = [
    "name",
    columns?.showDescription ? "description" : null,
    columns?.showUOM ? "uom" : null,
    "quantity",
    "price",
    "total",
  ].filter(Boolean);

  let calculatedWidths = {};

  activeColumns.forEach((col) => {
    const sizeKey = columnSizes[col] || defaultSizes[col];
    calculatedWidths[col] = sizeToPercent[sizeKey] || 15;
  });

  let totalPercent =
    activeColumns.reduce((sum, col) => sum + calculatedWidths[col], 0) + 5;

  if (totalPercent !== 100) {
    const diff = 100 - totalPercent;
    const adjust = diff / activeColumns.length;
    activeColumns.forEach((col) => {
      calculatedWidths[col] += adjust;
    });
  }

  const widthStyle = (key) => `width:${calculatedWidths[key] || 15}%`;

  const totalColumns = 1 + activeColumns.length;

  /* ================= PAGE ================= */

  const pageSize =
    page?.pageWidth === "narrow"
      ? "A5"
      : page?.pageWidth === "wide"
        ? "A4 landscape"
        : "A4";

  const pageMaxWidth =
    page?.pageWidth === "wide"
      ? "1000px"
      : page?.pageWidth === "narrow"
        ? "650px"
        : "800px";

  const footerStyle =
    footer?.footerBehavior === "hideIfNoSpace"
      ? "position:relative;"
      : "position:relative;";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${documentTitle || "Invoice"}</title>

<style>
@page {
  size: ${pageSize};
  margin-top: 4mm;
  margin-right: 6mm;
  margin-bottom: 6mm;
  margin-left: 6mm;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${bodyFontSize}px;
  margin: 0;
  color: #000;
}

.container {
  max-width: ${pageMaxWidth};
  margin: 0 auto;
}

/* ================= HEADER ================= */

.header {
  text-align: center;
  margin-bottom: ${3 * headerScale}px;
}

.header h2 {
  margin: ${2 * headerScale}px 0;
  font-size: ${headerMainSize}px;
  font-weight: 900;
}

.header p {
  margin: ${2 * headerScale}px 0;
  font-weight: 600;
}

/* ================= INFO ================= */

.info-section {
  display: grid;
  grid-template-columns: 70% 30%;
  margin-bottom: 4px;
  font-weight: 700;
}

.info-left div,
.info-right div {
  margin: 2px 0;
}

/* ================= TABLE ================= */

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 2px solid black;
}

th, td {
  border: 2px solid black;
  text-align: center;
  height: ${rowHeightMM}mm;
  min-height: ${rowHeightMM}mm;
  padding: 0;
  vertical-align: middle;
  font-weight: 700;
}

th {
  font-size: ${tableHeaderSize}px;
}

td.left {
  text-align: left;
  padding-left: 6px;
}

/* ================= TOTALS ================= */

.totals {
  margin-top: ${blockSpacing}px;
  width: 180px; /* یہاں سے آپ چوڑائی کنٹرول کریں گے */
  margin-left: auto;
  font-weight: 700;
}

.totals-row {
  display: grid;
  grid-template-columns: 1fr 80px;
  border-bottom: 2px solid black; /* اوپر کی جگہ نیچے لائن */
  padding: 2px 0; /* gap کم */
}

/* ================= FOOTER ================= */

.footer {
  margin-top: ${blockSpacing * footerScale}px;
  text-align: center;
  border-top: 1px solid #ccc;
  padding-top: ${6 * footerScale}px;
  font-size: ${footerTextSize}px;
  ${footerStyle}
}

</style>
</head>

<body>
<div class="container">

${
  header
    ? `
<div class="header">
  ${header.companyName ? `<h2>${header.companyName}</h2>` : ""}
  ${header.address ? `<p>${header.address}</p>` : ""}
  ${header.phone ? `<p>${header.phone}</p>` : ""}
</div>`
    : ""
}

<div class="info-section">
  <div class="info-left">
    <div><strong>Customer:</strong> ${party?.name || "-"}</div>
    <div><strong>Ph:</strong> ${party?.phone || "-"}</div>
    ${party?.by ? `<div><strong>By:</strong> ${party.by}</div>` : ""}
  </div>

  <div class="info-right">
    <div><strong>Bill No:</strong> ${documentInfo?.billNo || "-"}</div>
    <div><strong>Date:</strong> ${documentInfo?.date || ""} ${documentInfo?.time || ""}</div>
    <div><strong>Type:</strong> ${documentInfo?.type || "-"}</div>
  </div>
</div>

<table>
<thead>
<tr>
  <th style="width:5%">#</th>
  <th style="${widthStyle("name")}; text-align:left;">Item</th>
  ${
    columns?.showDescription
      ? `<th style="${widthStyle("description")}">Description</th>`
      : ""
  }
  ${columns?.showUOM ? `<th style="${widthStyle("uom")}">UOM</th>` : ""}
  <th style="${widthStyle("quantity")}">Qty</th>
  <th style="${widthStyle("price")}">Rate</th>
  <th style="${widthStyle("total")}">Amount</th>
</tr>
</thead>

<tbody>
${
  items?.length
    ? items
        .map(
          (item, index) => `
<tr>
  <td>${index + 1}</td>
  <td class="left">${item.name || "-"}</td>
  ${columns?.showDescription ? `<td>${item.description || "-"}</td>` : ""}
  ${columns?.showUOM ? `<td>${item.uom || "-"}</td>` : ""}
  <td>${item.quantity || 0}</td>
  <td>${item.price || 0}</td>
  <td>${item.total || 0}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="${totalColumns}">No items</td></tr>`
}
</tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Total:</span>
    <span>${total}</span>
  </div>

  ${
    totals?.discountAmount
      ? `<div class="totals-row">
           <span>Discount:</span>
           <span>${totals.discountAmount}</span>
         </div>`
      : ""
  }

  <div class="totals-row">
    <span>Net Total:</span>
    <span>${totals?.grandTotal || total}</span>
  </div>

  <div class="totals-row">
    <span>Paid:</span>
    <span>${paid}</span>
  </div>

  <div class="totals-row">
    <span>Balance:</span>
    <span>${balance}</span>
  </div>
</div>

${footer?.message ? `<div class="footer">${footer.message}</div>` : ""}

</div>
</body>
</html>
`;
};

module.exports = generateSaleInvoiceHTML;
