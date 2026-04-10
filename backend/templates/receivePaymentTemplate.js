const generateReceivePaymentHTML = (data = {}) => {
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
  const remainingBalance = totals?.remainingBalance ?? 0;

  /* ================= PAGE SIZE ================= */

  let pageSize = "A4";
  let pageMaxWidth = "800px";

  if (page?.pageWidth === "narrow") {
    pageSize = "A5";
    pageMaxWidth = "650px";
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
  .no-print {
    display: none !important;
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
  margin:3px 0;
  font-size:22px;
}

.header p{
  margin:2px 0;
  font-size:13px;
}

/* ================= TITLE ================= */

.title{
  text-align:center;
  font-size:18px;
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
  margin-top:8px;
}

th,td{
  border:1px solid #000;
  padding:5px;
  font-size:13px;
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

${
  header
    ? `
<div class="header">

${header.companyName ? `<h2>${header.companyName}</h2>` : ""}

${header.address ? `<p>${header.address}</p>` : ""}

${header.phone ? `<p>Phone: ${header.phone}</p>` : ""}

${header.taxNumber ? `<p>Tax No: ${header.taxNumber}</p>` : ""}

</div>
`
    : ""
}

<div class="title">
${documentTitle}
</div>

<div class="info-section">

<div class="info-left">

<div><strong>${party?.label || "Customer"}:</strong> ${party?.name || "-"}</div>

<div><strong>Phone:</strong> ${party?.phone || "-"}</div>

<div><strong>No:</strong> ${documentInfo?.receiptNo || "-"}</div>

</div>

<div class="info-right">



<div><strong>Date:</strong> ${documentInfo?.date || "-"}</div>

<div><strong>Time:</strong> ${documentInfo?.time || "-"}</div>

</div>

</div>

<table>

<thead>

<tr>

<th style="width:10%">#</th>
<th>Account</th>
<th style="width:25%">Payment Type</th>
<th style="width:25%">Amount</th>

</tr>

</thead>

<tbody>

${
  payments.length
    ? payments
        .map(
          (p) => `
<tr>

<td class="center">${p.index || ""}</td>

<td class="left">${p.accountName || "-"}</td>

<td class="center">${p.paymentType || "-"}</td>

<td class="right">${p.amount || ""}</td>

</tr>
`,
        )
        .join("")
    : `
<tr>
<td colspan="4" class="center">No payments</td>
</tr>
`
}

</tbody>

</table>

<div class="summary">

<div class="summary-row">
<span>Previous Balance</span>
<span>${previousBalance}</span>
</div>

<div class="summary-row">
<span>Received Amount</span>
<span>${receivedAmount}</span>
</div>

<div class="summary-row total">
<span>Remaining Balance</span>
<span>${remainingBalance}</span>
</div>

</div>

${
  extra?.description
    ? `
<div class="description">
<strong>Description:</strong> ${extra.description}
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
<div class="no-print" style="text-align:center;margin-top:15px;">
  <button onclick="window.print()" 
  style="padding:6px 14px;font-size:13px;cursor:pointer;">
  Print
  </button>
</div>

</div>

</body>

</html>
`;
};

module.exports = generateReceivePaymentHTML;
