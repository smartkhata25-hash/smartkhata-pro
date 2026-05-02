import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getCashSummary, getAccountTransactions, getAccounts } from '../services/accountService';
import AccountTransactionTable from '../components/AccountTransactionTable';
import { t } from '../i18n/i18n';

const AccountDetailPage = () => {
  const location = useLocation();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txnCache, setTxnCache] = useState({});

  const pathname = location.pathname;
  const isCashView = pathname === '/accounts/cash';
  const isBankView = pathname === '/accounts/bank';

  const calculateBalanceFromTxns = (txns = []) => {
    let bal = 0;
    txns.forEach((t) => {
      bal += t.debit || 0;
      bal -= t.credit || 0;
    });
    return bal;
  };

  const loadSingleAccount = useCallback(
    async (account) => {
      // ✅ CACHE CHECK
      if (txnCache[account._id]) {
        const cached = txnCache[account._id];

        setTransactions(cached);

        setSelectedAccount({
          ...account,
          balance: calculateBalanceFromTxns(cached),
        });

        return;
      }

      // 🔄 API call (only first time)
      const txns = await getAccountTransactions(account._id);
      const safeTxns = Array.isArray(txns) ? txns : [];

      // ✅ SAVE IN CACHE
      setTxnCache((prev) => ({
        ...prev,
        [account._id]: safeTxns,
      }));

      setTransactions(safeTxns);

      setSelectedAccount({
        ...account,
        balance: calculateBalanceFromTxns(safeTxns),
      });
    },
    [txnCache]
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        /* ================= CASH ================= */
        if (isCashView) {
          const cash = await getCashSummary();
          if (!cash?._id) {
            alert(t('alerts.cashAccountNotFound'));
            return;
          }
          setAccounts([cash]);
          await loadSingleAccount(cash);
          return;
        }

        /* ================= BANK ================= */
        if (isBankView) {
          const all = await getAccounts();

          // ✅ ONLY BANK + WALLETS (STRICT FILTER)
          const bankAccounts = all.filter(
            (a) => a.category === 'bank' || a.category === 'online' || a.category === 'wallet'
          );
          // ✅ attach balance to each account

          const txnResults = await Promise.all(
            bankAccounts.map(async (acc) => {
              // ✅ اگر cache میں ہے تو وہی use کرو
              if (txnCache[acc._id]) {
                return txnCache[acc._id];
              }

              // 🔄 نہیں ہے تو API call
              const txns = await getAccountTransactions(acc._id);
              return Array.isArray(txns) ? txns : [];
            })
          );

          // ✅ SAVE ALL IN CACHE (MERGE, overwrite نہیں)
          setTxnCache((prev) => {
            const updated = { ...prev };

            bankAccounts.forEach((acc, i) => {
              const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];
              updated[acc._id] = txns;
            });

            return updated;
          });

          const accountsWithBalance = bankAccounts.map((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            return {
              ...acc,
              balance: calculateBalanceFromTxns(txns),
            };
          });

          if (!bankAccounts.length) {
            alert(t('alerts.noBankAccounts'));
            return;
          }

          // ✅ Fake combined (UI only)
          const combined = {
            _id: 'ALL_BANKS',
            name: 'All Banks (Combined)',
            isCombined: true,
          };

          // ✅ Combined transactions
          let allTxns = txnResults.flat().filter(Boolean);

          allTxns.sort((a, b) => new Date(a.date) - new Date(b.date));

          // ✅ Combined account WITH balance (single source of truth)
          const combinedWithBalance = {
            ...combined,
            balance: calculateBalanceFromTxns(allTxns),
          };

          // ✅ VERY IMPORTANT: accounts + selectedAccount same object
          setAccounts([combinedWithBalance, ...accountsWithBalance]);
          setSelectedAccount(combinedWithBalance);
          setTransactions(allTxns);
        }
      } catch (err) {
        console.error(err);
        alert(t('alerts.accountsLoadFailed'));
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isCashView, isBankView, loadSingleAccount]);

  const handleAccountChange = async (e) => {
    const acc = accounts.find((a) => a._id === e.target.value);
    if (!acc) return;

    if (acc.isCombined) {
      let allTxns = [];
      const real = accounts.filter((a) => !a.isCombined);

      for (const r of real) {
        const cached = txnCache[r._id] || [];
        allTxns.push(...cached);
      }

      allTxns.sort((a, b) => new Date(a.date) - new Date(b.date));
      setTransactions(allTxns);

      setSelectedAccount({
        ...acc,
        balance: calculateBalanceFromTxns(allTxns),
      });
    } else {
      await loadSingleAccount(acc);
    }
  };

  return (
    <div className="p-5">
      <h2 className="text-xl font-bold mb-3">
        {isCashView ? t('account.cashDetails') : t('account.bankDetails')}
      </h2>

      {accounts.length > 1 && (
        <select
          className="border p-2 mb-4"
          value={selectedAccount?._id}
          onChange={handleAccountChange}
        >
          {accounts.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name} (Rs. {Number(a.balance || 0).toFixed(2)})
            </option>
          ))}
        </select>
      )}

      {selectedAccount && (
        <>
          <h3 className="font-semibold mb-2">
            {selectedAccount.name} – {t('account.balance')} Rs.{' '}
            {Number(selectedAccount.balance || 0).toFixed(2)}
          </h3>

          <AccountTransactionTable transactions={transactions} />
        </>
      )}
    </div>
  );
};

export default AccountDetailPage;
