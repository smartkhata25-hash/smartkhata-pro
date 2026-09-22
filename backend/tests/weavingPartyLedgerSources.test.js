const assert = require("assert");
const { _test } = require("../services/weaving/weavingCommercialService");

const journal = (originModule, sourceType, referenceId = "source-1") => ({
  _id: "journal-1",
  originModule,
  sourceType,
  referenceId,
  isReversal: false,
});
const source = (current, records = {}, row = current) =>
  _test.buildLedgerSource({ journal: row, effectiveJournal: current, ...records });

assert.deepStrictEqual(source(journal("weaving.party.opening", "opening_balance", "party-1")), {
  kind: "opening", id: "party-1", journalId: "journal-1", subtype: null, reference: "", status: "posted", isReversal: false,
});

const purchase = source(journal("weaving.purchase", "purchase_invoice", "purchase-1"), {
  purchase: { _id: "purchase-1", purchaseNo: "WP-00001", purchaseType: "yarn", status: "posted" },
});
assert.strictEqual(purchase.kind, "purchase");
assert.strictEqual(purchase.id, "purchase-1");
assert.strictEqual(purchase.purchaseType, "yarn");
assert.strictEqual(purchase.reference, "WP-00001");

for (const [origin, type] of [["weaving.pay_bill", "pay"], ["weaving.receive_payment", "receive"]]) {
  const payment = source(journal(origin, `${type}_bill`, "transaction-1"), {
    transaction: { _id: "transaction-1", transactionNo: type === "receive" ? "RCV-00001" : "PAY-00001", type, status: "posted" },
  });
  assert.strictEqual(payment.kind, "payment");
  assert.strictEqual(payment.id, "transaction-1");
  assert.strictEqual(payment.subtype, type);
  assert.ok(/^(RCV|PAY)-\d+$/.test(payment.reference));
}

for (const [origin, type] of [["weaving.pay_bill", "pay"], ["weaving.receive_payment", "receive"]]) {
  const paidNow = source(journal(origin, type === "pay" ? "pay_bill" : "receive_payment", "invoice-id"), {
    transaction: { _id: `${type}-transaction`, type, status: "posted", journalEntryId: "journal-1" },
  });
  assert.strictEqual(paidNow.id, `${type}-transaction`);
}

assert.strictEqual(source(journal("weaving.sales", "sale_invoice", "sale-1"), { sale: { _id: "sale-1", status: "void" } }).kind, "sale_invoice");
assert.strictEqual(source(journal("weaving.sizing.bill", "sizing_bill", "bill-1"), { sizingBill: { _id: "bill-1", status: "posted" } }).kind, "sizing_bill");

const original = journal("weaving.purchase", "purchase_invoice", "purchase-1");
const reversal = { _id: "reversal-1", sourceType: "reversal", originModule: "weaving.reversal", isReversal: true, reversalOf: "journal-1" };
const reversedSource = source(original, { purchase: { _id: "purchase-1", purchaseType: "fabric", status: "void" } }, reversal);
assert.strictEqual(reversedSource.kind, "purchase");
assert.strictEqual(reversedSource.journalId, "reversal-1");
assert.strictEqual(reversedSource.isReversal, true);

assert.strictEqual(source(journal("weaving.adjustment", "manual")).kind, "journal");
assert.strictEqual(source(journal("weaving.pay_bill", "pay_bill", "missing-transaction")).kind, "journal");

const unchanged = {
  currentAmount: 500,
  currentType: "receivable",
  currentJournalId: "journal-1",
  currentDate: "2026-01-15",
  nextAmount: 500,
  nextType: "receivable",
  nextDate: "2026-01-15",
  journalExists: true,
};
assert.strictEqual(_test.openingBalanceIsUnchanged(unchanged), true);
assert.strictEqual(_test.openingBalanceIsUnchanged({ ...unchanged, nextDate: "2026-01-16" }), false);
assert.strictEqual(_test.openingBalanceIsUnchanged({ ...unchanged, nextAmount: 600 }), false);
assert.strictEqual(_test.openingBalanceIsUnchanged({ ...unchanged, nextType: "payable" }), false);

console.log("weaving party ledger source tests passed");
