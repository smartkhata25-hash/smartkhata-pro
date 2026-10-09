const assert = require('assert');
const mongoose = require('mongoose');

const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const controller = require('../controllers/journalEntryController');

const userId = new mongoose.Types.ObjectId();
const ids = {
  tradingDebit: new mongoose.Types.ObjectId(), tradingCredit: new mongoose.Types.ObjectId(),
  travelLegacyDebit: new mongoose.Types.ObjectId(), travelCredit: new mongoose.Types.ObjectId(),
  weavingDebit: new mongoose.Types.ObjectId(), weavingCredit: new mongoose.Types.ObjectId(),
};
const accountFixtures = [
  { _id: ids.tradingDebit, name: 'Trading Cash', moduleScope: 'trading' },
  { _id: ids.tradingCredit, name: 'Trading Sales', moduleScope: 'trading' },
  { _id: ids.travelLegacyDebit, name: 'Legacy Travel Customer', moduleScope: 'trading' },
  { _id: ids.travelCredit, name: 'Travel Sales', moduleScope: 'travel' },
  { _id: ids.weavingDebit, name: 'Weaving Cash', moduleScope: 'weaving' },
  { _id: ids.weavingCredit, name: 'Weaving Sales', moduleScope: 'weaving' },
];
const originals = {
  aggregate: JournalEntry.aggregate, find: JournalEntry.find,
  accountFind: Account.find, accountFindOne: Account.findOne,
};
const seenMatches = [];
const seenAccountQueries = [];

const detectScope = (filter) => {
  if (filter.$and) return 'trading';
  const serialized = JSON.stringify(filter);
  if (serialized.includes('travel_invoice')) return 'travel';
  if (serialized.includes('weaving_expense')) return 'weaving';
  throw new Error(`Unrecognized journal scope filter: ${serialized}`);
};

JournalEntry.aggregate = async ([{ $match }]) => {
  seenMatches.push($match);
  const scope = detectScope($match);
  const amount = scope === 'trading' ? 100 : scope === 'travel' ? 1000 : 300;
  const debitId = scope === 'travel' ? ids.travelLegacyDebit : ids[`${scope}Debit`];
  const creditId = ids[`${scope}Credit`];
  return [
    { _id: debitId, totalDebit: amount, totalCredit: 0 },
    { _id: creditId, totalDebit: 0, totalCredit: amount },
  ];
};

Account.find = async (query) => {
  seenAccountQueries.push(query);
  const requested = new Set((query._id?.$in || []).map(String));
  return accountFixtures.filter((account) => requested.has(String(account._id)));
};

const invokeTrialBalance = async (moduleScope) => {
  let body;
  let statusCode = 200;
  const req = {
    user: { id: userId.toString(), enabledModules: { trading: true, travel: true, weaving: true } },
    query: { moduleScope },
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  await controller.getTrialBalance(req, res);
  assert.strictEqual(statusCode, 200);
  return body;
};

const invokeTravelLedger = async () => {
  let body;
  let accountQuery;
  let journalQuery;
  Account.findOne = async (query) => {
    accountQuery = query;
    return accountFixtures.find((account) => String(account._id) === String(ids.travelLegacyDebit));
  };
  JournalEntry.find = (query) => {
    journalQuery = query;
    return { populate: () => ({ sort: async () => [] }) };
  };
  await controller.getLedgerByAccount({
    user: { id: userId.toString(), enabledModules: { travel: true } },
    params: { accountId: String(ids.travelLegacyDebit) },
    query: { moduleScope: 'travel' },
  }, { status() { return this; }, json(payload) { body = payload; return this; } });
  return { body, accountQuery, journalQuery };
};

(async () => {
  try {
    const trading = await invokeTrialBalance('trading');
    const travel = await invokeTrialBalance('travel');
    const weaving = await invokeTrialBalance('weaving');

    assert.deepStrictEqual([trading.totalDebit, trading.totalCredit], [100, 100]);
    assert.deepStrictEqual([travel.totalDebit, travel.totalCredit], [1000, 1000]);
    assert.deepStrictEqual([weaving.totalDebit, weaving.totalCredit], [300, 300]);
    assert.ok(trading.isBalanced && travel.isBalanced && weaving.isBalanced);
    assert.deepStrictEqual(
      travel.trialBalance.map((row) => row.accountName),
      ['Legacy Travel Customer', 'Travel Sales'],
      'Travel includes every side selected by the Travel journal boundary',
    );

    assert.ok(seenMatches[0].$and, 'Trading journal selection remains isolated');
    assert.match(JSON.stringify(seenMatches[1]), /travel_invoice/);
    assert.doesNotMatch(JSON.stringify(seenMatches[1]), /weaving_expense/);
    assert.match(JSON.stringify(seenMatches[2]), /weaving_expense/);
    assert.doesNotMatch(JSON.stringify(seenMatches[2]), /travel_invoice/);
    seenAccountQueries.forEach((query) => {
      assert.ok(query._id?.$in?.length === 2, 'Only journal-referenced accounts are loaded');
      assert.strictEqual(query.moduleScope, undefined);
      assert.strictEqual(query.$and, undefined);
    });

    const ledger = await invokeTravelLedger();
    assert.ok(ledger.body && Array.isArray(ledger.body.ledger));
    assert.strictEqual(ledger.accountQuery.moduleScope, undefined, 'stale account scope does not block drill-down');
    assert.match(JSON.stringify(ledger.journalQuery), /travel_invoice/, 'ledger rows remain Travel-journal scoped');

    console.log('Trial Balance module isolation and legacy Travel account tests passed');
  } finally {
    JournalEntry.aggregate = originals.aggregate;
    JournalEntry.find = originals.find;
    Account.find = originals.accountFind;
    Account.findOne = originals.accountFindOne;
  }
})().catch((error) => {
  JournalEntry.aggregate = originals.aggregate;
  JournalEntry.find = originals.find;
  Account.find = originals.accountFind;
  Account.findOne = originals.accountFindOne;
  console.error(error);
  process.exitCode = 1;
});
