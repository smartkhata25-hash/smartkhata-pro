const assert = require("assert");
const { _test } = require("../services/weaving/weavingCommercialService");

const accountId = "party-account";
const entry = ({ id, date = "2026-01-01", amount, side = "debit", sourceType = "opening_balance", originModule = "weaving.party.opening", referenceId = "document-1", ...flags }) => ({
  _id: id,
  date: new Date(`${date}T00:00:00.000Z`),
  sourceType,
  originModule,
  referenceId,
  lines: [{ account: accountId, type: side, amount }, { account: "other", type: side === "debit" ? "credit" : "debit", amount }],
  ...flags,
});
const reversal = (id, original, date = "2026-01-02") => entry({ id, date, amount: original.lines[0].amount, side: original.lines[0].type === "debit" ? "credit" : "debit", sourceType: "reversal", originModule: "weaving.reversal", referenceId: original.referenceId, isReversal: true, reversalOf: original._id });
const project = (journals, fromDate = null, toDate = null) => _test.calculateEffectivePartyLedger({ journals, accountId, fromDate: fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : null, toDate: toDate ? new Date(`${toDate}T23:59:59.999Z`) : null });

for (const partyType of ["customer", "supplier", "both", "sizing"]) {
  const oldOpening = entry({ id: `${partyType}-old`, amount: 10000, referenceId: `${partyType}-party` });
  const newOpening = entry({ id: `${partyType}-new`, date: "2026-01-03", amount: 5000, referenceId: `${partyType}-party` });
  const result = project([oldOpening, reversal(`${partyType}-reversal`, oldOpening), newOpening]);
  assert.strictEqual(result.periodJournals.length, 1, `${partyType} should have one effective opening`);
  assert.strictEqual(result.periodJournals[0].journal._id, `${partyType}-new`);
  assert.strictEqual(result.periodJournals[0].debit, 5000);
}

const replacementCases = [
  ["purchase", "purchase_invoice", "weaving.purchase", "purchase-1"],
  ["sale", "sale_invoice", "weaving.sales", "sale-1"],
  ["receive", "receive_payment", "weaving.receive_payment", "receive-1"],
  ["pay", "pay_bill", "weaving.pay_bill", "pay-1"],
  ["sizing", "purchase_invoice", "weaving.sizing.bill", "sizing-1"],
];

for (const [label, sourceType, originModule, referenceId] of replacementCases) {
  const old = entry({ id: `${label}-old`, amount: 10000, sourceType, originModule, referenceId });
  const current = entry({ id: `${label}-current`, date: "2026-01-03", amount: 5000, sourceType, originModule, referenceId });
  const result = project([old, reversal(`${label}-reversal`, old), current]);
  assert.deepStrictEqual(result.periodJournals.map((row) => row.journal._id), [`${label}-current`]);
  assert.strictEqual(result.periodJournals[0].debit, 5000);
}

const voided = entry({ id: "void-old", amount: 7000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "void-sale" });
assert.strictEqual(project([voided, reversal("void-reversal", voided)]).periodJournals.length, 0);

const firstSale = entry({ id: "sale-a", amount: 10000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "invoice-a" });
const secondSale = entry({ id: "sale-b", amount: 10000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "invoice-b" });
assert.strictEqual(project([firstSale, secondSale]).periodJournals.length, 2);

const sale = entry({ id: "sale-current", amount: 10000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "invoice-current" });
const receipt = entry({ id: "receipt-current", amount: 4000, side: "credit", sourceType: "receive_payment", originModule: "weaving.receive_payment", referenceId: "receipt-current" });
const saleAndReceipt = project([sale, receipt]);
assert.strictEqual(saleAndReceipt.periodJournals.length, 2);
assert.strictEqual(saleAndReceipt.periodJournals.reduce((balance, row) => balance + row.debit - row.credit, 0), 6000);

const before = entry({ id: "before", date: "2026-01-01", amount: 3000, sourceType: "purchase_invoice", originModule: "weaving.purchase", referenceId: "before" });
const beforeReversal = reversal("before-reversal", before, "2026-01-05");
const beforeReplacement = entry({ id: "before-current", date: "2026-01-02", amount: 2000, sourceType: "purchase_invoice", originModule: "weaving.purchase", referenceId: "before" });
const inPeriod = entry({ id: "period-sale", date: "2026-01-10", amount: 5000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "period-sale" });
const filtered = project([before, beforeReversal, beforeReplacement, inPeriod], "2026-01-08", "2026-01-31");
assert.strictEqual(filtered.opening, 2000);
assert.strictEqual(filtered.periodJournals.length, 1);
assert.strictEqual(filtered.opening + filtered.periodJournals[0].debit - filtered.periodJournals[0].credit, 7000);

const sourceJournal = entry({ id: "source-current", amount: 5000, sourceType: "sale_invoice", originModule: "weaving.sales", referenceId: "sale-document" });
const clickable = _test.buildLedgerSource({ journal: sourceJournal, effectiveJournal: sourceJournal, sale: { _id: "sale-document", invoiceNo: "WS-00042", status: "posted" } });
assert.strictEqual(clickable.id, "sale-document");
assert.strictEqual(clickable.reference, "WS-00042");
assert.strictEqual(/^[a-f\d]{24}$/i.test(clickable.reference), false);

console.log("weaving effective party ledger tests passed");
