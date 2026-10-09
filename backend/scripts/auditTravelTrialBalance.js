require('dotenv').config();

const mongoose = require('mongoose');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const { _test } = require('../controllers/journalEntryController');
const { applyModuleScopeFilter, MODULE_SCOPES } = require('../utils/moduleScope');

const MONEY_TOLERANCE = 0.005;
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toId = (value) => String(value || '');

const summarizeBalances = (journals, includedAccountIds = null) => {
  const balances = new Map();
  journals.forEach((journal) => journal.lines.forEach((line) => {
    const accountId = toId(line.account);
    if (includedAccountIds && !includedAccountIds.has(accountId)) return;
    const current = balances.get(accountId) || 0;
    balances.set(accountId, current + (line.type === 'debit' ? line.amount : -line.amount));
  }));

  let totalDebit = 0;
  let totalCredit = 0;
  balances.forEach((balance) => {
    if (balance > 0) totalDebit += balance;
    if (balance < 0) totalCredit += Math.abs(balance);
  });
  return { totalDebit: roundMoney(totalDebit), totalCredit: roundMoney(totalCredit) };
};

const audit = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.DB_URI;
  if (!mongoUri) throw new Error('MONGO_URI or DB_URI is required. No audit was run.');
  await mongoose.connect(mongoUri);

  const targetUserId = String(process.env.AUDIT_USER_ID || '').trim();
  const summaryOnly = process.env.AUDIT_SUMMARY_ONLY === 'true';
  const journals = await JournalEntry.find({
    isDeleted: false,
    ...(targetUserId ? { createdBy: targetUserId } : {}),
    ..._test.getJournalScopeFilter(MODULE_SCOPES.TRAVEL),
  }).select('_id createdBy referenceId sourceType originModule date lines').lean();

  const byUser = new Map();
  journals.forEach((journal) => {
    const key = toId(journal.createdBy);
    byUser.set(key, [...(byUser.get(key) || []), journal]);
  });

  for (const [userId, userJournals] of byUser.entries()) {
    const referencedIds = [...new Set(userJournals.flatMap((journal) => journal.lines.map((line) => toId(line.account))))];
    const accounts = await Account.find({ userId, _id: { $in: referencedIds } })
      .select('_id name moduleScope').lean();
    const accountMap = new Map(accounts.map((account) => [toId(account._id), account]));
    const scopedAccountQuery = { userId };
    applyModuleScopeFilter(scopedAccountQuery, MODULE_SCOPES.TRAVEL);
    const scopedAccounts = await Account.find(scopedAccountQuery).select('_id').lean();
    const scopedIds = new Set(scopedAccounts.map((account) => toId(account._id)));

    const unbalancedJournals = userJournals.flatMap((journal) => {
      const debit = roundMoney(journal.lines.filter((line) => line.type === 'debit').reduce((sum, line) => sum + line.amount, 0));
      const credit = roundMoney(journal.lines.filter((line) => line.type === 'credit').reduce((sum, line) => sum + line.amount, 0));
      return Math.abs(debit - credit) < MONEY_TOLERANCE ? [] : [{
        journalId: toId(journal._id), referenceId: toId(journal.referenceId),
        sourceType: journal.sourceType, originModule: journal.originModule,
        debit, credit, date: journal.date,
      }];
    });

    const mismatches = referencedIds.filter((id) => !scopedIds.has(id)).map((accountId) => {
      const account = accountMap.get(accountId);
      const references = userJournals.filter((journal) => journal.lines.some((line) => toId(line.account) === accountId));
      const netDebit = roundMoney(references.reduce((total, journal) => total + journal.lines
        .filter((line) => toId(line.account) === accountId)
        .reduce((sum, line) => sum + (line.type === 'debit' ? line.amount : -line.amount), 0), 0));
      return {
        accountId,
        accountName: account?.name || '[missing account]',
        accountScope: account?.moduleScope || '[missing account]',
        netDebit,
        journalCount: references.length,
        ...(!summaryOnly ? { journals: references.map((journal) => ({
          journalId: toId(journal._id), referenceId: toId(journal.referenceId),
          sourceType: journal.sourceType, originModule: journal.originModule, date: journal.date,
        })) } : {}),
      };
    });

    const oldTotals = summarizeBalances(userJournals, scopedIds);
    const completeTotals = summarizeBalances(userJournals);
    console.log(JSON.stringify({
      userId,
      travelJournalCount: userJournals.length,
      unbalancedJournals,
      omittedAccounts: mismatches,
      currentReportTotals: { ...oldTotals, difference: roundMoney(oldTotals.totalDebit - oldTotals.totalCredit) },
      completeJournalTotals: { ...completeTotals, difference: roundMoney(completeTotals.totalDebit - completeTotals.totalCredit) },
    }, null, 2));
  }
};

audit()
  .catch((error) => {
    console.error(`Travel Trial Balance audit failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
