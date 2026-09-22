const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { _test } = require("../services/weaving/weavingSalesService");

const settlement = _test.calculateSettlement({ grossMeter: 6000, oilKamiMeter: 100, shortageMeter: 200, rejectionMeter: 200, otherMeterDeduction: 46 });
assert.strictEqual(settlement.netMeter, 5900);
assert.strictEqual(settlement.billableMeter, 5454);
assert.strictEqual(_test.calculateSettlement({ grossMeter: 1000, oilKamiMeter: 100 }).billableMeter, 900);
assert.strictEqual(_test.calculateSettlement({ grossMeter: 1000, shortageMeter: 100 }).billableMeter, 900);
assert.strictEqual(_test.calculateSettlement({ grossMeter: 1000, rejectionMeter: 100 }).billableMeter, 900);
assert.throws(() => _test.calculateSettlement({ grossMeter: 100, oilKamiMeter: 50, shortageMeter: 51 }), /cannot exceed/);

const conversion = _test.calculateInvoiceTotals({ quantity: 5454, rate: 35 });
assert.strictEqual(conversion.subtotal, 190890);
assert.strictEqual(conversion.grandTotal, 190890);
const moneyDeduction = _test.calculateInvoiceTotals({ quantity: 1000, rate: 20, discountAmount: 500 });
assert.strictEqual(moneyDeduction.subtotal, 20000);
assert.strictEqual(moneyDeduction.grandTotal, 19500);
assert.strictEqual(_test.dueDateFromCreditDays("2026-09-19", 30), "2026-10-19");

assert.deepStrictEqual(_test.validateReceiptClassification({ receivedMeter: 600, receivedKg: 120, pieceCount: 10, normalMeter: 300, normalKg: 60, normalPieces: 4, rejectedMeter: 200, rejectedKg: 40, rejectedPieces: 3, cutPieceMeter: 50, cutPieceKg: 10, cutPiecePieces: 2, wasteMeter: 50, wasteKg: 10, wastePieces: 1 }), { receivedMeter: 600, receivedKg: 120, pieceCount: 10, normalMeter: 300, rejectedMeter: 200, cutPieceMeter: 50, wasteMeter: 50, normalKg: 60, rejectedKg: 40, cutPieceKg: 10, wasteKg: 10, normalPieces: 4, rejectedPieces: 3, cutPiecePieces: 2, wastePieces: 1 });
assert.throws(() => _test.validateReceiptClassification({ receivedMeter: 600, normalMeter: 599 }), /must equal/);
assert.throws(() => _test.validateReceiptClassification({ receivedMeter: 10, normalMeter: 10, receivedKg: 5, normalKg: 4 }), /Category KG/);
assert.strictEqual(_test.stockCategory({ saleNature: "fabric" }), "normal");
assert.strictEqual(_test.stockCategory({ saleNature: "fabric", fabricCategory: "b" }), "b");
assert.strictEqual(_test.stockCategory({ saleNature: "other", otherSubtype: "rejected" }), "rejected");
assert.strictEqual(_test.stockCategory({ saleNature: "other", otherSubtype: "cut_piece" }), "cut_piece");
assert.strictEqual(_test.stockCategory({ saleNature: "other", otherSubtype: "waste" }), "waste");

assert.deepStrictEqual(
  _test.buildManagementMetrics({
    readyCount: 3,
    pending: [{ pendingMeter: 12.5 }, { pendingMeter: 7.25 }],
    invoices: [
      { status: "posted", grandTotal: 1000 },
      { status: "draft", grandTotal: 5000 },
    ],
    receipts: [
      { status: "posted", receivedMeter: 4 },
      { status: "reversed", receivedMeter: 9 },
    ],
  }),
  {
    readyCount: 3,
    pendingRejectionMeter: 19.75,
    salesAmount: 1000,
    recoveredRejectionMeter: 4,
  },
);

const serviceSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8");
assert.match(serviceSource, /weaving_sales_invoice/);
assert.match(serviceSource, /weaving_pakki/);
assert.match(serviceSource, /saleSource === "direct"/);
assert.match(serviceSource, /saleNature === "conversion"/);
assert.match(serviceSource, /ownershipType: "own"/);
assert.match(serviceSource, /pendingMeter: \{ \$gte: values\.receivedMeter \}/);
assert.match(serviceSource, /movementType: "rejection_recovery"/);
assert.match(serviceSource, /"sale_out", "kacchi_out", "quality_transfer_out"/);
const createKacchiSource = serviceSource.slice(serviceSource.indexOf("const createKacchi"), serviceSource.indexOf("const updateKacchi"));
const createPakkiSource = serviceSource.slice(serviceSource.indexOf("const createPakki"), serviceSource.indexOf("const draftFromPakki"));
const voidPakkiSource = serviceSource.slice(serviceSource.indexOf("const voidPakki"), serviceSource.indexOf("const draftFromPakki"));
assert.match(createKacchiSource, /movementType: "kacchi_out"/);
assert.match(createKacchiSource, /thanCount: line\.thanCount/);
assert.match(createKacchiSource, /weightKg: line\.weightKg/);
assert.doesNotMatch(createPakkiSource, /movementType: "kacchi_out"/);
assert.doesNotMatch(voidPakkiSource, /movementType: "kacchi_out"|WeavingFabricMovement|stockMovementId/);
assert.match(voidPakkiSource, /Rejection receipts exist/);
assert.match(voidPakkiSource, /Correct or reverse the linked Sales Invoice/);
assert.doesNotMatch(serviceSource, /EmployeePayroll|WeavingAttendance|createFolding/);

const yarnModel = fs.readFileSync(path.join(__dirname, "../models/WeavingYarnMovement.js"), "utf8");
assert.match(yarnModel, /"sale_out"/);
assert.match(yarnModel, /ownershipType/);
console.log("weaving sales and rejection tests passed");
