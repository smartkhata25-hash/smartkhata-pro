const assert = require("assert");
const fs = require("fs");
const path = require("path");

const Counter = require("../models/Counter");
const WeavingMoneyTransaction = require("../models/WeavingMoneyTransaction");
const WeavingPurchaseInvoice = require("../models/WeavingPurchaseInvoice");
const commercial = require("../services/weaving/weavingCommercialService");

const { allocateReferenceBlock, recoverPurchaseRetry, referenceSequence } = commercial._test;

assert.equal(referenceSequence("PAY-00005", "PAY"), 5);
assert.equal(referenceSequence("RCV-00005", "PAY"), 0);
assert.ok(
  WeavingMoneyTransaction.schema.indexes().some(([fields, options]) =>
    fields.userId === 1 && fields.transactionNo === 1 && options.unique === true),
  "money transaction number must remain unique per user",
);

const originalCounterUpdate = Counter.findOneAndUpdate;
const originalPurchaseFindOne = WeavingPurchaseInvoice.findOne;
const counters = new Map();

Counter.findOneAndUpdate = async (filter, pipeline) => {
  await Promise.resolve();
  const key = `${filter.userId}:${filter.type}`;
  const current = counters.get(key) || 0;
  const addExpression = pipeline[0].$set.seq.$add;
  const highWater = addExpression[0].$max[1];
  const count = addExpression[1];
  const seq = Math.max(current, highWater) + count;
  counters.set(key, seq);
  return { seq };
};

const model = (name, field, values) => ({
  collection: { name },
  find(query) {
    const regex = new RegExp(query[field].$regex);
    return {
      lean: async () => values.filter((value) => regex.test(value)).map((value) => ({ [field]: value })),
    };
  },
});

(async () => {
  try {
    const moneyModel = model(
      "weavingmoneytransactions",
      "transactionNo",
      ["PAY-00005", "RCV-00009", "MANUAL-99"],
    );

    const [firstPay, secondPay] = await Promise.all([
      allocateReferenceBlock(moneyModel, "user-1", "transactionNo", "PAY"),
      allocateReferenceBlock(moneyModel, "user-1", "transactionNo", "PAY"),
    ]);
    assert.deepEqual(
      [firstPay[0], secondPay[0]].sort(),
      ["PAY-00006", "PAY-00007"],
      "concurrent PAY allocations must not duplicate or follow the latest RCV sequence",
    );

    const receive = await allocateReferenceBlock(moneyModel, "user-1", "transactionNo", "RCV");
    assert.deepEqual(receive, ["RCV-00010"], "RCV must have an independent prefix-scoped counter");

    const sizingModel = model("weavingsizingissues", "issueNo", ["SI-00008"]);
    assert.deepEqual(
      await allocateReferenceBlock(sizingModel, "user-1", "issueNo", "SI", 3),
      ["SI-00009", "SI-00010", "SI-00011"],
      "multi-issue purchases must reserve the whole sequence block",
    );
    assert.deepEqual(
      await allocateReferenceBlock(sizingModel, "user-1", "issueNo", "SI"),
      ["SI-00012"],
      "the next allocation must not reuse a number from a reserved block",
    );

    const existingPurchase = { _id: "purchase-1", requestKey: "same-request" };
    WeavingPurchaseInvoice.findOne = async (query) => {
      assert.deepEqual(query, { userId: "user-1", requestKey: "same-request" });
      return existingPurchase;
    };
    assert.equal(
      await recoverPurchaseRetry(
        { code: 11000, keyValue: { requestKey: "same-request" } },
        "user-1",
        "same-request",
      ),
      existingPurchase,
      "a concurrent retry must return the purchase already saved for the same request key",
    );

    const source = fs.readFileSync(
      path.join(__dirname, "../services/weaving/weavingCommercialService.js"),
      "utf8",
    );
    assert.match(source, /const createFabricPurchase[\s\S]*reserveNextNo\(WeavingMoneyTransaction[\s\S]*purchase:\$\{requestKey\}:payment/);
    assert.match(source, /const createPurchase[\s\S]*reserveNextNo\(WeavingMoneyTransaction[\s\S]*purchase:\$\{requestKey\}:payment/);

    console.log("weaving Paid Now numbering regression tests passed");
  } finally {
    Counter.findOneAndUpdate = originalCounterUpdate;
    WeavingPurchaseInvoice.findOne = originalPurchaseFindOne;
  }
})().catch((failure) => {
  console.error(failure);
  process.exitCode = 1;
});
