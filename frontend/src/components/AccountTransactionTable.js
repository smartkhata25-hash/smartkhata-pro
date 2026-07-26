import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const AccountTransactionTable = ({
  transactions = [],
  accounts = [],
  selectedAccount = null,
  onAccountChange,
  isCashView = false,
  isBankView = false,
}) => {
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [quickPeriod, setQuickPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ✅ Number کو ہمیشہ محفوظ طریقے سے حاصل کریں
  const getSafeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  // ✅ رقم کا ایک ہی Professional Format
  const formatMoney = (value) =>
    getSafeNumber(value).toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  // ✅ Local Date کو YYYY-MM-DD میں تبدیل کریں
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  // ✅ Quick Date Filter
  const handleQuickPeriodChange = (value) => {
    setQuickPeriod(value);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let from = '';
    let to = '';

    if (value === 'today') {
      from = formatDateForInput(today);
      to = formatDateForInput(today);
    }

    if (value === 'thisWeek') {
      const dayNumber = today.getDay();
      const mondayDifference = dayNumber === 0 ? -6 : 1 - dayNumber;

      const firstDay = new Date(today);
      firstDay.setDate(today.getDate() + mondayDifference);

      from = formatDateForInput(firstDay);
      to = formatDateForInput(today);
    }

    if (value === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

      from = formatDateForInput(firstDay);
      to = formatDateForInput(today);
    }

    if (value === 'lastMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);

      from = formatDateForInput(firstDay);
      to = formatDateForInput(lastDay);
    }

    if (value === 'thisYear') {
      const firstDay = new Date(today.getFullYear(), 0, 1);

      from = formatDateForInput(firstDay);
      to = formatDateForInput(today);
    }

    if (value === 'all') {
      from = '';
      to = '';
    }

    setStartDate(from);
    setEndDate(to);
  };

  // ✅ Manual Date بدلنے پر Quick Period کو Custom کریں
  const handleStartDateChange = (value) => {
    setStartDate(value);
    setQuickPeriod('custom');
  };

  const handleEndDateChange = (value) => {
    setEndDate(value);
    setQuickPeriod('custom');
  };

  // ✅ تمام Filters صاف کریں
  const clearFilters = () => {
    setSearchText('');
    setTypeFilter('all');
    setQuickPeriod('all');
    setStartDate('');
    setEndDate('');
  };

  // ✅ Filtered Transactions
  const filtered = useMemo(() => {
    if (!Array.isArray(transactions)) {
      return [];
    }

    let result = [...transactions];

    const normalizedSearch = searchText.trim().toLowerCase();

    if (normalizedSearch) {
      result = result.filter((txn) => {
        const searchableText = [
          txn.description,
          txn.billNo,
          txn.accountName,
          txn.paymentType,
          txn.referenceType,
          txn.sourceType,
          txn.module,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      });
    }

    if (typeFilter === 'debit') {
      result = result.filter((txn) => getSafeNumber(txn.debit) > 0);
    }

    if (typeFilter === 'credit') {
      result = result.filter((txn) => getSafeNumber(txn.credit) > 0);
    }

    if (startDate) {
      const selectedStartDate = new Date(`${startDate}T00:00:00`);

      result = result.filter((txn) => {
        if (!txn.date) return false;

        const transactionDate = new Date(txn.date);

        return !Number.isNaN(transactionDate.getTime()) && transactionDate >= selectedStartDate;
      });
    }

    if (endDate) {
      // دن کے آخری وقت تک Record شامل رہے
      const selectedEndDate = new Date(`${endDate}T23:59:59.999`);

      result = result.filter((txn) => {
        if (!txn.date) return false;

        const transactionDate = new Date(txn.date);

        return !Number.isNaN(transactionDate.getTime()) && transactionDate <= selectedEndDate;
      });
    }

    // نئی Transaction پہلے دکھائیں
    result.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();

      if (dateB !== dateA) {
        return dateB - dateA;
      }

      return String(b.time || '').localeCompare(String(a.time || ''));
    });

    return result;
  }, [transactions, searchText, typeFilter, startDate, endDate]);

  // ✅ Cards کی Calculation صرف Filtered Data سے
  const summary = useMemo(() => {
    return filtered.reduce(
      (totals, txn) => {
        totals.moneyIn += getSafeNumber(txn.debit);
        totals.moneyOut += getSafeNumber(txn.credit);

        return totals;
      },
      {
        moneyIn: 0,
        moneyOut: 0,
      }
    );
  }, [filtered]);

  const cashInHand = summary.moneyIn - summary.moneyOut;

  // ✅ Transaction کی اصل Reference ID تلاش کریں
  const getReferenceId = (txn) =>
    txn.referenceId ||
    txn.invoiceId ||
    txn.sourceId ||
    txn.paymentId ||
    txn.expenseId ||
    txn.refundId ||
    txn.purchaseReturnId ||
    txn._sourceId ||
    '';

  // ✅ تمام دستیاب معلومات کو ملا کر Transaction کی قسم پہچانیں
  const getTransactionType = (txn) =>
    [
      txn.originModule,
      txn.sourceType,
      txn.referenceType,
      txn.module,
      txn.transactionType,
      txn.invoiceModel,
      txn.description,
    ]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');

  // ✅ متعلقہ Document کا Route بنائیں
  const getTransactionRoute = (txn) => {
    const referenceId = getReferenceId(txn);

    if (!referenceId) {
      return null;
    }

    const type = getTransactionType(txn);

    /*
     * پہلے originModule کو ترجیح دی جائے گی، کیونکہ Invoice کے اندر
     * کی گئی Payment کا sourceType مختلف ہوسکتا ہے، مگر referenceId
     * اصل Invoice کی ہوتی ہے۔
     */

    // Sale Invoice اور Sale Invoice کے اندر وصول شدہ Payment
    if (
      type.includes('sale_invoice') ||
      type.includes('sales_invoice') ||
      type.includes('opening_sale_invoice') ||
      type.includes('sale_payment')
    ) {
      return `/create-sale?invoiceId=${referenceId}`;
    }

    // Purchase Return کو Purchase Invoice سے پہلے Check کرنا ضروری ہے
    if (
      type.includes('purchase_return') ||
      type.includes('purchase_return_payment') ||
      type.includes('opening_purchase_return')
    ) {
      return `/purchase-returns/edit/${referenceId}`;
    }

    // Purchase Invoice اور اس کے اندر کی گئی Payment
    if (
      type.includes('purchase_invoice') ||
      type.includes('opening_purchase_invoice') ||
      type.includes('purchase_payment') ||
      type.includes('purchase_discount')
    ) {
      return `/purchase-invoice/${referenceId}`;
    }

    // Refund / Sale Return
    if (
      type.includes('refund_invoice') ||
      type.includes('opening_refund_invoice') ||
      type.includes('refund_payment') ||
      type.includes('sale_return') ||
      type.includes('sales_return')
    ) {
      return `/refunds/edit/${referenceId}`;
    }

    // مستقل Receive Payment Form
    if (
      type.includes('receive_payment_form') ||
      type.includes('receive_payment') ||
      type.includes('receive_payment_discount') ||
      type.includes('receipt')
    ) {
      return `/receive-payments/edit/${referenceId}`;
    }

    // Pay Bill
    if (type.includes('pay_bill')) {
      return `/pay-bills/edit/${referenceId}`;
    }

    // Expense
    if (type.includes('expense')) {
      return `/edit-expense/${referenceId}`;
    }

    return null;
  };

  // ✅ متعلقہ Transaction کھولیں
  const handleTransactionClick = (txn) => {
    const route = getTransactionRoute(txn);

    if (route) {
      navigate(route);
    }
  };

  // ✅ رقم دکھائیں — پوری Row الگ سے Clickable ہوگی
  const renderClickableAmount = (txn, amount, moneyType) => {
    const safeAmount = getSafeNumber(amount);

    if (safeAmount <= 0) {
      return '-';
    }

    const route = getTransactionRoute(txn);

    return (
      <span
        title={route ? 'Open related entry' : undefined}
        className={`font-semibold ${
          route ? 'underline underline-offset-2' : ''
        } ${moneyType === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}
      >
        Rs. {formatMoney(safeAmount)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ================= ACCOUNT INFO + SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-[330px_minmax(0,1fr)] gap-4 items-stretch">
        {/* LEFT SIDE — Account Information */}
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm h-[110px] flex flex-col justify-center gap-2">
          {accounts.length > 1 ? (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-200"
              value={selectedAccount?._id || ''}
              onChange={onAccountChange}
            >
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="font-bold text-gray-900">{selectedAccount?.name || '-'}</div>
          )}

          {selectedAccount ? (
            <div
              className={`text-lg font-bold ${
                Number(selectedAccount.balance || 0) >= 0 ? 'text-blue-700' : 'text-red-600'
              }`}
            >
              Balance Rs. {Number(selectedAccount.balance || 0).toFixed(2)}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No account selected</div>
          )}
        </div>

        {/* RIGHT SIDE — Filtered Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-100 p-3 shadow-sm h-[110px] flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-800">Total Money In</span>

              <span className="text-xl">📥</span>
            </div>

            <div className="mt-2 text-2xl font-bold text-emerald-700">
              Rs. {formatMoney(summary.moneyIn)}
            </div>
          </div>

          <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-100 p-3 shadow-sm h-[110px] flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-rose-800">Total Money Out</span>

              <span className="text-xl">📤</span>
            </div>

            <div className="mt-2 text-2xl font-bold text-rose-700">
              Rs. {formatMoney(summary.moneyOut)}
            </div>
          </div>

          <div
            className={`rounded-xl border p-3 shadow-sm h-[110px] flex flex-col justify-center ${
              cashInHand >= 0
                ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-100'
                : 'border-orange-200 bg-gradient-to-br from-orange-50 to-amber-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  cashInHand >= 0 ? 'text-blue-800' : 'text-orange-800'
                }`}
              >
                Cash In Hand
              </span>

              <span className="text-xl">💰</span>
            </div>

            <div
              className={`mt-2 text-2xl font-bold ${
                cashInHand >= 0 ? 'text-blue-700' : 'text-orange-700'
              }`}
            >
              Rs. {formatMoney(cashInHand)}
            </div>
          </div>
        </div>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <input
            type="text"
            placeholder={t('ledger.search')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="lg:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">{t('ledger.all')}</option>
            <option value="debit">Money In</option>
            <option value="credit">Money Out</option>
          </select>

          <select
            value={quickPeriod}
            onChange={(e) => handleQuickPeriodChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisYear">This Year</option>
            <option value="custom">Custom Dates</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            title="From Date"
          />

          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            title="To Date"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-gray-600">
            Showing <span className="font-bold text-gray-900">{filtered.length}</span> of{' '}
            <span className="font-bold text-gray-900">
              {Array.isArray(transactions) ? transactions.length : 0}
            </span>{' '}
            transactions
          </div>

          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-800 shadow-sm"
          >
            🧹 Clear Filters
          </button>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center text-gray-500">
          {t('ledger.noTransactions')}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl shadow-sm overflow-hidden bg-white">
          <div className="max-h-[58vh] overflow-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-gray-100">
                <tr>
                  <th className={headerClass}>{t('date')}</th>
                  <th className={headerClass}>{t('time')}</th>
                  <th className={headerClass}>{t('billNo')}</th>
                  <th className={headerClass}>{t('ledger.source')}</th>
                  <th className={headerClass}>{t('ledger.paymentType')}</th>
                  <th className={`${headerClass} min-w-[280px]`}>{t('description')}</th>
                  <th className={`${headerClass} text-right`}>Money In</th>
                  <th className={`${headerClass} text-right`}>Money Out</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((txn, index) => {
                  const rowKey = `${txn._id || txn.referenceId || index}-${txn.date || ''}-${
                    txn.time || ''
                  }-${txn.debit || 0}-${txn.credit || 0}`;

                  const route = getTransactionRoute(txn);
                  const isClickable = Boolean(route);

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => {
                        if (isClickable) {
                          handleTransactionClick(txn);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (isClickable && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          handleTransactionClick(txn);
                        }
                      }}
                      tabIndex={isClickable ? 0 : undefined}
                      role={isClickable ? 'button' : undefined}
                      title={isClickable ? 'Open related entry' : undefined}
                      className={`border-b border-gray-200 transition ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } ${
                        isClickable
                          ? 'cursor-pointer hover:bg-blue-100 focus:bg-blue-100 focus:outline-none'
                          : 'hover:bg-blue-50'
                      }`}
                    >
                      <td className={cellClass}>
                        {txn.date ? new Date(txn.date).toLocaleDateString('en-GB') : '-'}
                      </td>

                      <td className={cellClass}>{txn.time || '-'}</td>

                      <td className={cellClass}>
                        <span
                          className={
                            isClickable && txn.billNo
                              ? 'font-semibold text-blue-700 underline underline-offset-2'
                              : ''
                          }
                        >
                          {txn.billNo || '-'}
                        </span>
                      </td>

                      <td className={cellClass}>{txn.accountName || '-'}</td>

                      <td className={cellClass}>
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          {txn.paymentType || '-'}
                        </span>
                      </td>

                      <td className={cellClass}>{txn.description || '-'}</td>

                      <td className={`${cellClass} text-right whitespace-nowrap`}>
                        {renderClickableAmount(txn, txn.debit, 'in')}
                      </td>

                      <td className={`${cellClass} text-right whitespace-nowrap`}>
                        {renderClickableAmount(txn, txn.credit, 'out')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Filtered Totals Footer */}
              <tfoot className="sticky bottom-0 z-10 bg-slate-100">
                <tr>
                  <td
                    colSpan={6}
                    className="border-t-2 border-slate-300 px-3 py-3 text-right font-bold text-slate-800"
                  >
                    Filtered Totals
                  </td>

                  <td className="border-t-2 border-slate-300 px-3 py-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                    Rs. {formatMoney(summary.moneyIn)}
                  </td>

                  <td className="border-t-2 border-slate-300 px-3 py-3 text-right font-bold text-rose-700 whitespace-nowrap">
                    Rs. {formatMoney(summary.moneyOut)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const headerClass =
  'border border-gray-300 px-3 py-3 text-left font-bold text-gray-700 whitespace-nowrap bg-gray-100';

const cellClass = 'border-x border-gray-200 px-3 py-2.5 text-gray-700';

export default AccountTransactionTable;
