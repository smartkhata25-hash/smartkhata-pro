const { t } = require("../i18n/i18n");

const generateReceivePaymentHTML = (data = {}) => {
  const lang = data?.lang || "ur";
  const {
    documentTitle = "Receive Payment Receipt",
    header = {},
    documentInfo = {},
    party = {},
    payments = [],
    totals = {},
    footer = {},
    extra = {},
    page = {},
  } = data;

  const previousBalance = totals?.previousBalance ?? 0;
  const receivedAmount = totals?.receivedAmount ?? 0;
  const discountAmount = totals?.discountAmount ?? 0;
  const remainingBalance = totals?.remainingBalance ?? 0;

  /* ================= PAGE SIZE ================= */

  let pageSize = "A4";
  let pageMaxWidth = "800px";

  if (page?.pageWidth === "narrow") {
    pageSize = "A5";
    pageMaxWidth = "720px";
  }

  if (page?.pageWidth === "thermal") {
    pageSize = "80mm auto";
    pageMaxWidth = "300px";
  }

  /* ================= HTML ================= */

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8" />

<title>${documentTitle}</title>

<style>

@page{
  size:${pageSize};
  margin:5mm;
}

@media print {

  @page{
    size:A5 portrait;
    margin:6mm;
  }

  body{
    zoom:1.08;
    -webkit-print-color-adjust:exact;
  }

  .no-print{
    display:none !important;
  }

  table{
    border-collapse:collapse;
    border:2px solid #000;
  }

  th,td{
    border:2px solid #000 !important;
  }
}

body{
  font-family: Arial, Helvetica, sans-serif;
  margin:0;
  padding:0;
  color:#000;
}

.container{
  max-width:${pageMaxWidth};
  margin:0 auto;
}

/* ================= HEADER ================= */

.header{
  text-align:center;
  margin-bottom:10px;
}

.header h2{
  margin:4px 0;
  font-size:24px;
  font-weight:800;
}

.header p{
  margin:3px 0;
  font-size:15px;
  font-weight:700;
}

/* ================= TITLE ================= */

.title{
  text-align:center;
  font-size:24px;
  font-weight:bold;
  margin:8px 0;
  text-transform:uppercase;
}

/* ================= INFO ================= */

.info-section{
  display:grid;
  grid-template-columns:60% 40%;
  margin-bottom:8px;
  font-size:13px;
}

.info-left div,
.info-right div{
  margin:2px 0;
}

/* ================= TABLE ================= */

table{
  width:100%;
  border-collapse:collapse;
  margin-top:10px;
  border:2px solid #000;
}

th,td{
  border:2px solid #000;
  padding:6px;
  font-size:14px;
  font-weight:700;
  vertical-align:middle;
}

th{
  background:#f2f2f2;
  text-align:center;
}

td.left{
  text-align:left;
}

td.center{
  text-align:center;
}

td.right{
  text-align:right;
}

/* ================= TOTAL BOX ================= */

.summary{
  margin-top:12px;
  width:250px;
  margin-left:auto;
  font-size:13px;
}

.summary-row{
  display:flex;
  justify-content:space-between;
  padding:4px 0;
  border-bottom:1px solid #ddd;
}

.summary-row.total{
  font-weight:bold;
  border-top:2px solid #000;
}

/* ================= DESCRIPTION ================= */

.description{
  margin-top:12px;
  font-size:13px;
}

/* ================= FOOTER ================= */

.footer{
  margin-top:18px;
  text-align:center;
  font-size:12px;
  border-top:1px dashed #999;
  padding-top:6px;
}

/* ================= THERMAL OPTIMIZATION ================= */

${
  page?.pageWidth === "thermal"
    ? `
th,td{
  font-size:12px;
  padding:3px;
}

.title{
  font-size:16px;
}

.summary{
  width:100%;
}
`
    : ""
}

</style>

</head>

<body>

<div class="container">

<div class="title">
${documentTitle}
</div>

${
  header
    ? `
<div class="header">

${header.companyName ? `<h2>${header.companyName}</h2>` : ""}

${header.address ? `<p>${header.address}</p>` : ""}

${header.phone ? `<p>${t("phone", lang)}: ${header.phone}</p>` : ""}

${header.taxNumber ? `<p>${t("business.taxOptional", lang)}: ${header.taxNumber}</p>` : ""}

</div>
`
    : ""
}

<div class="info-section">

<div class="info-left">

<div><strong>${t("customer", lang)}:</strong> ${party?.name || "-"}</div>

<div><strong>${t("phone", lang)}:</strong> ${party?.phone || "-"}</div>

<div><strong>${t("billNo", lang)}:</strong> ${documentInfo?.receiptNo || "-"}</div>

</div>

<div class="info-right">

<div><strong>${t("date", lang)}:</strong> ${documentInfo?.date || "-"}</div>

<div><strong>${t("time", lang)}:</strong> ${documentInfo?.time || "-"}</div>

</div>

</div>

<table>

<thead>

<tr>

<th style="width:10%">#</th>
<th>${t("account", lang)}</th>
<th style="width:25%">${t("paymentType", lang)}</th>
<th style="width:25%">${t("amount", lang)}</th>

</tr>

</thead>

<tbody>

<tr>

<td class="center">1</td>

<td class="left">${t("customerTotalBalance", lang)}</td>

<td class="center">-</td>

<td class="right">${previousBalance}</td>

</tr>

${
  payments.length
    ? payments
        .map(
          (p, index) => `
<tr>

<td class="center">${index + 2}</td>

<td class="left">${p.accountName || "-"}</td>

<td class="center">${p.paymentType || "-"}</td>

<td class="right">${p.amount || ""}</td>

</tr>
`,
        )
        .join("")
    : ""
}

${
  Number(discountAmount) > 0
    ? `
<tr>

<td class="center">${payments.length + 2}</td>

<td class="left">${t("receivePaymentDiscount", lang)}</td>

<td class="center">-</td>

<td class="right">${discountAmount}</td>

</tr>
`
    : ""
}

</tbody>

</table>

<div class="summary">

<div class="summary-row total">
<span>${t("customerRemainingBalance", lang)}</span>
<span>${remainingBalance}</span>
</div>

</div>

${
  extra?.description
    ? `
<div class="description">
<strong>${t("description", lang)}:</strong> ${extra.description}
</div>
`
    : ""
}

${
  footer?.message
    ? `
<div class="footer">
${footer.message}
</div>
`
    : ""
}

${
  !page?.isPdf
    ? `
<script>
  window.onafterprint = function () {
    window.close();
  };
</script>

<div class="no-print" style="text-align:center;margin-top:15px;display:flex;justify-content:center;gap:10px;">

  <button 
    onclick="window.close()" 
    style="padding:6px 14px;font-size:13px;cursor:pointer;">
    ← ${t("back", lang)}
  </button>

  <button 
    onclick="window.print()" 
    style="padding:6px 14px;font-size:13px;cursor:pointer;">
    ${t("print", lang)}
  </button>

</div>
`
    : ""
}

</div>

</body>

</html>
`;
};

module.exports = generateReceivePaymentHTML;
