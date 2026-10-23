import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { formatMoneyDisplay } from '../utils/money';
import { getAllExpenses, deleteExpense } from '../services/expenseService';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { formatBusinessDateForDisplay, getBusinessDateInputValue } from '../utils/localDateTime';
import { FaEdit, FaTrash } from 'react-icons/fa';
import { formatInstallmentsDisplayRef } from '../utils/installmentsDisplay';
import InstallmentsDialog from './installments/InstallmentsDialog';

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [installmentsDialog, setInstallmentsDialog] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    fromDate: '',
    toDate: '',
    category: '',
    paymentMode: '',
    accountId: '',
    staffId: '',
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const queryModuleScope = String(searchParams.get('moduleScope') || '').toLowerCase();
  const requestedModuleScope =
    location.pathname.startsWith('/installments/expenses') || queryModuleScope === 'installments'
      ? 'installments'
      : location.pathname.startsWith('/weaving/expenses') || queryModuleScope === 'weaving'
      ? 'weaving'
      : location.pathname.startsWith('/travel/expenses') || queryModuleScope === 'travel'
        ? 'travel'
        : 'trading';
  const isTravelExpenseView = requestedModuleScope === 'travel';
  const isWeavingExpenseView = requestedModuleScope === 'weaving';
  const isInstallmentsExpenseView = requestedModuleScope === 'installments';
  const scopedExpenseParams = useMemo(
    () => (requestedModuleScope === 'trading' ? {} : { moduleScope: requestedModuleScope }),
    [requestedModuleScope]
  );

  const canViewExpenses = hasPermission(isInstallmentsExpenseView ? 'installments.expenses.view' : 'expenses.view');
  const canCreateExpenses = hasPermission(isInstallmentsExpenseView ? 'installments.expenses.create' : 'expenses.create');
  const canEditExpenses = !isInstallmentsExpenseView && hasPermission('expenses.edit');
  const canDeleteExpenses = hasPermission(isInstallmentsExpenseView ? 'installments.expenses.archive' : 'expenses.delete');

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      fromDate: '',
      toDate: '',
      category: '',
      paymentMode: '',
      accountId: '',
      staffId: '',
    });
  };

  const getExpenseCategoryValue = (expense) =>
    String(expense?.category?._id || expense?.category?.name || expense?.category || '');

  const categoryOptions = useMemo(() => {
    const options = new Map();

    expenses.forEach((expense) => {
      const value = getExpenseCategoryValue(expense);
      const label = expense?.category?.name || value;

      if (value && label) {
        options.set(value, label);
      }
    });

    return Array.from(options, ([value, label]) => ({
      value,
      label,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [expenses]);

  const paymentModeOptions = useMemo(() => {
    return Array.from(
      new Set(expenses.map((expense) => String(expense?.paymentMode || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [expenses]);
  const paymentAccountOptions = useMemo(() => Array.from(new Map(expenses.flatMap((expense) => expense.paymentAccounts || []).map((account) => [account._id, account])).values()), [expenses]);
  const staffOptions = useMemo(() => Array.from(new Map(expenses.map((expense) => expense.createdBy).filter(Boolean).map((staff) => [staff._id, staff])).values()), [expenses]);

  const filteredExpenses = useMemo(() => {
    const searchText = filters.search.trim().toLowerCase();

    const paymentMode = filters.paymentMode.trim().toLowerCase();

    return expenses.filter((expense) => {
      if (filters.category && getExpenseCategoryValue(expense) !== filters.category) {
        return false;
      }

      if (
        paymentMode &&
        String(expense?.paymentMode || '')
          .trim()
          .toLowerCase() !== paymentMode
      ) {
        return false;
      }

      if (filters.fromDate || filters.toDate) {
        if (!expense?.date) {
          return false;
        }

        const expenseDate = getBusinessDateInputValue(expense.date);

        if (filters.fromDate && expenseDate < filters.fromDate) {
          return false;
        }

        if (filters.toDate && expenseDate > filters.toDate) {
          return false;
        }
      }

      if (!searchText) {
        return true;
      }

      const searchable = [
        expense?.title,
        expense?.category?.name,
        expense?.paymentMode,
        expense?.creditAccounts,
        expense?.amount,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(searchText);
    });
  }, [expenses, filters]);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => String(value || '').trim()),
    [filters]
  );

  const fetchData = useCallback(async () => {
    if (!canViewExpenses) {
      setLoading(false);
      return;
    }

    try {
      const data = await getAllExpenses(isInstallmentsExpenseView ? { ...scopedExpenseParams, ...filters, page, limit: 25 } : scopedExpenseParams);
      setExpenses(Array.isArray(data) ? data : data.rows || []);
      if (!Array.isArray(data)) setPagination({ page: data.page || 1, pages: data.pages || 1, total: data.total || 0 });
    } catch (err) {
      if (isInstallmentsExpenseView) setInstallmentsDialog({ type: 'error', message: t('alerts.expenseLoadError') });
      else alert(t('alerts.expenseLoadError'));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [canViewExpenses, scopedExpenseParams, isInstallmentsExpenseView, filters, page]);

  useEffect(() => {
    if (!canViewExpenses) {
      navigate(isInstallmentsExpenseView ? '/installments/dashboard' : '/dashboard');
      return;
    }

    fetchData();
  }, [canViewExpenses, navigate, fetchData, isInstallmentsExpenseView]);

  const handleDelete = async (id) => {
    if (!canDeleteExpenses) {
      if (isInstallmentsExpenseView) setInstallmentsDialog({ type: 'error', message: 'You do not have permission to delete expenses' });
      else alert('You do not have permission to delete expenses');
      return;
    }

    if (isInstallmentsExpenseView) { setInstallmentsDialog({ type: 'warning', message: t('installments.expenses.confirmArchive'), inputLabel: t('installments.expenses.archiveReason'), inputValue: '', inputRequired: true, expenseId: id }); return; }
    if (!window.confirm(t('alerts.confirmDeleteExpense'))) return;

    try {
      await deleteExpense(id, scopedExpenseParams);

      fetchData();
    } catch (err) {
      alert(t('alerts.expenseDeleteFailed'));
    }
  };

  const confirmInstallmentsArchive = async () => {
    const pending = installmentsDialog;
    if (!pending?.expenseId || !String(pending.inputValue || '').trim()) return;
    try { await deleteExpense(pending.expenseId, { ...scopedExpenseParams, reason: pending.inputValue.trim() }); setInstallmentsDialog(null); fetchData(); }
    catch (err) { setInstallmentsDialog({ type: 'error', message: t('alerts.expenseDeleteFailed') }); }
  };

  const formatMobileDate = (value) => {
    if (!value) {
      return '-';
    }

    const businessDate = getBusinessDateInputValue(value);

    const match = String(businessDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      const [, year, month, day] = match;

      return `${day}/${month}/${year.slice(-2)}`;
    }

    return formatBusinessDateForDisplay(value);
  };

  return (
    <div className="expense-list-page p-2 sm:p-4 md:p-6 bg-white rounded shadow-md min-w-0 overflow-hidden">
      {isInstallmentsExpenseView && <InstallmentsDialog open={Boolean(installmentsDialog)} type={installmentsDialog?.type || 'error'} message={installmentsDialog?.message} inputLabel={installmentsDialog?.inputLabel} inputValue={installmentsDialog?.inputValue || ''} inputRequired={installmentsDialog?.inputRequired} onInputChange={(value) => setInstallmentsDialog((current) => ({ ...current, inputValue: value }))} cancelLabel={installmentsDialog?.expenseId ? t('cancel') : ''} confirmLabel={installmentsDialog?.expenseId ? t('installments.committees.management.archive') : undefined} onClose={() => setInstallmentsDialog(null)} onConfirm={installmentsDialog?.expenseId ? confirmInstallmentsArchive : () => setInstallmentsDialog(null)} />}
      <style>{`
        .expense-list-page,
        .expense-list-page *,
        .expense-list-page *::before,
        .expense-list-page *::after {
          box-sizing: border-box;
        }

        @media (max-width: 767px) {
          .expense-filter-control {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: 36px !important;
            min-height: 36px !important;
            padding: 5px 8px !important;
            font-size: 12px !important;
            line-height: 18px !important;
            color: #334155 !important;
            background-color: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 6px !important;
          }

          select.expense-filter-control {
            -webkit-appearance: menulist !important;
            appearance: auto !important;
          }

          .expense-filter-top-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 64px 64px !important;
            gap: 6px !important;
            align-items: center !important;
          }

          .expense-filter-bottom-row {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 74px !important;
            gap: 6px !important;
            align-items: center !important;
          }

          .expense-date-compact {
            width: 64px !important;
            min-width: 64px !important;
            max-width: 64px !important;
            padding: 4px !important;
            text-indent: -9999px !important;
            position: relative !important;
          }

          .expense-date-compact::-webkit-calendar-picker-indicator {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            cursor: pointer !important;
            opacity: 1 !important;
          }

          .expense-clear-btn {
            height: 36px !important;
            min-height: 36px !important;
            padding: 4px 8px !important;
            font-size: 11px !important;
            white-space: nowrap !important;
          }

          .expense-mobile-table {
            min-width: 720px !important;
            font-size: 10px !important;
          }

          .expense-mobile-table th,
          .expense-mobile-table td {
            padding: 5px 4px !important;
            line-height: 14px !important;
          }

          .expense-date-col {
            width: 76px !important;
            min-width: 76px !important;
          }

          .expense-title-col {
            width: 125px !important;
            min-width: 125px !important;
          }

          .expense-category-col {
            width: 120px !important;
            min-width: 120px !important;
          }

          .expense-mode-col {
            width: 82px !important;
            min-width: 82px !important;
          }

          .expense-account-col {
            width: 115px !important;
            min-width: 115px !important;
          }

          .expense-amount-col {
            width: 82px !important;
            min-width: 82px !important;
          }

          .expense-actions-col {
            width: 72px !important;
            min-width: 72px !important;
          }
        }

        @media (max-width: 380px) {
          .expense-filter-top-row {
            grid-template-columns: minmax(0, 1fr) 58px 58px !important;
          }

          .expense-filter-bottom-row {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 68px !important;
          }

          .expense-date-compact {
            width: 58px !important;
            min-width: 58px !important;
            max-width: 58px !important;
          }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <h2 className="text-base md:text-xl font-bold">
          {t(
            isWeavingExpenseView
              ? 'weaving.sidebar.expenses'
              : isInstallmentsExpenseView
                ? 'installments.expenses.title'
              : isTravelExpenseView
                ? 'travel.reports.expenses.title'
                : 'expense.allExpenses'
          )}
        </h2>

        {canCreateExpenses && (
          <button
            type="button"
            onClick={() =>
              navigate(
                isWeavingExpenseView
                  ? '/weaving/expenses/new'
                  : isInstallmentsExpenseView
                    ? '/installments/expenses/new'
                  : isTravelExpenseView
                    ? '/travel/expenses/new'
                    : '/add-expense'
              )
            }
            className="w-full sm:w-auto bg-blue-600 text-white px-3 py-2 md:px-4 rounded text-sm md:text-base"
          >
            + {t('expense.new')}
          </button>
        )}
      </div>

      {/* MOBILE FILTERS */}
      <div className="md:hidden mb-3 space-y-2">
        <div className="expense-filter-top-row">
          <input
            type="text"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder={t('common.search')}
            className="expense-filter-control"
          />

          <input
            type="date"
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={(event) => updateFilter('fromDate', event.target.value)}
            className="expense-filter-control expense-date-compact"
            aria-label="From Date"
            title="From Date"
          />

          <input
            type="date"
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={(event) => updateFilter('toDate', event.target.value)}
            className="expense-filter-control expense-date-compact"
            aria-label="To Date"
            title="To Date"
          />
        </div>

        <div className="expense-filter-bottom-row">
          {!isInstallmentsExpenseView && <select
            value={filters.category}
            onChange={(event) => updateFilter('category', event.target.value)}
            className="expense-filter-control"
          >
            <option value="">Category</option>

            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>}

          <select
            value={filters.paymentMode}
            onChange={(event) => updateFilter('paymentMode', event.target.value)}
            className="expense-filter-control"
          >
            <option value="">Payment Mode</option>

            {paymentModeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>

          {isInstallmentsExpenseView && <select value={filters.accountId} onChange={(event) => updateFilter('accountId', event.target.value)} className="expense-filter-control"><option value="">{t('installments.reports.allAccounts')}</option>{paymentAccountOptions.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="expense-clear-btn border border-gray-300 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🧹 Clear
          </button>
        </div>
      </div>

      {/* DESKTOP FILTERS */}
      <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4">
        <input
          type="text"
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
          placeholder={t('common.search')}
          className="min-w-0 border border-gray-300 rounded p-2 text-sm"
        />

        <input
          type="date"
          value={filters.fromDate}
          max={filters.toDate || undefined}
          onChange={(event) => updateFilter('fromDate', event.target.value)}
          className="min-w-0 border border-gray-300 rounded p-2 text-sm"
        />

        <input
          type="date"
          value={filters.toDate}
          min={filters.fromDate || undefined}
          onChange={(event) => updateFilter('toDate', event.target.value)}
          className="min-w-0 border border-gray-300 rounded p-2 text-sm"
        />

        {!isInstallmentsExpenseView && <select
          value={filters.category}
          onChange={(event) => updateFilter('category', event.target.value)}
          className="min-w-0 border border-gray-300 rounded bg-white p-2 text-sm"
        >
          <option value="">Category</option>

          {categoryOptions.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>}

        <select
          value={filters.paymentMode}
          onChange={(event) => updateFilter('paymentMode', event.target.value)}
          className="min-w-0 border border-gray-300 rounded bg-white p-2 text-sm"
        >
          <option value="">{t('expense.paymentMode')}</option>

          {paymentModeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>

        {isInstallmentsExpenseView && <select value={filters.accountId} onChange={(event) => updateFilter('accountId', event.target.value)} className="min-w-0 border border-gray-300 rounded bg-white p-2 text-sm"><option value="">{t('installments.reports.allAccounts')}</option>{paymentAccountOptions.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}

        {isInstallmentsExpenseView && <select value={filters.staffId} onChange={(event) => updateFilter('staffId', event.target.value)} className="min-w-0 border border-gray-300 rounded bg-white p-2 text-sm"><option value="">{t('installments.reports.allStaff')}</option>{staffOptions.map((staff) => <option key={staff._id} value={staff._id}>{staff.name || staff.email}</option>)}</select>}

        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🧹 {t('clear')}
        </button>
      </div>

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2 text-sm text-gray-600">
            <span>
              {t('expense.allExpenses')}: {filteredExpenses.length}
              {filteredExpenses.length !== expenses.length ? ` / ${expenses.length}` : ''}
            </span>
          </div>

          <div
            className="w-full overflow-x-auto"
            style={{
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <table className="expense-mobile-table w-full min-w-[720px] md:min-w-full text-[11px] sm:text-xs md:text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="expense-date-col px-1.5 py-1 md:p-2 border">{t('common.date')}</th>

                  <th className="expense-title-col px-1.5 py-1 md:p-2 border">
                    {t('common.title')}
                  </th>

                  <th className="expense-category-col px-1.5 py-1 md:p-2 border">Category</th>

                  {!isInstallmentsExpenseView && <th className="expense-mode-col px-1.5 py-1 md:p-2 border">
                    <span className="hidden sm:inline">{t('expense.paymentMode')}</span>
                    <span className="sm:hidden">Mode</span>
                  </th>}

                  <th className="expense-account-col px-1.5 py-1 md:p-2 border">
                    <span className="hidden sm:inline">{t('expense.creditAccounts')}</span>
                    <span className="sm:hidden">Account</span>
                  </th>

                  <th className="expense-amount-col px-1.5 py-1 md:p-2 border">
                    <span className="hidden sm:inline">{t('common.amount')}</span>
                    <span className="sm:hidden">Amt.</span>
                  </th>

                  {isInstallmentsExpenseView && <><th className="px-1.5 py-1 md:p-2 border">{t('installments.reports.reference')}</th><th className="px-1.5 py-1 md:p-2 border">{t('description')}</th><th className="px-1.5 py-1 md:p-2 border">{t('installments.reports.enteredBy')}</th><th className="px-1.5 py-1 md:p-2 border">{t('status')}</th></>}

                  <th className="expense-actions-col px-1.5 py-1 md:p-2 border">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredExpenses.map((e) => (
                  <tr key={e._id} className="text-center hover:bg-gray-50">
                    <td className="expense-date-col px-1.5 py-1 md:p-2 border whitespace-nowrap">
                      <span className="md:hidden">{formatMobileDate(e.date)}</span>

                      <span className="hidden md:inline">
                        {formatBusinessDateForDisplay(e.date)}
                      </span>
                    </td>

                    <td className="expense-title-col px-1.5 py-1 md:p-2 border break-words">
                      {e.title || '-'}
                    </td>

                    <td className="expense-category-col px-1.5 py-1 md:p-2 border break-words">
                      {e.category?.name || '-'}
                    </td>

                    {!isInstallmentsExpenseView && <td className="expense-mode-col px-1.5 py-1 md:p-2 border capitalize break-words">
                      {e.paymentMode || '-'}
                    </td>}

                    <td className="expense-account-col px-1.5 py-1 md:p-2 border break-words">
                      {e.creditAccounts || '-'}
                    </td>

                    <td className="expense-amount-col px-1.5 py-1 md:p-2 border whitespace-nowrap">
                      {formatMoneyDisplay(e.amount)}
                    </td>

                    {isInstallmentsExpenseView && <><td className="px-1.5 py-1 md:p-2 border whitespace-nowrap">{formatInstallmentsDisplayRef(e.referenceNumber, 'reference') || '-'}</td><td className="max-w-52 truncate px-1.5 py-1 md:p-2 border">{e.description || '-'}</td><td className="px-1.5 py-1 md:p-2 border">{e.createdBy?.name || e.createdBy?.email || '-'}</td><td className="px-1.5 py-1 md:p-2 border capitalize">{e.isReversed ? 'reversed' : 'posted'}</td></>}

                    <td className="expense-actions-col px-1.5 py-1 md:p-2 border">
                      <div className="flex gap-1 md:gap-2 justify-center items-center">
                        {canEditExpenses && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                isWeavingExpenseView
                                  ? `/weaving/expenses/${e._id}/edit`
                                  : isTravelExpenseView
                                  ? `/travel/expenses/${e._id}/edit`
                                  : `/edit-expense/${e._id}`
                              )
                            }
                            className="inline-flex h-7 w-7 md:h-auto md:w-auto items-center justify-center bg-yellow-500 text-white p-0 md:px-3 md:py-1 rounded text-xs md:text-sm"
                            title={t('common.edit')}
                            aria-label={t('common.edit')}
                          >
                            <FaEdit className="md:hidden" aria-hidden="true" />
                            <span className="hidden md:inline">{t('common.edit')}</span>
                          </button>
                        )}

                        {canDeleteExpenses && (
                          <button
                            type="button"
                            onClick={() => handleDelete(e._id)}
                            className="inline-flex h-7 w-7 md:h-auto md:w-auto items-center justify-center bg-red-600 text-white p-0 md:px-3 md:py-1 rounded text-xs md:text-sm"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                          >
                            <FaTrash className="md:hidden" aria-hidden="true" />
                            <span className="hidden md:inline">{t('common.delete')}</span>
                          </button>
                        )}

                        {!canEditExpenses && !canDeleteExpenses && (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={isInstallmentsExpenseView ? 10 : 7} className="text-center p-4">
                      {t('expense.noneFound')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {isInstallmentsExpenseView && pagination.pages > 1 && <div className="mt-3 flex items-center justify-between text-sm"><span>{pagination.total} {t('installments.expenses.records')}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border px-3 py-1 disabled:opacity-40">{t('previous')}</button><span className="px-2 py-1">{page} / {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">{t('next')}</button></div></div>}
        </>
      )}
    </div>
  );
};

export default ExpenseList;
