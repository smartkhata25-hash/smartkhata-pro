const { generatePdfFromHtml } = require("../services/pdfService");
const { getLedgerPrintHeader } = require("../services/ledgerPrintHeaderService");
const commercial = require("../services/weaving/weavingCommercialService");
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

const money = (value) =>
  Number(value || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 });

const renderDocument = ({ ledger, header, autoPrint = false }) => {
  const rows = ledger.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(new Date(row.date).toLocaleDateString("en-GB", {
          timeZone: "Asia/Karachi",
        }))}</td><td>${escapeHtml(row.reference || "-")}</td><td>${escapeHtml(
          row.type || "-",
        )}</td><td>${escapeHtml(row.description || "")}</td><td>${money(
          row.debit,
        )}</td><td>${money(row.credit)}</td><td>${money(
          row.runningBalance,
        )}</td></tr>`,
    )
    .join("");
  const summary = [
    ["Opening", ledger.summary.opening],
    ["Debit", ledger.summary.debit],
    ["Credit", ledger.summary.credit],
    ["Closing", ledger.summary.closing],
  ]
    .map(([label, value]) => `<div>${label}<b>Rs. ${money(value)}</b></div>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>${ledgerBusinessHeaderStyles}
    @page{size:A4 landscape;margin:12mm}body{font-family:Arial;color:#172033}
    h1{margin:0;color:#0f766e}.meta{color:#64748b;margin:5px 0 18px}
    .summary{display:flex;gap:12px;margin:14px 0}.summary div{flex:1;border:1px solid #cbd5e1;padding:10px}
    .summary b{display:block;margin-top:5px}table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#ccfbf1}
    td:nth-last-child(-n+3){text-align:right}</style></head><body>
    ${renderLedgerBusinessHeader(header)}
    <div class="meta"><b>Party: ${escapeHtml(ledger.party.name)}</b>${
      ledger.party.phone ? ` | ${escapeHtml(ledger.party.phone)}` : ""
    }<br>From: ${escapeHtml(ledger.period.from || "All")} | To: ${escapeHtml(
      ledger.period.to || "All",
    )}</div><div class="summary">${summary}</div><table><thead><tr><th>Date</th>
    <th>Voucher / Ref</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th>
    <th>Running Balance</th></tr></thead><tbody>${
      rows || '<tr><td colspan="7">No ledger entries</td></tr>'
    }</tbody></table>${
      autoPrint
        ? '<script>window.addEventListener("load",()=>window.print())</script>'
        : ""
    }</body></html>`;
};

const partyLedgerOutput = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const ledger = await commercial.getPartyLedger(userId, req.params.id, {
      from: String(req.query.from || "").trim(),
      to: String(req.query.to || "").trim(),
    });
    const header = await getLedgerPrintHeader(userId, "weaving");
    const html = renderDocument({
      ledger,
      header,
      autoPrint: req.params.format === "print",
    });

    if (req.params.format === "pdf") {
      const pdf = await generatePdfFromHtml(html);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=Weaving-Party-Ledger-${ledger.party._id}.pdf`,
        "Content-Length": pdf.length,
      });
      return res.send(pdf);
    }

    return res.type("html").send(html);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to prepare ledger output",
    });
  }
};

module.exports = { partyLedgerOutput, _test: { renderDocument } };
