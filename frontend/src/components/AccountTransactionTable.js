import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import {
  formatBusinessDateForDisplay,
  getBusinessDateInputValue,
} from '../utils/localDateTime';

const AccountTransactionTable = ({
  transactions = [],
  accounts = [],
  selectedAccount = null,
  onAccountChange,
  isCashView = false,
  isBankView = false,
  isTravelScoped = false,
}) => {
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [quickPeriod, setQuickPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getSafeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const formatMoney = (value) =>
    getSafeNumber(value).toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const formatDateForInput = (date) => {
    return getBusinessDateInputValue(date);
  };

  const getTransactionDateKey = (date) => {
    if (!date) return '';

    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime()) ? '' : getBusinessDateInputValue(date);
  };

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

  const handleStartDateChange = (value) => {
    setStartDate(value);
    setQuickPeriod('custom');
  };

  const handleEndDateChange = (value) => {
    setEndDate(value);
    setQuickPeriod('custom');
  };

  const clearFilters = () => {
    setSearchText('');
    setTypeFilter('all');
    setQuickPeriod('all');
    setStartDate('');
    setEndDate('');
  };

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
      result = result.filter((txn) => {
        const transactionDate = getTransactionDateKey(txn.date);

        return transactionDate && transactionDate >= startDate;
      });
    }

    if (endDate) {
      result = result.filter((txn) => {
        const transactionDate = getTransactionDateKey(txn.date);

        return transactionDate && transactionDate <= endDate;
      });
    }

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

  const netMovement = summary.moneyIn - summary.moneyOut;

  const moneyInLabel = isTravelScoped ? t('travel.accounts.travelCashIn') : 'Total Money In';

  const moneyOutLabel = isTravelScoped ? t('travel.accounts.travelCashOut') : 'Total Money Out';

  const netMovementLabel = isTravelScoped ? t('travel.accounts.travelNetMovement') : 'Cash In Hand';

  const travelActivityBalance = getSafeNumber(
    selectedAccount?.travelActivityBalance ?? netMovement
  );

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

  const getTransactionRoute = (txn) => {
    const referenceId = getReferenceId(txn);

    if (!referenceId) {
      return null;
    }

    const type = getTransactionType(txn);

    if (type.includes('travel_refund')) {
      return `/travel/refunds/${referenceId}`;
    }

    if (type.includes('travel_vendor_return')) {
      return `/travel/vendor-returns/${referenceId}`;
    }

    if (
      type.includes('travel_invoice') ||
      type.includes('travel_booking') ||
      type.includes('travel_vendor_cost')
    ) {
      return `/travel/bookings/${referenceId}`;
    }

    if (
      type.includes('sale_invoice') ||
      type.includes('sales_invoice') ||
      type.includes('opening_sale_invoice') ||
      type.includes('sale_payment')
    ) {
      return `/create-sale?invoiceId=${referenceId}`;
    }

    if (
      type.includes('purchase_return') ||
      type.includes('purchase_return_payment') ||
      type.includes('opening_purchase_return')
    ) {
      return `/purchase-returns/edit/${referenceId}`;
    }

    if (
      type.includes('purchase_invoice') ||
      type.includes('opening_purchase_invoice') ||
      type.includes('purchase_payment') ||
      type.includes('purchase_discount')
    ) {
      return `/purchase-invoice/${referenceId}`;
    }

    if (
      type.includes('refund_invoice') ||
      type.includes('opening_refund_invoice') ||
      type.includes('refund_payment') ||
      type.includes('sale_return') ||
      type.includes('sales_return')
    ) {
      return `/refunds/edit/${referenceId}`;
    }

    if (
      type.includes('receive_payment_form') ||
      type.includes('receive_payment') ||
      type.includes('receive_payment_discount') ||
      type.includes('receipt')
    ) {
      return `/receive-payments/edit/${referenceId}`;
    }

    if (type.includes('pay_bill')) {
      return `/pay-bills/edit/${referenceId}`;
    }

    if (type.includes('travel_expense') || (isTravelScoped && type.includes('expense'))) {
      return `/travel/expenses/${referenceId}/edit`;
    }

    if (type.includes('expense')) {
      return `/edit-expense/${referenceId}`;
    }

    return null;
  };

  const handleTransactionClick = (txn) => {
    const route = getTransactionRoute(txn);

    if (route) {
      navigate(route);
    }
  };

  const renderClickableAmount = (txn, amount, moneyType) => {
    const safeAmount = getSafeNumber(amount);

    if (safeAmount <= 0) {
      return '-';
    }

    const route = getTransactionRoute(txn);

    return (
      <span
        title={route ? 'Open related entry' : undefined}
        className={`font-semibold ${route ? 'underline underline-offset-2' : ''} ${
          moneyType === 'in' ? 'text-emerald-700' : 'text-rose-700'
        }`}
      >
        Rs. {formatMoney(safeAmount)}
      </span>
    );
  };

  const renderMobileTransactionCard = (txn, index) => {
    const rowKey = `${txn._id || txn.referenceId || index}-${txn.date || ''}-${
      txn.time || ''
    }-${txn.debit || 0}-${txn.credit || 0}`;

    const route = getTransactionRoute(txn);
    const isClickable = Boolean(route);

    return (
      <article
        key={rowKey}
        onClick={() => {
          if (isClickable) {
            handleTransactionClick(txn);
          }
        }}
        className={`w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-3 shadow-sm ${
          isClickable ? 'cursor-pointer transition active:bg-blue-50' : ''
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-extrabold leading-5 text-slate-950">
              {txn.billNo || txn.description || '-'}
            </p>

            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {formatBusinessDateForDisplay(txn.date)}
              {txn.time ? ` - ${txn.time}` : ''}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm">
            {txn.paymentType || '-'}
          </span>
        </div>

        <p className="mt-2 break-words text-xs font-medium leading-5 text-slate-600">
          {txn.description || '-'}
        </p>

        <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
          <div className="min-w-0 rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/70 p-2">
            <p className="break-words text-[9px] font-extrabold uppercase leading-4 text-emerald-700">
              {moneyInLabel}
            </p>

            <p className="mt-0.5 break-words text-sm font-extrabold text-emerald-700">
              {getSafeNumber(txn.debit) > 0 ? `Rs. ${formatMoney(txn.debit)}` : '-'}
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-rose-100 bg-gradient-to-br from-rose-50 to-red-100/70 p-2">
            <p className="break-words text-[9px] font-extrabold uppercase leading-4 text-rose-700">
              {moneyOutLabel}
            </p>

            <p className="mt-0.5 break-words text-sm font-extrabold text-rose-700">
              {getSafeNumber(txn.credit) > 0 ? `Rs. ${formatMoney(txn.credit)}` : '-'}
            </p>
          </div>
        </div>
      </article>
    );
  };

  const accountInfoCardClass = isTravelScoped
    ? 'flex min-h-[82px] flex-col justify-center gap-1.5 rounded-xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/60 to-sky-50 px-4 py-2.5 shadow-sm'
    : 'flex min-h-[82px] flex-col justify-center gap-1.5 rounded-xl border border-blue-200 bg-gradient-to-br from-white via-blue-50/50 to-indigo-50 px-4 py-2.5 shadow-sm';

  const moneyInCardClass =
    'flex min-h-[82px] flex-col justify-center rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-100/70 px-3 py-2.5 shadow-sm';

  const moneyOutCardClass =
    'flex min-h-[82px] flex-col justify-center rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-rose-100/70 px-3 py-2.5 shadow-sm';

  const netMovementCardClass = `flex min-h-[82px] flex-col justify-center rounded-xl border px-3 py-2.5 shadow-sm ${
    netMovement >= 0
      ? 'border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100/70'
      : 'border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100/70'
  }`;

  return (
    <div className="min-w-0 space-y-2">
      {/* ================= SUMMARY ================= */}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className={accountInfoCardClass}>
          {accounts.length > 1 ? (
            <select
              className="h-9 w-full min-w-0 rounded-lg border border-cyan-200 bg-white px-3 text-sm font-semibold leading-normal text-slate-800 outline-none shadow-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
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
            <div className="break-words text-sm font-extrabold text-slate-900">
              {selectedAccount?.name || '-'}
            </div>
          )}

          {selectedAccount ? (
            isTravelScoped ? (
              <div
                className={`break-words text-lg font-extrabold ${
                  travelActivityBalance >= 0 ? 'text-blue-700' : 'text-red-600'
                }`}
              >
                Balance Rs. {formatMoney(travelActivityBalance)}
              </div>
            ) : (
              <div
                className={`break-words text-lg font-extrabold ${
                  Number(selectedAccount.balance || 0) >= 0 ? 'text-blue-700' : 'text-red-600'
                }`}
              >
                Balance Rs. {Number(selectedAccount.balance || 0).toFixed(2)}
              </div>
            )
          ) : (
            <div className="text-xs text-slate-500">No account selected</div>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-3 xl:col-span-1">
          <div className={moneyInCardClass}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-xs font-bold text-emerald-800 sm:text-sm">
                {moneyInLabel}
              </span>

              <span className="shrink-0 text-base">📥</span>
            </div>

            <div className="mt-1 break-words text-xl font-extrabold text-emerald-700">
              Rs. {formatMoney(summary.moneyIn)}
            </div>
          </div>

          <div className={moneyOutCardClass}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-xs font-bold text-rose-800 sm:text-sm">
                {moneyOutLabel}
              </span>

              <span className="shrink-0 text-base">📤</span>
            </div>

            <div className="mt-1 break-words text-xl font-extrabold text-rose-700">
              Rs. {formatMoney(summary.moneyOut)}
            </div>
          </div>

          <div className={netMovementCardClass}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={`min-w-0 text-xs font-bold sm:text-sm ${
                  netMovement >= 0 ? 'text-blue-800' : 'text-orange-800'
                }`}
              >
                {netMovementLabel}
              </span>

              <span className="shrink-0 text-base">💰</span>
            </div>

            <div
              className={`mt-1 break-words text-xl font-extrabold ${
                netMovement >= 0 ? 'text-blue-700' : 'text-orange-700'
              }`}
            >
              Rs. {formatMoney(netMovement)}
            </div>
          </div>
        </div>
      </div>

      {/* ================= FILTERS ================= */}
      <div className="min-w-0 rounded-xl border border-sky-200 bg-gradient-to-r from-slate-50 via-sky-50/70 to-cyan-50/70 p-2 shadow-sm">
        {/* MOBILE — Compact 2 Row Filters */}
        <div className="space-y-1.5 md:hidden">
          <input
            type="text"
            placeholder={t('ledger.search')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9 w-full min-w-0 rounded-lg border border-sky-200 bg-white/95 px-3 text-sm font-medium text-slate-700 outline-none shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_38px_38px_38px] gap-1.5">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 min-w-0 rounded-lg border border-violet-200 bg-gradient-to-r from-white to-violet-50 px-2 text-xs font-semibold leading-normal text-slate-700 outline-none shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="all">{t('ledger.all')}</option>
              <option value="debit">Money In</option>
              <option value="credit">Money Out</option>
            </select>

            <select
              value={quickPeriod}
              onChange={(e) => handleQuickPeriodChange(e.target.value)}
              className="h-9 min-w-0 rounded-lg border border-indigo-200 bg-gradient-to-r from-white to-indigo-50 px-2 text-xs font-semibold leading-normal text-slate-700 outline-none shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="thisWeek">This Week</option>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="thisYear">This Year</option>
              <option value="custom">Custom</option>
            </select>

            {/* FROM DATE */}
            <label
              title={startDate ? `From: ${startDate}` : 'From Date'}
              className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border shadow-sm transition ${
                startDate
                  ? 'border-emerald-400 bg-gradient-to-br from-emerald-400 to-green-600 text-white'
                  : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-100 text-emerald-700'
              }`}
            >
              <span className="pointer-events-none text-base">📅</span>

              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="From Date"
              />
            </label>

            {/* TO DATE */}
            <label
              title={endDate ? `To: ${endDate}` : 'To Date'}
              className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border shadow-sm transition ${
                endDate
                  ? 'border-amber-400 bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                  : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 text-amber-700'
              }`}
            >
              <span className="pointer-events-none text-base">📆</span>

              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="To Date"
              />
            </label>

            {/* CLEAR */}
            <button
              type="button"
              onClick={clearFilters}
              title="Clear Filters"
              aria-label="Clear Filters"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-gradient-to-br from-slate-700 to-slate-950 text-sm text-white shadow-sm transition active:scale-95"
            >
              🧹
            </button>
          </div>
        </div>

        {/* TABLET / DESKTOP — KEEP EXISTING LAYOUT */}
        <div className="hidden min-w-0 md:grid md:grid-cols-2 md:gap-2 lg:grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(140px,1fr)_minmax(145px,1fr)_minmax(145px,1fr)_42px]">
          <input
            type="text"
            placeholder={t('ledger.search')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-10 min-w-0 rounded-lg border border-sky-200 bg-white/95 px-3 text-sm font-medium text-slate-700 outline-none shadow-sm transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 min-w-0 rounded-lg border border-violet-200 bg-gradient-to-r from-white to-violet-50 px-3 text-sm font-semibold leading-normal text-slate-700 outline-none shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          >
            <option value="all">{t('ledger.all')}</option>
            <option value="debit">Money In</option>
            <option value="credit">Money Out</option>
          </select>

          <select
            value={quickPeriod}
            onChange={(e) => handleQuickPeriodChange(e.target.value)}
            className="h-10 min-w-0 rounded-lg border border-indigo-200 bg-gradient-to-r from-white to-indigo-50 px-3 text-sm font-semibold leading-normal text-slate-700 outline-none shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
            className="block h-10 w-full min-w-0 rounded-lg border border-emerald-200 bg-gradient-to-r from-white to-emerald-50 px-2.5 text-sm font-medium text-slate-700 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            title="From Date"
          />

          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="block h-10 w-full min-w-0 rounded-lg border border-amber-200 bg-gradient-to-r from-white to-amber-50 px-2.5 text-sm font-medium text-slate-700 outline-none shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            title="To Date"
          />

          <button
            type="button"
            onClick={clearFilters}
            title="Clear Filters"
            aria-label="Clear Filters"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-gradient-to-br from-slate-700 to-slate-900 text-base text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            🧹
          </button>
        </div>
      </div>

      {/* ================= TRANSACTIONS ================= */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white py-8 text-center text-sm text-slate-500">
          {t('ledger.noTransactions')}
        </div>
      ) : (
        <>
          {/* ================= DESKTOP TABLE ================= */}
          <div className="hidden min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="max-h-[calc(100vh-275px)] min-h-[260px] overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-gradient-to-r from-slate-100 via-sky-50 to-slate-100">
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
                    const rowKey = `${
                      txn._id || txn.referenceId || index
                    }-${txn.date || ''}-${txn.time || ''}-${txn.debit || 0}-${txn.credit || 0}`;

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
                        className={`border-b border-slate-200 transition ${
                          index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                        } ${
                          isClickable
                            ? 'cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none'
                            : 'hover:bg-sky-50/60'
                        }`}
                      >
                        <td className={cellClass}>
                          {formatBusinessDateForDisplay(txn.date)}
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
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {txn.paymentType || '-'}
                          </span>
                        </td>

                        <td className={cellClass}>{txn.description || '-'}</td>

                        <td className={`${cellClass} whitespace-nowrap text-right`}>
                          {renderClickableAmount(txn, txn.debit, 'in')}
                        </td>

                        <td className={`${cellClass} whitespace-nowrap text-right`}>
                          {renderClickableAmount(txn, txn.credit, 'out')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="sticky bottom-0 z-10">
                  <tr className="bg-gradient-to-r from-slate-100 via-blue-50 to-slate-100">
                    <td
                      colSpan={3}
                      className="border-t-2 border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-600"
                    >
                      Showing{' '}
                      <span className="font-extrabold text-slate-900">{filtered.length}</span> of{' '}
                      <span className="font-extrabold text-slate-900">
                        {Array.isArray(transactions) ? transactions.length : 0}
                      </span>{' '}
                      transactions
                    </td>

                    <td
                      colSpan={3}
                      className="border-t-2 border-slate-300 px-3 py-2 text-right font-extrabold text-slate-800"
                    >
                      Filtered Totals
                    </td>

                    <td className="whitespace-nowrap border-t-2 border-slate-300 px-3 py-2 text-right font-extrabold text-emerald-700">
                      Rs. {formatMoney(summary.moneyIn)}
                    </td>

                    <td className="whitespace-nowrap border-t-2 border-slate-300 px-3 py-2 text-right font-extrabold text-rose-700">
                      Rs. {formatMoney(summary.moneyOut)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ================= MOBILE CARDS ================= */}
          <div className="min-w-0 space-y-2 md:hidden">
            <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2">
              <p className="min-w-0 text-[11px] font-semibold text-slate-600">
                Showing <span className="font-extrabold text-slate-900">{filtered.length}</span> of{' '}
                <span className="font-extrabold text-slate-900">
                  {Array.isArray(transactions) ? transactions.length : 0}
                </span>
              </p>

              <div className="flex shrink-0 items-center gap-3 text-[11px] font-bold">
                <span className="text-emerald-700">In: Rs. {formatMoney(summary.moneyIn)}</span>

                <span className="text-rose-700">Out: Rs. {formatMoney(summary.moneyOut)}</span>
              </div>
            </div>

            {filtered.map(renderMobileTransactionCard)}
          </div>
        </>
      )}
    </div>
  );
};

const headerClass =
  'border border-slate-200 bg-transparent px-3 py-2.5 text-left font-extrabold text-slate-700 whitespace-nowrap';

const cellClass = 'border-x border-slate-200 px-3 py-2 text-slate-700';

export default AccountTransactionTable;
