import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCashSummary,
  getBankSummary,
  getAccountTransactions,
  getAccountsByCategory,
} from '../services/accountService';
import AccountTransactionTable from '../components/AccountTransactionTable';

const AccountDetailPage = () => {
  const location = useLocation();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const pathname = location.pathname;
  const isCashView = pathname === '/accounts/cash';
  const isBankView = pathname === '/accounts/bank';

  const selectAndLoadAccount = useCallback(async (account) => {
    setSelectedAccount(account);
    try {
      const data = await getAccountTransactions(account._id);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('❌ Transaction Fetch Error:', err);
      alert('Failed to load transactions.');
    }
  }, []);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        if (isCashView) {
          const cash = await getCashSummary();
          if (!cash?._id) {
            alert('⚠️ Cash account not found. Please create one.');
            return;
          }
          setAccounts([cash]);
          await selectAndLoadAccount(cash);
        } else if (isBankView) {
          const summary = await getBankSummary();
          const bankAccounts = summary.accounts || [];
          if (!bankAccounts.length) {
            alert('⚠️ No bank accounts found.');
            return;
          }
          setAccounts(bankAccounts);
          await selectAndLoadAccount(bankAccounts[0]);
        } else {
          const category = pathname.split('/').pop();
          const catAccounts = await getAccountsByCategory(category);
          if (!catAccounts.length) {
            alert('⚠️ No accounts found in this category.');
            return;
          }
          setAccounts(catAccounts);
          await selectAndLoadAccount(catAccounts[0]);
        }
      } catch (err) {
        console.error('❌ Account Load Error:', err);
        alert('Failed to load account data.');
      }
    };

    fetchAccounts();
  }, [pathname, isCashView, isBankView, selectAndLoadAccount]);

  const handleAccountChange = async (e) => {
    const accId = e.target.value;
    const acc = accounts.find((a) => a._id === accId);
    if (acc) await selectAndLoadAccount(acc);
  };

  return (
    <div className="p-5">
      <h2 className="text-xl font-bold mb-3">
        {isCashView
          ? '💵 Cash Account Details'
          : isBankView
          ? '🏦 Bank Account Details'
          : '📁 Account Details'}
      </h2>

      {accounts.length > 1 && (
        <select
          onChange={handleAccountChange}
          value={selectedAccount?._id}
          className="border p-2 mb-4"
        >
          {accounts.map((acc) => (
            <option key={acc._id} value={acc._id}>
              {acc.name} (Rs. {parseFloat(acc.balance || 0).toFixed(2)})
            </option>
          ))}
        </select>
      )}

      {selectedAccount && (
        <>
          <h3 className="font-semibold mb-2">
            {selectedAccount.name} – Current Balance: Rs.{' '}
            {parseFloat(selectedAccount.balance || 0).toFixed(2)}
          </h3>

          <AccountTransactionTable transactions={transactions} />
        </>
      )}
    </div>
  );
};

export default AccountDetailPage;
