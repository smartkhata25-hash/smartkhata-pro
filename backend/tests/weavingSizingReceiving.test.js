const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { calculateYarnPacking } = require("../services/weaving/weavingPacking");

const service = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSizingService.js"), "utf8");
const page = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/weaving/WeavingSizingPage.js"), "utf8");

assert.match(service, /resolveReceiptIssue/);
assert.match(service, /sort\(\{ date: 1, createdAt: 1, _id: 1 \}\)/);
assert.match(service, /existingIssueId \|\| requestedIssueId/);
assert.match(service, /Weight deductions cannot exceed Gross KG/);
assert.match(service, /createReceiptBundle = async[\s\S]*issueId: receipt\.issueId/);
assert.match(service, /createReceiptBundle: costing\.withCostingInvalidation\(atomicSave\(createReceiptBundle\)/);
assert.match(service, /updateReceiptBundle[\s\S]*atomicSave\(updateReceiptBundle\)/);

assert.doesNotMatch(page, /label="Issue \/ Job"/);
assert.doesNotMatch(page, /label=\{t\('weaving\.production\.contract'\)\}/);
assert.match(page, /label="Sizing"/);
assert.match(page, /sameReturnChallan/);
assert.match(page, /gstPercent: e\.target\.checked \? Number\(bill\.gstPercent \|\| 18\) : 0/);
assert.match(page, /readOnly=\{tab === 'receiving' && sameReturnChallan\}/);
assert.match(page, /billableWeightKg: row\.billableWeightKg \|\| calculatedNetKg/);
assert.match(page, /Number\(bill\.paidNow \|\| 0\) > 0/);
assert.match(page, /bill\.paymentMethod === 'cheque'/);
assert.match(page, /createSizingReturn\(yarnReturn\)/);
assert.match(page, /createSizingBill\(bill\)/);
assert.match(page, /\['issue', 'receiving', 'return', 'bill'/);
assert.match(page, /const eligibleReceivingIssues = \(sizingPartyId\)/);
assert.match(page, /if \(candidates\.length === 1\) selectReceivingIssue\(candidates\[0\]\._id\)/);
assert.doesNotMatch(page, /const selected = candidates\[0\]/);
assert.match(page, /receivingIssueOptions\.length > 1/);
assert.match(page, /label="Yarn \/ Issue"/);
assert.match(page, /join\(' — '\)/);
assert.match(page, /No open Yarn Issue found for this Sizing\./);
assert.match(page, /setReceipt\(\(current\) => \(\{[\s\S]*issueId: selected\?\._id \|\| ''/);
assert.match(page, /editing\?\.type === 'receipt'[\s\S]*receivingIssueOptions\.push\(linkedReceivingIssue\)/);
assert.match(page, /Select a Yarn Issue for this Receiving\./);

const returned = calculateYarnPacking({ packageType: "bag", packageQty: 2, smallCones: 4, largeCones: 2 }, {
  defaultPackageType: "bag", packageWeight: 100, smallConesPerPackage: 40, largeConesPerPackage: 24,
});
assert.strictEqual(returned.quantityLbs, 218.333333);
assert.strictEqual(returned.quantityKg, 99.034334);

console.log("weavingSizingReceiving tests passed");
