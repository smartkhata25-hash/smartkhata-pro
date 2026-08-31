import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import {
  FaCalendarAlt,
  FaEdit,
  FaPlus,
  FaSearch,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { deleteExpense, getAllExpenses } from '../../services/expenseService';
import { formatDateWithOptionalTime } from '../../utils/localDateTime';
import { buildTravelRouteState } from '../../utils/travelContext';
import { hasPermission } from '../../utils/permissionHelper';
import {
  TravelFilterSelect,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  buildTravelConfirmMessage,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';

const ALL_VALUE = 'all';

const getCategoryId = (expense = {}) =>
  expense.category?._id || expense.category?.id || expense.category || '';

const getCategoryName = (expense = {}) => expense.category?.name || expense.categoryName || '-';

const getCreditAccounts = (expense = {}) => String(expense.creditAccounts || '').trim();

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();

const getDateValue = (date = '') => String(date || '').slice(0, 10);

const getDisplayDate = (expense = {}) =>
  formatDateWithOptionalTime(expense.date, expense.time) || '-';

const getExpenseDescription = (expense = {}) => expense.description || expense.title || '-';

const buildOptions = (records, getValue, getLabel) => {
  const optionMap = new Map();

  records.forEach((record) => {
    const value = String(getValue(record) || '').trim();
    const label = String(getLabel(record) || '').trim();

    if (value && label && !optionMap.has(value)) {
      optionMap.set(value, label);
    }
  });

  return Array.from(optionMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({
      value,
      label,
    }));
};

const IconButton = ({
  icon: Icon,
  title,
  variant = 'blue',
  disabled = false,
  loading = false,
  onClick,
}) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
    orange: 'from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600',
    red: 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700',
    violet: 'from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <Icon aria-hidden="true" className={loading ? 'animate-spin text-xs sm:text-sm' : 'text-xs sm:text-sm'} />
    </button>
  );
};

const CompactDateFilter = ({ value, onChange, title, variant = 'blue' }) => {
  const variants = {
    blue: 'from-cyan-500 to-blue-600 ring-cyan-100',
    violet: 'from-violet-500 to-purple-600 ring-violet-100',
  };

  return (
    <label
      title={title}
      className={`relative inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-2 transition hover:-translate-y-0.5 hover:shadow-md sm:h-9 sm:w-9 ${
        variants[variant] || variants.blue
      }`}
    >
      <FaCalendarAlt aria-hidden="true" className="text-xs sm:text-sm" />

      {value && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-white shadow" />}

      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
};

const SummaryCard = ({ label, value, variant = 'slate' }) => {
  const variants = {
    slate: 'border-slate-200 bg-white text-slate-950',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-700',
    cyan: 'border-cyan-100 bg-cyan-50/70 text-cyan-700',
  };

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${variants[variant] || variants.slate}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-normal opacity-70">{label}</p>

      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
};

const ExpenseMobileCard = ({ expense, onEdit, onDelete, canEdit, canDelete, deletingId }) => (
  <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />

    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-slate-950">
            {expense.title || getExpenseDescription(expense)}
          </p>

          <p className="mt-0.5 text-xs font-semibold text-slate-500">{getDisplayDate(expense)}</p>
        </div>

        <p className="shrink-0 text-sm font-black text-rose-700">
          {formatTravelMoney(expense.amount)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase text-slate-400">
            {t('travel.expenses.fields.category')}
          </p>

          <p className="mt-0.5 truncate text-sm font-bold text-slate-700">
            {getCategoryName(expense)}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase text-slate-400">
            {t('travel.expenses.fields.via')}
          </p>

          <p className="mt-0.5 truncate text-sm font-bold text-slate-700">
            {getCreditAccounts(expense) || expense.paymentMode || '-'}
          </p>
        </div>
      </div>

      {expense.description && (
        <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
          {expense.description}
        </p>
      )}

      {(canEdit || canDelete) && (
        <div className="mt-3 flex flex-wrap justify-end gap-1.5">
          {canEdit && (
            <IconButton
              icon={FaEdit}
              variant="orange"
              title={t('travel.common.edit')}
              onClick={() => onEdit(expense)}
            />
          )}

          {canDelete && (
            <IconButton
              icon={FaTrash}
              variant="red"
              title={t('travel.common.delete')}
              disabled={deletingId === expense._id}
              onClick={() => onDelete(expense)}
            />
          )}
        </div>
      )}
    </div>
  </article>
);

const TravelExpensesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { fetchTravelDashboardSummary } = useOutletContext() || {};

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const [filters, setFilters] = useState({
    search: '',
    categoryId: ALL_VALUE,
    account: ALL_VALUE,
    startDate: '',
    endDate: '',
  });

  const canCreate = hasPermission('expenses.create');
  const canEdit = hasPermission('expenses.edit');
  const canDelete = hasPermission('expenses.delete');

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');

      const data = await getAllExpenses({
        moduleScope: 'travel',
      });

      setExpenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Travel expenses load failed:', error);

      setExpenses([]);
      setPageError(t('travel.expenses.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const updateFilter = useCallback((key, value) => {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
    }));
  }, []);

  const categoryOptions = useMemo(
    () => [
      {
        value: ALL_VALUE,
        labelKey: 'travel.expenses.filters.allCategories',
      },
      ...buildOptions(expenses, getCategoryId, getCategoryName),
    ],
    [expenses]
  );

  const accountOptions = useMemo(() => {
    const accountRows = expenses.flatMap((expense) =>
      getCreditAccounts(expense)
        .split(',')
        .map((account) => account.trim())
        .filter(Boolean)
        .map((account) => ({
          account,
        }))
    );

    return [
      {
        value: ALL_VALUE,
        labelKey: 'travel.expenses.filters.allAccounts',
      },
      ...buildOptions(
        accountRows,
        (row) => row.account,
        (row) => row.account
      ),
    ];
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const search = normalizeText(filters.search);

    const categoryId = filters.categoryId === ALL_VALUE ? '' : String(filters.categoryId);

    const account = filters.account === ALL_VALUE ? '' : normalizeText(filters.account);

    return expenses
      .filter((expense) => expense.isDeleted !== true)
      .filter((expense) => {
        const dateValue = getDateValue(expense.date);

        const expenseCategoryId = String(getCategoryId(expense));

        const creditAccounts = normalizeText(getCreditAccounts(expense));

        if (search) {
          const searchable = [
            expense.title,
            expense.description,
            getCategoryName(expense),
            expense.paymentMode,
            getCreditAccounts(expense),
            expense.amount,
          ]
            .filter((value) => value !== undefined && value !== null)
            .join(' ')
            .toLowerCase();

          if (!searchable.includes(search)) {
            return false;
          }
        }

        if (categoryId && expenseCategoryId !== categoryId) {
          return false;
        }

        if (account && !creditAccounts.includes(account)) {
          return false;
        }

        if (filters.startDate && dateValue < filters.startDate) {
          return false;
        }

        if (filters.endDate && dateValue > filters.endDate) {
          return false;
        }

        return true;
      });
  }, [
    expenses,
    filters.account,
    filters.categoryId,
    filters.endDate,
    filters.search,
    filters.startDate,
  ]);

  const totalAmount = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [filteredExpenses]
  );

  const openExpenseForm = useCallback(
    (expense = null) => {
      navigate(expense ? `/travel/expenses/${expense._id}/edit` : '/travel/expenses/new', {
        state: buildTravelRouteState(`${location.pathname}${location.search}`),
      });
    },
    [location.pathname, location.search, navigate]
  );

  const handleDelete = useCallback(
    async (expense) => {
      const expenseLabel = expense.title || getExpenseDescription(expense);

      if (
        !window.confirm(buildTravelConfirmMessage('travel.expenses.deleteConfirm', expenseLabel))
      ) {
        return;
      }

      try {
        setDeletingId(expense._id);
        setPageError('');

        await deleteExpense(expense._id, {
          moduleScope: 'travel',
          reason: 'Travel expense reversed and archived by user',
        });

        setExpenses((current) =>
          current.filter((item) => String(item._id) !== String(expense._id))
        );

        if (typeof fetchTravelDashboardSummary === 'function') {
          await fetchTravelDashboardSummary({
            forceRefresh: true,
          });
        }
      } catch (error) {
        console.error('Travel expense delete failed:', error);

        setPageError(error?.response?.data?.message || t('travel.expenses.deleteFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [fetchTravelDashboardSummary]
  );

  const clearFilters = useCallback(() => {
    setFilters({
      search: '',
      categoryId: ALL_VALUE,
      account: ALL_VALUE,
      startDate: '',
      endDate: '',
    });
  }, []);

  return (
    <TravelMasterPageFrame
      titleKey="travel.expenses.title"
      actions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <IconButton
            icon={FaSyncAlt}
            variant="blue"
            title={t('travel.common.refresh')}
            disabled={loading}
            loading={loading}
            onClick={loadExpenses}
          />

          {canCreate && (
            <IconButton
              icon={FaPlus}
              variant="violet"
              title={t('travel.expenses.add')}
              onClick={() => openExpenseForm()}
            />
          )}
        </div>
      }
      filters={
        <TravelMasterToolbar className="lg:grid lg:grid-cols-[minmax(300px,1.6fr)_minmax(170px,auto)_minmax(170px,auto)_44px_44px_44px]">
          <label className="relative block min-w-0">
            <span className="sr-only">{t('travel.expenses.searchPlaceholder')}</span>

            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
            />

            <input
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder={t('travel.expenses.searchPlaceholder')}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <TravelFilterSelect
            value={filters.categoryId}
            onChange={(value) => updateFilter('categoryId', value)}
            options={categoryOptions}
          />

          <TravelFilterSelect
            value={filters.account}
            onChange={(value) => updateFilter('account', value)}
            options={accountOptions}
          />

          <CompactDateFilter
            value={filters.startDate}
            onChange={(value) => updateFilter('startDate', value)}
            title={t('travel.expenses.fields.dateFrom')}
            variant="blue"
          />

          <CompactDateFilter
            value={filters.endDate}
            onChange={(value) => updateFilter('endDate', value)}
            title={t('travel.expenses.fields.dateTo')}
            variant="violet"
          />

          <IconButton
            icon={FaTimes}
            variant="orange"
            title={t('travel.common.clear')}
            onClick={clearFilters}
          />
        </TravelMasterToolbar>
      }
    >
      {pageError && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      <section className="mb-3 grid grid-cols-2 gap-3 md:max-w-xl">
        <SummaryCard
          label={t('travel.expenses.summary.entries')}
          value={filteredExpenses.length.toLocaleString('en-GB')}
          variant="cyan"
        />

        <SummaryCard
          label={t('travel.expenses.summary.total')}
          value={formatTravelMoney(totalAmount)}
          variant="rose"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-12 text-center">
            <FaSyncAlt className="mx-auto mb-3 animate-spin text-xl text-cyan-600" />

            <p className="text-sm font-semibold text-slate-500">{t('travel.common.loading')}</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-slate-500">{t('travel.expenses.empty')}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-100 text-xs font-extrabold uppercase text-slate-600">
                    <th className="w-[16%] border border-slate-300 px-3 py-3">
                      {t('travel.fields.date')}
                    </th>

                    <th className="w-[18%] border border-slate-300 px-3 py-3">
                      {t('travel.expenses.fields.category')}
                    </th>

                    <th className="w-[28%] border border-slate-300 px-3 py-3">
                      {t('travel.expenses.fields.description')}
                    </th>

                    <th className="w-[20%] border border-slate-300 px-3 py-3">
                      {t('travel.expenses.fields.via')}
                    </th>

                    <th className="w-[12%] border border-slate-300 px-3 py-3 text-right">
                      {t('travel.expenses.fields.amount')}
                    </th>

                    <th className="w-[10%] border border-slate-300 px-3 py-3 text-center">
                      {t('travel.fields.actions')}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr
                      key={expense._id}
                      className="transition odd:bg-white even:bg-slate-50/50 hover:bg-cyan-50/70"
                    >
                      <td className="border border-slate-200 px-3 py-3 align-top font-semibold text-slate-700">
                        {getDisplayDate(expense)}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 align-top font-bold text-slate-700">
                        {getCategoryName(expense)}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 align-top">
                        <p className="line-clamp-2 font-semibold text-slate-700">
                          {getExpenseDescription(expense)}
                        </p>
                      </td>

                      <td className="border border-slate-200 px-3 py-3 align-top font-semibold text-slate-600">
                        {getCreditAccounts(expense) || expense.paymentMode || '-'}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-right align-top font-black text-rose-700">
                        {formatTravelMoney(expense.amount)}
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center align-top">
                        <div className="flex max-w-full flex-nowrap justify-center gap-1.5">
                          {canEdit && (
                            <IconButton
                              icon={FaEdit}
                              variant="orange"
                              title={t('travel.common.edit')}
                              onClick={() => openExpenseForm(expense)}
                            />
                          )}

                          {canDelete && (
                            <IconButton
                              icon={FaTrash}
                              variant="red"
                              title={t('travel.common.delete')}
                              disabled={deletingId === expense._id}
                              onClick={() => handleDelete(expense)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="bg-cyan-50">
                    <td
                      colSpan={4}
                      className="border border-slate-200 px-3 py-3 text-right text-sm font-extrabold text-slate-700"
                    >
                      {t('travel.expenses.summary.total')}
                    </td>

                    <td className="border border-slate-200 px-3 py-3 text-right text-base font-black text-rose-700">
                      {formatTravelMoney(totalAmount)}
                    </td>

                    <td className="border border-slate-200" />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="space-y-2 bg-slate-50/50 p-2 md:hidden">
              {filteredExpenses.map((expense) => (
                <ExpenseMobileCard
                  key={expense._id}
                  expense={expense}
                  onEdit={openExpenseForm}
                  onDelete={handleDelete}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  deletingId={deletingId}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </TravelMasterPageFrame>
  );
};

export default TravelExpensesPage;
