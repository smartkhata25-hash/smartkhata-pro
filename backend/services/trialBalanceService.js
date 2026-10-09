const MONEY_TOLERANCE = 0.005;

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildTrialBalanceRows = (summary = [], accounts = []) => {
  const accountMap = new Map(
    accounts.map((account) => [String(account._id), account]),
  );
  const trialBalance = [];
  let totalDebit = 0;
  let totalCredit = 0;

  summary.forEach((accountSummary) => {
    const accountId = String(accountSummary._id || '');
    const account = accountMap.get(accountId);
    const netDebit = roundMoney(
      Number(accountSummary.totalDebit || 0) -
        Number(accountSummary.totalCredit || 0),
    );
    const debit = netDebit > MONEY_TOLERANCE ? netDebit : 0;
    const credit = netDebit < -MONEY_TOLERANCE ? Math.abs(netDebit) : 0;

    if (!debit && !credit) return;

    trialBalance.push({
      accountId: accountSummary._id,
      accountName: account?.name || `Unknown Account (${accountId})`,
      debit,
      credit,
    });
    totalDebit += debit;
    totalCredit += credit;
  });

  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  return {
    trialBalance,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < MONEY_TOLERANCE,
  };
};

module.exports = {
  MONEY_TOLERANCE,
  buildTrialBalanceRows,
  roundMoney,
};
