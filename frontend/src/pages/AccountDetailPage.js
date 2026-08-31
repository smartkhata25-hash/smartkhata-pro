import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isCashView = pathname === '/accounts/cash' || pathname === '/travel/accounts/cash';
  const isBankView = pathname === '/accounts/bank' || pathname === '/travel/accounts/bank';
  const isTravelScoped =
    pathname.startsWith('/travel/accounts') || queryParams.get('moduleScope') === 'travel';
  const moduleScope = isTravelScoped ? 'travel' : 'trading';
  const requestedAccountId = queryParams.get('accountId') || '';

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

  const getSafeBalance = useCallback((account = {}) => {
    const balance = Number(account.balance || 0);

    return Number.isFinite(balance) ? balance : 0;
  }, []);

  const getTxnCacheKey = useCallback(
    (accountId) => `${isTravelScoped ? 'travel' : 'all'}:${accountId}`,
    [isTravelScoped]
  );

  const buildAccountState = useCallback(
    (account, txns = []) => {
      const activityBalance = calculateBalanceFromTxns(txns);

      if (!isTravelScoped) {
        return {
          ...account,
          balance: activityBalance,
        };
      }

      const actualBalance = getSafeBalance(account);

      return {
        ...account,
        actualBalance,
        travelActivityBalance: activityBalance,
        balance: actualBalance,
      };
    },
    [calculateBalanceFromTxns, getSafeBalance, isTravelScoped]
  );

  const loadSingleAccount = useCallback(
    async (account) => {
      if (!canViewAccountTransactions) {
        return;
      }

      const cacheKey = getTxnCacheKey(account._id);

      // ✅ CACHE CHECK
      if (txnCacheRef.current[cacheKey]) {
        const cached = txnCacheRef.current[cacheKey];

        setTransactions(cached);

        setSelectedAccount(buildAccountState(account, cached));

        return;
      }

      // 🔄 API call (only first time)
      const txns = await getAccountTransactions(
        account._id,
        { moduleScope }
      );
      const safeTxns = Array.isArray(txns) ? txns : [];

      txnCacheRef.current[cacheKey] = safeTxns;

      setTransactions(safeTxns);

      setSelectedAccount(buildAccountState(account, safeTxns));
    },
    [buildAccountState, canViewAccountTransactions, getTxnCacheKey, moduleScope]
  );

  useEffect(() => {
    const loadData = async () => {
      if (!canViewAccountTransactions) {
        return;
      }

      try {
        /* ================= CASH ================= */
        if (isCashView && isTravelScoped) {
          const all = await getAccounts(true, { moduleScope });
          const cashAccounts = all.filter((account) => account.category === 'cash');

          if (!cashAccounts.length) {
            alert(t('alerts.cashAccountNotFound'));
            return;
          }

          const txnResults = await Promise.all(
            cashAccounts.map(async (acc) => {
              const cacheKey = getTxnCacheKey(acc._id);

              if (txnCacheRef.current[cacheKey]) {
                return txnCacheRef.current[cacheKey];
              }

              const txns = await getAccountTransactions(acc._id, { moduleScope });

              return Array.isArray(txns) ? txns : [];
            })
          );

          cashAccounts.forEach((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            txnCacheRef.current[getTxnCacheKey(acc._id)] = txns;
          });

          const accountsWithBalance = cashAccounts.map((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            return buildAccountState(acc, txns);
          });

          let allTxns = txnResults.flat().filter(Boolean);

          allTxns.sort((a, b) => new Date(a.date) - new Date(b.date));

          const combinedActualBalance = accountsWithBalance.reduce(
            (sum, account) => sum + getSafeBalance(account),
            0
          );
          const combinedTravelActivityBalance = calculateBalanceFromTxns(allTxns);
          const combinedWithBalance = {
            _id: 'ALL_CASH',
            name: 'All Cash (Combined)',
            isCombined: true,
            balance: combinedActualBalance,
            actualBalance: combinedActualBalance,
            travelActivityBalance: combinedTravelActivityBalance,
          };
          const selectableAccounts =
            accountsWithBalance.length > 1 ? [combinedWithBalance, ...accountsWithBalance] : accountsWithBalance;
          const selectedFromQuery = requestedAccountId
            ? accountsWithBalance.find((account) => String(account._id) === String(requestedAccountId))
            : null;

          if (requestedAccountId && !selectedFromQuery) {
            alert(t('alerts.cashAccountNotFound'));
            return;
          }

          const selected = selectedFromQuery || selectableAccounts[0];

          setAccounts(selectableAccounts);
          setSelectedAccount(selected);
          setTransactions(
            selected?.isCombined ? allTxns : txnCacheRef.current[getTxnCacheKey(selected?._id)] || []
          );
          return;
        }

        if (isCashView) {
          if (requestedAccountId) {
            const all = await getAccounts(true, { moduleScope });
            const cashAccounts = all.filter((account) => account.category === 'cash');
            const selectedCash = cashAccounts.find(
              (account) => String(account._id) === String(requestedAccountId)
            );

            if (!selectedCash) {
              alert(t('alerts.cashAccountNotFound'));
              return;
            }

            setAccounts(cashAccounts);
            await loadSingleAccount(selectedCash);
            return;
          }

          const cash = await getCashSummary({ moduleScope });
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
          const all = await getAccounts(true, { moduleScope });

          const bankAccounts = all.filter(
            (a) => a.category === 'bank' || a.category === 'online' || a.category === 'wallet'
          );

          const txnResults = await Promise.all(
            bankAccounts.map(async (acc) => {
              const cacheKey = getTxnCacheKey(acc._id);

              if (txnCacheRef.current[cacheKey]) {
                return txnCacheRef.current[cacheKey];
              }

              const txns = await getAccountTransactions(
                acc._id,
                { moduleScope }
              );
              return Array.isArray(txns) ? txns : [];
            })
          );

          bankAccounts.forEach((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            txnCacheRef.current[getTxnCacheKey(acc._id)] = txns;
          });

          const accountsWithBalance = bankAccounts.map((acc, i) => {
            const txns = Array.isArray(txnResults[i]) ? txnResults[i] : [];

            return buildAccountState(acc, txns);
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

          const combinedActualBalance = accountsWithBalance.reduce(
            (sum, account) => sum + getSafeBalance(account),
            0
          );
          const combinedTravelActivityBalance = calculateBalanceFromTxns(allTxns);

          const combinedWithBalance = {
            ...combined,
            balance: isTravelScoped ? combinedActualBalance : combinedTravelActivityBalance,
            actualBalance: combinedActualBalance,
            travelActivityBalance: combinedTravelActivityBalance,
          };

          const selectedFromQuery = requestedAccountId
            ? accountsWithBalance.find((account) => String(account._id) === String(requestedAccountId))
            : null;

          setAccounts([combinedWithBalance, ...accountsWithBalance]);

          if (selectedFromQuery) {
            setSelectedAccount(selectedFromQuery);
            setTransactions(txnCacheRef.current[getTxnCacheKey(selectedFromQuery._id)] || []);
          } else {
            setSelectedAccount(combinedWithBalance);
            setTransactions(allTxns);
          }
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
    buildAccountState,
    getSafeBalance,
    getTxnCacheKey,
    isTravelScoped,
    moduleScope,
    requestedAccountId,
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
        const cached = txnCacheRef.current[getTxnCacheKey(r._id)] || [];
        allTxns.push(...cached);
      }

      allTxns.sort((a, b) => new Date(a.date) - new Date(b.date));
      setTransactions(allTxns);

      setSelectedAccount({
        ...acc,
        balance: isTravelScoped ? getSafeBalance(acc) : calculateBalanceFromTxns(allTxns),
        actualBalance: getSafeBalance(acc),
        travelActivityBalance: calculateBalanceFromTxns(allTxns),
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
          isTravelScoped={isTravelScoped}
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
