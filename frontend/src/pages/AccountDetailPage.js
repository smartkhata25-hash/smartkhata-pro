import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCashSummary, getAccountTransactions, getAccounts } from '../services/accountService';
import AccountTransactionTable from '../components/AccountTransactionTable';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const AccountDetailPage = () => {
  const location = useLocation();

  const navigate = useNavigate();

  const canViewAccountTransactions = hasPermission('accounts.view_transactions');

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const txnCacheRef = useRef({});

  const pathname = location.pathname;
  const isCashView = pathname === '/accounts/cash';
  const isBankView = pathname === '/accounts/bank';

  useEffect(() => {
    if (!canViewAccountTransactions) {
      navigate('/dashboard');
    }
  }, [canViewAccountTransactions, navigate]);

  const calculateBalanceFromTxns = useCallback((txns = []) => {
    let bal = 0;

    txns.forEach((t) => {
      bal += Number(t.debit || 0);
      bal -= Number(t.credit || 0);
    });

    return bal;
  }, []);

  const loadSingleAccount = useCallback(
    async (account) => {
      if (!canViewAccountTransactions) {
        return;
      }

      // ✅ CACHE CHECK
      if (txnCacheRef.current[account._id]) {
        const cached = txnCacheRef.current[account._id];

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

      txnCacheRef.current[account._id] = safeTxns;

      setTransactions(safeTxns);

      setSelectedAccount({
        ...account,
        balance: calculateBalanceFromTxns(safeTxns),
      });
    },
    [canViewAccountTransactions, calculateBalanceFromTxns]
  );

  useEffect(() => {
    const loadData = async () => {
      if (!canViewAccountTransactions) {
        return;
      }

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

          const bankAccounts = all.filter(
            (a) => a.category === 'bank' || a.category === 'online' || a.category === 'wallet'
          );

          const txnResults = await Promise.all(
            bankAccounts.map(async (acc) => {
              if (txnCacheRef.current[acc._id]) {
                return txnCacheRef.current[acc._id];
              }

              const txns = await getAccountTransactions(acc._id);
              return Array.isArray(txns) ? txns : [];
            })
          );

          bankAccounts.forEach((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            txnCacheRef.current[acc._id] = txns;
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

          const combined = {
            _id: 'ALL_BANKS',
            name: 'All Banks (Combined)',
            isCombined: true,
          };

          let allTxns = txnResults.flat().filter(Boolean);

          allTxns.sort((a, b) => new Date(a.date) - new Date(b.date));

          const combinedWithBalance = {
            ...combined,
            balance: calculateBalanceFromTxns(allTxns),
          };

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
  }, [
    pathname,
    isCashView,
    isBankView,
    loadSingleAccount,
    canViewAccountTransactions,
    calculateBalanceFromTxns,
  ]);

  const handleAccountChange = async (e) => {
    if (!canViewAccountTransactions) {
      alert('You do not have permission to view account transactions');
      return;
    }

    const acc = accounts.find((a) => a._id === e.target.value);
    if (!acc) return;

    if (acc.isCombined) {
      let allTxns = [];
      const real = accounts.filter((a) => !a.isCombined);

      for (const r of real) {
        const cached = txnCacheRef.current[r._id] || [];
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
    <div className="p-3 md:p-5">
      {selectedAccount ? (
        <AccountTransactionTable
          transactions={transactions}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onAccountChange={handleAccountChange}
          isCashView={isCashView}
          isBankView={isBankView}
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          Loading account details...
        </div>
      )}
    </div>
  );
};

export default AccountDetailPage;
