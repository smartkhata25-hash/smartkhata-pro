const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

const Counter = require("../models/Counter");
const Product = require("../models/Product");
const Quotation = require("../models/Quotation");
const quotationController = require("../controllers/quotationController");
const { buildQuotationPrint } = require("../services/printBuilder");

const userId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
const quotationId = new mongoose.Types.ObjectId();

const validBody = () => ({
  quotationDate: "2026-09-22",
  quotationTime: "10:30",
  customerName: "Test Customer",
  customerPhone: "03001234567",
  items: [{ productId: String(productId), quantity: 2, price: 150 }],
  discountAmount: 20,
  by: "Sales Desk",
  lang: "en",
});

const mockProductLookup = () => {
  Product.find = () => ({
    lean: async () => [
      {
        _id: productId,
        name: "Cotton Yarn",
        description: "20/1",
        unit: "Bag",
      },
    ],
  });
};

const responseMock = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test("quotation schema contains no payment, stock, journal, or invoice-posting fields", () => {
  const fields = Object.keys(Quotation.schema.paths);
  ["paidAmount", "paymentType", "accountId", "journalEntryId", "stockPosted", "invoiceId"].forEach(
    (field) => assert.equal(fields.includes(field), false),
  );
});

test("quotation controller is isolated from invoice, journal, payment, and inventory models", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/quotationController.js"),
    "utf8",
  );

  ["Invoice", "JournalEntry", "InventoryTransaction", "Payment"].forEach((modelName) => {
    assert.doesNotMatch(source, new RegExp(`models/${modelName}`));
  });
});

test("quotation payload snapshots products and calculates non-financial totals", async (t) => {
  const originalFind = Product.find;
  t.after(() => {
    Product.find = originalFind;
  });
  mockProductLookup();

  const payload = await quotationController._test.normalizePayload(validBody(), userId);

  assert.equal(payload.items[0].name, "Cotton Yarn");
  assert.equal(payload.subTotal, 300);
  assert.equal(payload.discountAmount, 20);
  assert.equal(payload.grandTotal, 280);
  assert.equal(Object.hasOwn(payload, "paidAmount"), false);
});

test("create uses the separate quotation counter and produces Q-prefixed numbering", async (t) => {
  const originals = {
    productFind: Product.find,
    counterUpdate: Counter.findOneAndUpdate,
    quotationCreate: Quotation.create,
    startSession: mongoose.startSession,
  };
  t.after(() => {
    Product.find = originals.productFind;
    Counter.findOneAndUpdate = originals.counterUpdate;
    Quotation.create = originals.quotationCreate;
    mongoose.startSession = originals.startSession;
  });

  mockProductLookup();
  let counterQuery;
  let createdPayload;
  Counter.findOneAndUpdate = async (query) => {
    counterQuery = query;
    return { seq: 1001 };
  };
  Quotation.create = async ([payload]) => {
    createdPayload = payload;
    return [{ _id: quotationId, ...payload }];
  };
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });

  const req = { user: { id: userId }, body: validBody() };
  const res = responseMock();
  await quotationController.createQuotation(req, res);

  assert.equal(counterQuery.type, "quotation");
  assert.equal(createdPayload.quotationNo, "Q-1001");
  assert.equal(res.statusCode, 201);
});

test("update keeps the same quotation identity and is scoped to its owner", async (t) => {
  const originalFind = Product.find;
  const originalUpdate = Quotation.findOneAndUpdate;
  t.after(() => {
    Product.find = originalFind;
    Quotation.findOneAndUpdate = originalUpdate;
  });
  mockProductLookup();

  let updateQuery;
  let updateDocument;
  Quotation.findOneAndUpdate = async (query, document) => {
    updateQuery = query;
    updateDocument = document;
    return { _id: quotationId, quotationNo: "Q-1001", ...document.$set };
  };

  const req = {
    user: { id: userId },
    params: { id: String(quotationId) },
    body: { ...validBody(), discountAmount: 30 },
  };
  const res = responseMock();
  await quotationController.updateQuotation(req, res);

  assert.equal(String(updateQuery._id), String(quotationId));
  assert.equal(String(updateQuery.createdBy), String(userId));
  assert.equal(Object.hasOwn(updateDocument.$set, "quotationNo"), false);
  assert.equal(res.body._id, quotationId);
});

test("delete is a hard delete restricted to the quotation owner", async (t) => {
  const originalDelete = Quotation.findOneAndDelete;
  t.after(() => {
    Quotation.findOneAndDelete = originalDelete;
  });

  let deleteQuery;
  Quotation.findOneAndDelete = async (query) => {
    deleteQuery = query;
    return { _id: quotationId };
  };

  const req = { user: { id: userId }, params: { id: String(quotationId) } };
  const res = responseMock();
  await quotationController.deleteQuotation(req, res);

  assert.equal(String(deleteQuery._id), String(quotationId));
  assert.equal(String(deleteQuery.createdBy), String(userId));
  assert.equal(String(res.body.id), String(quotationId));
});

test("a different user cannot load another user's quotation", async (t) => {
  const originalFindOne = Quotation.findOne;
  t.after(() => {
    Quotation.findOne = originalFindOne;
  });

  let lookupQuery;
  Quotation.findOne = (query) => ({
    lean: async () => {
      lookupQuery = query;
      return null;
    },
  });

  const otherUserId = new mongoose.Types.ObjectId();
  const req = { user: { id: otherUserId }, params: { id: String(quotationId) } };
  const res = responseMock();
  await quotationController.getQuotationById(req, res);

  assert.equal(String(lookupQuery.createdBy), String(otherUserId));
  assert.equal(res.statusCode, 404);
});

test("a different user cannot update or delete another user's quotation", async (t) => {
  const originals = {
    productFind: Product.find,
    quotationUpdate: Quotation.findOneAndUpdate,
    quotationDelete: Quotation.findOneAndDelete,
  };
  t.after(() => {
    Product.find = originals.productFind;
    Quotation.findOneAndUpdate = originals.quotationUpdate;
    Quotation.findOneAndDelete = originals.quotationDelete;
  });
  mockProductLookup();

  const otherUserId = new mongoose.Types.ObjectId();
  let updateQuery;
  let deleteQuery;
  Quotation.findOneAndUpdate = async (query) => {
    updateQuery = query;
    return null;
  };
  Quotation.findOneAndDelete = async (query) => {
    deleteQuery = query;
    return null;
  };

  const updateRes = responseMock();
  await quotationController.updateQuotation(
    {
      user: { id: otherUserId },
      params: { id: String(quotationId) },
      body: validBody(),
    },
    updateRes,
  );
  const deleteRes = responseMock();
  await quotationController.deleteQuotation(
    { user: { id: otherUserId }, params: { id: String(quotationId) } },
    deleteRes,
  );

  assert.equal(String(updateQuery.createdBy), String(otherUserId));
  assert.equal(String(deleteQuery.createdBy), String(otherUserId));
  assert.equal(updateRes.statusCode, 404);
  assert.equal(deleteRes.statusCode, 404);
});

test("quotation print reuses sales layout without financial settlement fields", () => {
  const printSetting = {
    sales: {
      settings: {
        showHeader: true,
        showFooter: true,
        showDescription: true,
        showUOM: true,
        showNetTotal: true,
        showCustomerTotalBalance: true,
        showBy: true,
        showStatus: true,
        showPaid: true,
        showBalance: true,
        showPaymentType: true,
        showStamp: false,
      },
      header: {},
      layout: {},
    },
  };
  const built = buildQuotationPrint(
    {
      quotationNo: "Q-1001",
      quotationDate: new Date("2026-09-22"),
      customerName: "Test Customer",
      items: [{ name: "Cotton Yarn", quantity: 2, price: 150, total: 300 }],
      subTotal: 300,
      discountAmount: 20,
      grandTotal: 280,
    },
    printSetting,
  );

  assert.equal(built.documentTitle, "Quotation");
  assert.equal(built.documentInfo.billNo, "Q-1001");
  assert.equal(built.documentInfo.type, null);
  assert.equal(built.totals.paidAmount, null);
  assert.equal(built.totals.balance, null);
  assert.equal(built.paymentInfo, null);
  assert.equal(built.page.isQuotation, true);
});
