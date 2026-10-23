const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const uri = process.env.INSTALLMENTS_TEST_MONGO_URI || '';
const safeUri = /(?:^|[\/_-])(test|testing)(?:[?&\/_-]|$)/i.test(uri) && /replicaSet=/i.test(uri);

test('isolated replica-set payment posting, retry and reversal', { skip: !safeUri }, async () => {
  const Account = require('../models/Account');
  const Member = require('../models/InstallmentsMember');
  const PaymentTransaction = require('../models/InstallmentsPaymentTransaction');
  const JournalEntry = require('../models/JournalEntry');
  const AccountEntry = require('../models/InstallmentsAccountEntry');
  const { PAYMENT_TYPES, postPayment, reversePayment } = require('../services/installments/installmentsPaymentService');
  await mongoose.connect(uri);
  const owner = new mongoose.Types.ObjectId();
  const actor = owner;
  try {
    const account = await Account.create({ userId: owner, name: 'Test Cash', type: 'Asset', normalBalance: 'debit', moduleScope: 'installments', code: `TEST-CASH-${owner}`, category: 'cash', isActive: true });
    const member = await Member.create({ businessOwnerId: owner, memberNumber: `TEST-${owner}`, fullName: 'Foundation Test Member', joiningDate: '2026-10-21', createdBy: actor, updatedBy: actor });
    const payload = { businessOwnerId: owner, actorId: actor, transactionType: PAYMENT_TYPES.CUSTOMER_ADVANCE, transactionDate: '2026-10-21', amount: 20000, accountId: account._id, memberId: member._id, referenceNumber: `TEST-RCPT-${owner}`, idempotencyKey: `test:${owner}:receipt` };
    const first = await postPayment(payload);
    const retry = await postPayment(payload);
    assert.equal(String(first.transaction._id), String(retry.transaction._id));
    assert.equal(await PaymentTransaction.countDocuments({ businessOwnerId: owner, idempotencyKey: payload.idempotencyKey }), 1);
    assert.equal(await JournalEntry.countDocuments({ createdBy: owner, idempotencyKey: payload.idempotencyKey }), 1);
    assert.equal(await AccountEntry.countDocuments({ businessOwnerId: owner, idempotencyKey: payload.idempotencyKey }), 1);
    await reversePayment({ businessOwnerId: owner, transactionId: first.transaction._id, actorId: actor, reason: 'Integration test correction' });
    assert.equal((await PaymentTransaction.findById(first.transaction._id)).status, 'reversed');
    await assert.rejects(() => reversePayment({ businessOwnerId: owner, transactionId: first.transaction._id, actorId: actor, reason: 'Again' }), /already reversed/);
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});
