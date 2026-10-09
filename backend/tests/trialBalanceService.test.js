const assert = require('assert');
const mongoose = require('mongoose');
const { buildTrialBalanceRows } = require('../services/trialBalanceService');

const legacyAccountId = new mongoose.Types.ObjectId();
const travelAccountId = new mongoose.Types.ObjectId();
const normalDebitId = new mongoose.Types.ObjectId();
const normalCreditId = new mongoose.Types.ObjectId();

const legacyResult = buildTrialBalanceRows([
  { _id: legacyAccountId, totalDebit: 1000, totalCredit: 0 },
  { _id: travelAccountId, totalDebit: 0, totalCredit: 1000 },
], [
  { _id: legacyAccountId, name: 'Legacy Customer', moduleScope: 'trading' },
  { _id: travelAccountId, name: 'Travel Sales', moduleScope: 'travel' },
]);

assert.deepStrictEqual(
  legacyResult.trialBalance.map(({ accountName, debit, credit }) => ({ accountName, debit, credit })),
  [
    { accountName: 'Legacy Customer', debit: 1000, credit: 0 },
    { accountName: 'Travel Sales', debit: 0, credit: 1000 },
  ],
);
assert.deepStrictEqual(
  { debit: legacyResult.totalDebit, credit: legacyResult.totalCredit, balanced: legacyResult.isBalanced },
  { debit: 1000, credit: 1000, balanced: true },
);

const normalResult = buildTrialBalanceRows([
  { _id: normalDebitId, totalDebit: 250, totalCredit: 0 },
  { _id: normalCreditId, totalDebit: 0, totalCredit: 250 },
], [
  { _id: normalDebitId, name: 'Travel Cash', moduleScope: 'travel' },
  { _id: normalCreditId, name: 'Travel Income', moduleScope: 'travel' },
]);
assert.strictEqual(normalResult.isBalanced, true, 'normal Travel data remains unchanged');
assert.deepStrictEqual([normalResult.totalDebit, normalResult.totalCredit], [250, 250]);

const unbalancedResult = buildTrialBalanceRows([
  { _id: normalDebitId, totalDebit: 1000, totalCredit: 0 },
  { _id: normalCreditId, totalDebit: 0, totalCredit: 900 },
], [
  { _id: normalDebitId, name: 'Debit Account' },
  { _id: normalCreditId, name: 'Credit Account' },
]);
assert.strictEqual(unbalancedResult.isBalanced, false, 'a real difference is never forced to zero');
assert.deepStrictEqual([unbalancedResult.totalDebit, unbalancedResult.totalCredit], [1000, 900]);

console.log('Trial Balance row construction tests passed');
