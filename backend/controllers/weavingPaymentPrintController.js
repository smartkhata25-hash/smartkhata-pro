const WeavingMoneyTransaction = require("../models/WeavingMoneyTransaction");
const { generatePdfFromHtml } = require("../services/pdfService");
const { getLedgerPrintHeader } = require("../services/ledgerPrintHeaderService");
const { formatMoney } = require("../utils/money");
const {
  ledgerBusinessHeaderStyles,
  renderLedgerBusinessHeader,
} = require("../templates/ledgerBusinessHeader");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+05:00`);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
};

const formatTime = (value) => {
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleTimeString("en-PK", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Karachi",
      })
    : "";
};

const detailRow = (label, value) =>
  value
    ? `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    : "";

const safeFilePart = (value) =>
  String(value || "payment").replace(/[^a-zA-Z0-9._-]+/g, "-");

const getLinkedReference = (transaction) =>
  transaction.salesInvoiceId?.invoiceNo ||
  transaction.purchaseInvoiceId?.purchaseNo ||
  transaction.sizingBillId?.billNo ||
  "";

const renderPaymentReceipt = ({ transaction, header, autoPrint = false }) => {
  const isReceive = transaction.type === "receive";
  const title = isReceive ? "Receive Payment" : "Payment Made";
  const partyLabel = isReceive ? "Customer / Party" : "Supplier / Party";
  const linkedReference = getLinkedReference(transaction);
  const createdTime = formatTime(transaction.createdAt);
  const chequeDetails =
    transaction.paymentMethod === "cheque"
      ? [
          detailRow("Cheque Number", transaction.chequeNo),
          detailRow("Cheque Bank", transaction.chequeBank),
          detailRow("Cheque Date", formatDate(transaction.chequeDate)),
        ].join("")
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${ledgerBusinessHeaderStyles}
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0}
    .receipt{max-width:760px;margin:0 auto}.document-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin:18px 0}
    .module{color:#0f766e;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.document-head h1{font-size:26px;margin:4px 0 0}
    .number{text-align:right;font-size:12px;color:#64748b}.number strong{display:block;color:#172033;font-size:16px;margin-top:4px}
    .amount{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;margin:16px 0;padding:18px;text-align:center}
    .amount span{color:#64748b;display:block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.amount strong{color:#047857;display:block;font-size:28px;margin-top:5px}
    .details{border:1px solid #dbe3ee;border-radius:10px;overflow:hidden}.detail{display:grid;grid-template-columns:180px 1fr;gap:14px;padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px}
    .detail:last-child{border-bottom:0}.detail span{color:#64748b}.detail strong{font-weight:700;overflow-wrap:anywhere}.notes{white-space:pre-wrap}
    .footer{border-top:1px solid #dbe3ee;color:#64748b;font-size:10px;margin-top:20px;padding-top:10px;text-align:center}
    @media(max-width:520px){.document-head{display:block}.number{text-align:left;margin-top:12px}.detail{grid-template-columns:1fr;gap:3px}}
  </style></head><body><main class="receipt">${renderLedgerBusinessHeader(header)}
    <section class="document-head"><div><div class="module">Weaving</div><h1>${title}</h1></div><div class="number">Receipt / Transaction No.<strong>${escapeHtml(transaction.transactionNo)}</strong></div></section>
    <section class="amount"><span>Amount</span><strong>PKR ${formatMoney(transaction.amount)}</strong></section>
    <section class="details">
      ${detailRow("Date", `${formatDate(transaction.date)}${createdTime ? ` ${createdTime}` : ""}`)}
      ${detailRow(partyLabel, transaction.partyId?.name || "-")}
      ${detailRow("Payment Method", transaction.paymentMethod ? String(transaction.paymentMethod).toUpperCase() : "-")}
      ${detailRow("Payment Account", [transaction.paymentAccountId?.name, transaction.paymentAccountId?.code].filter(Boolean).join(" - ") || "-")}
      ${detailRow("Linked Invoice / Bill", linkedReference)}
      ${chequeDetails}
      ${transaction.description ? `<div class="detail"><span>Description / Remarks</span><strong class="notes">${escapeHtml(transaction.description)}</strong></div>` : ""}
    </section><div class="footer">Generated from the saved Weaving payment transaction.</div>
  </main>${autoPrint ? '<script>window.addEventListener("load",()=>window.print())</script>' : ""}</body></html>`;
};

const loadPayment = async (userId, id) => {
  const transaction = await WeavingMoneyTransaction.findOne({
    _id: id,
    userId,
  })
    .populate("partyId", "name phone")
    .populate("paymentAccountId", "name code category")
    .populate("purchaseInvoiceId", "purchaseNo status")
    .populate("salesInvoiceId", "invoiceNo status")
    .populate("sizingBillId", "billNo status")
    .lean();

  if (!transaction) {
    const error = new Error("Payment transaction not found");
    error.statusCode = 404;
    throw error;
  }

  if (transaction.status !== "posted") {
    const error = new Error("A receipt is not available for a voided payment transaction");
    error.statusCode = 409;
    throw error;
  }

  return transaction;
};

const paymentReceiptOutput = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const format = req.params.format === "pdf" ? "pdf" : "print";
    const transaction = await loadPayment(userId, req.params.id);
    const header = await getLedgerPrintHeader(userId, "weaving", format);
    const html = renderPaymentReceipt({
      transaction,
      header,
      autoPrint: format === "print",
    });

    if (format === "pdf") {
      const pdf = await generatePdfFromHtml(html, {
        waitForImages: Boolean(header?.logoUrl),
      });

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=Weaving-Payment-${safeFilePart(transaction.transactionNo)}.pdf`,
        "Content-Length": pdf.length,
      });

      return res.send(pdf);
    }

    return res.type("html").send(html);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to prepare payment receipt",
    });
  }
};

module.exports = {
  paymentReceiptOutput,
  _test: { escapeHtml, renderPaymentReceipt },
};
