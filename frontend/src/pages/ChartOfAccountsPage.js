import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaBook, FaEdit, FaPlus, FaSearch, FaTrash, FaUniversity, FaWallet } from 'react-icons/fa';

import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../services/accountService';
import { t } from '../i18n/i18n';
import { buildTravelRouteState } from '../utils/travelContext';

const MODULE_SCOPES = Object.freeze({
  TRADING: 'trading',
  TRAVEL: 'travel',
  BOTH: 'both',
});

const pageSize = 10;

const categoryTypeMap = {
  cash: 'Asset',
  bank: 'Asset',
  online: 'Asset',
  cheque: 'Asset',
  inventory: 'Asset',
  receivable: 'Asset',
  prepaid: 'Asset',
  fixed: 'Asset',
  payable: 'Liability',
  credit: 'Liability',
  loan: 'Liability',
  tax: 'Liability',
  capital: 'Equity',
  drawings: 'Equity',
  sales: 'Income',
  service: 'Income',
  discount_income: 'Income',
  other_income: 'Income',
  purchase: 'Expense',
  salary: 'Expense',
  rent: 'Expense',
  utility: 'Expense',
  transport: 'Expense',
  marketing: 'Expense',
  maintenance: 'Expense',
  other_expense: 'Expense',
};

const categoryGroups = [
  {
    label: 'Assets',
    options: ['cash', 'bank', 'online', 'cheque', 'inventory', 'receivable', 'prepaid', 'fixed'],
  },
  {
    label: 'Liabilities',
    options: ['payable', 'credit', 'loan', 'tax'],
  },
  {
    label: 'Equity',
    options: ['capital', 'drawings'],
  },
  {
    label: 'Income',
    options: ['sales', 'service', 'discount_income', 'other_income'],
  },
  {
    label: 'Expenses',
    options: [
      'purchase',
      'salary',
      'rent',
      'utility',
      'transport',
      'marketing',
      'maintenance',
      'other_expense',
    ],
  },
];

const getPageScope = (location) => {
  if (location.pathname.startsWith('/travel/accounts')) {
    return MODULE_SCOPES.TRAVEL;
  }

  const params = new URLSearchParams(location.search);

  return params.get('moduleScope') === MODULE_SCOPES.TRAVEL
    ? MODULE_SCOPES.TRAVEL
    : MODULE_SCOPES.TRADING;
};

const buildEmptyForm = (moduleScope) => ({
  name: '',
  type: 'Asset',
  code: '',
  category: '',
  moduleScope,
});

const normalizeScope = (scope, fallback = MODULE_SCOPES.TRADING) =>
  Object.values(MODULE_SCOPES).includes(String(scope || '').toLowerCase())
    ? String(scope || '').toLowerCase()
    : fallback;

const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const scopeLabel = (scope) => {
  const normalized = normalizeScope(scope);

  if (normalized === MODULE_SCOPES.TRAVEL) return t('moduleScope.travel');
  if (normalized === MODULE_SCOPES.BOTH) return t('moduleScope.both');

  return t('moduleScope.trading');
};

const accountToneClass = (type) => {
  const tones = {
    Asset: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Liability: 'bg-rose-50 text-rose-700 ring-rose-200',
    Equity: 'bg-violet-50 text-violet-700 ring-violet-200',
    Income: 'bg-blue-50 text-blue-700 ring-blue-200',
    Expense: 'bg-amber-50 text-amber-700 ring-amber-200',
  };

  return tones[type] || 'bg-slate-50 text-slate-700 ring-slate-200';
};

const ChartOfAccountsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const pageModuleScope = getPageScope(location);
  const isTravelScoped = pageModuleScope === MODULE_SCOPES.TRAVEL;

  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(buildEmptyForm(pageModuleScope));
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);

      const data = await getAccounts(true, {
        moduleScope: pageModuleScope,
      });

      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(t('alerts.accountsFetchError'), err);
    } finally {
      setLoading(false);
    }
  }, [pageModuleScope]);

  useEffect(() => {
    setForm(buildEmptyForm(pageModuleScope));
    setEditId(null);
    setShowForm(false);
    fetchAccounts();
  }, [fetchAccounts, pageModuleScope]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'category') {
      const autoType = categoryTypeMap[value] || 'Asset';

      setForm((previous) => ({
        ...previous,
        category: value,
        type: autoType,
      }));

      return;
    }

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(buildEmptyForm(pageModuleScope));
    setEditId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      ...form,
      moduleScope: normalizeScope(form.moduleScope, pageModuleScope),
    };

    try {
      if (editId) {
        await updateAccount(editId, payload, {
          moduleScope: pageModuleScope,
        });

        alert(t('alerts.accountUpdated'));
      } else {
        await createAccount(payload, {
          moduleScope: pageModuleScope,
        });

        alert(t('alerts.accountCreated'));
      }

      setShowForm(false);
      resetForm();
      fetchAccounts();
    } catch (err) {
      const msg =
        err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown error';

      setError(msg);
    }
  };

  const handleEdit = (account) => {
    setForm({
      name: account.name || '',
      type: account.type || 'Asset',
      code: account.code || '',
      category: account.category || '',
      moduleScope: normalizeScope(account.moduleScope, pageModuleScope),
    });

    setEditId(account._id);
    setShowForm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?._id) return;

    try {
      await deleteAccount(deleteTarget._id, {
        moduleScope: pageModuleScope,
      });

      setDeleteTarget(null);
      fetchAccounts();

      alert(t('alerts.accountDeleted'));
    } catch (err) {
      alert(err.response?.data?.message || t('alerts.accountDeleteFailed'));
    }
  };

  const filtered = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return accounts.filter((account) => {
      const matchSearch =
        !normalizedSearch ||
        [account.name, account.code, account.type, account.category, account.moduleScope]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);

      const matchType = filterType ? account.type === filterType : true;

      const matchCategory = filterCategory ? account.category === filterCategory : true;

      return matchSearch && matchType && matchCategory;
    });
  }, [accounts, filterCategory, filterType, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType, filterCategory]);

  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);

  const paginatedAccounts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalAccounts = filtered.length;

  const systemAccounts = filtered.filter((account) => account.isSystem).length;

  const userAccounts = filtered.filter((account) => !account.isSystem).length;

  const pageTitle = isTravelScoped ? t('travel.sidebar.accounts') : t('accounts.chartTitle');

  const headerClass = isTravelScoped
    ? 'border-cyan-200 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-900 text-white'
    : 'border-blue-200 bg-gradient-to-r from-blue-700 to-blue-900 text-white';

  const primaryButtonClass = isTravelScoped
    ? 'bg-cyan-500 text-white hover:bg-cyan-600 focus-visible:outline-cyan-300'
    : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-300';

  const openCash = () => {
    const path = isTravelScoped ? '/travel/accounts/cash' : '/accounts/cash';

    navigate(
      path,
      isTravelScoped
        ? {
            state: buildTravelRouteState('/travel/accounts'),
          }
        : undefined
    );
  };

  const openBank = () => {
    const path = isTravelScoped ? '/travel/accounts/bank' : '/accounts/bank';

    navigate(
      path,
      isTravelScoped
        ? {
            state: buildTravelRouteState('/travel/accounts'),
          }
        : undefined
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-2 sm:p-3 lg:p-4">
      {/* COMPACT HEADER */}
      <section
        className={`flex-shrink-0 rounded-lg border px-3 py-2.5 shadow-sm sm:px-4 sm:py-3 ${headerClass}`}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* TITLE */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15 sm:inline-flex">
              <FaBook aria-hidden="true" className="text-sm" />
            </span>

            <h1 className="min-w-0 truncate text-base font-extrabold sm:text-lg lg:text-xl">
              {pageTitle}
            </h1>
          </div>

          {/* ACTION ICONS */}
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              title={showForm ? t('close') : t('accounts.addAccount')}
              aria-label={showForm ? t('close') : t('accounts.addAccount')}
              onClick={() => {
                setShowForm((previous) => !previous);

                if (!showForm) {
                  resetForm();
                }
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-9 sm:w-9 ${primaryButtonClass}`}
            >
              <FaPlus
                aria-hidden="true"
                className={`transition-transform ${showForm ? 'rotate-45' : ''}`}
              />
            </button>

            <button
              type="button"
              title={t('accounts.cashAccounts')}
              aria-label={t('accounts.cashAccounts')}
              onClick={openCash}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-sm text-white transition hover:bg-white/20 sm:h-9 sm:w-9"
            >
              <FaWallet aria-hidden="true" />
            </button>

            <button
              type="button"
              title={t('accounts.bankAccounts')}
              aria-label={t('accounts.bankAccounts')}
              onClick={openBank}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-sm text-white transition hover:bg-white/20 sm:h-9 sm:w-9"
            >
              <FaUniversity aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* COMPACT COUNTERS */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
          {[
            {
              label: t('total'),
              value: totalAccounts,
            },
            {
              label: t('accounts.system'),
              value: systemAccounts,
            },
            {
              label: t('accounts.user'),
              value: userAccounts,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 items-center justify-center gap-1.5 rounded-md bg-white/10 px-2 py-1.5 ring-1 ring-white/10 sm:gap-2"
            >
              <span className="truncate text-[10px] font-bold uppercase text-white/70 sm:text-xs">
                {item.label}
              </span>

              <span className="flex-shrink-0 text-sm font-extrabold text-white sm:text-base">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ERROR */}
      {error && (
        <div className="mt-2 flex-shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* ADD / EDIT FORM */}
      {showForm && (
        <section className="mt-3 flex-shrink-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h2 className="text-base font-extrabold text-slate-900">
            {editId ? t('accounts.editAccount') : t('accounts.addNewAccount')}
          </h2>

          <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-bold text-slate-700">
              <span>{t('accounts.accountName')}</span>

              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder={t('accounts.accountNameExample')}
                required
                className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="space-y-1.5 text-sm font-bold text-slate-700">
              <span>{t('accounts.accountCode')}</span>

              <input
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder={t('accounts.accountCodeExample')}
                required
                disabled={Boolean(editId)}
                className="min-h-10 w-full rounded-md border border-slate-300 px-3 py-2 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>

            <label className="space-y-1.5 text-sm font-bold text-slate-700">
              <span>{t('accounts.accountType')}</span>

              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                disabled
                className="min-h-10 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 font-medium text-slate-600"
              >
                <option value="Asset">{t('accounts.type.asset')}</option>

                <option value="Liability">{t('accounts.type.liability')}</option>

                <option value="Equity">{t('accounts.type.equity')}</option>

                <option value="Income">{t('accounts.type.income')}</option>

                <option value="Expense">{t('accounts.type.expense')}</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-bold text-slate-700">
              <span>{t('inventory.category')}</span>

              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                required
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{t('accounts.selectCategory')}</option>

                {categoryGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((category) => (
                      <option key={category} value={category}>
                        {t(
                          `accounts.category.${
                            category === 'discount_income'
                              ? 'discount'
                              : category === 'other_income'
                                ? 'otherIncome'
                                : category === 'other_expense'
                                  ? 'otherExpense'
                                  : category
                          }`
                        )}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-bold text-slate-700 md:col-span-2">
              <span>{t('accounts.availableIn')}</span>

              <select
                name="moduleScope"
                value={form.moduleScope}
                onChange={handleChange}
                className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value={MODULE_SCOPES.TRADING}>{t('moduleScope.trading')}</option>

                <option value={MODULE_SCOPES.TRAVEL}>{t('moduleScope.travel')}</option>

                <option value={MODULE_SCOPES.BOTH}>{t('moduleScope.both')}</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button
                type="submit"
                className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-extrabold transition ${primaryButtonClass}`}
              >
                {editId ? t('accounts.updateAccount') : t('accounts.addAccount')}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                {t('clear')}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* SEARCH / FILTERS */}
      <section className="mt-3 flex-shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <label className="relative block sm:col-span-2 md:col-span-1">
            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
            />

            <input
              type="text"
              placeholder={t('accounts.searchAccounts')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{t('accounts.allTypes')}</option>

            <option value="Asset">{t('accounts.type.asset')}</option>

            <option value="Liability">{t('accounts.type.liability')}</option>

            <option value="Equity">{t('accounts.type.equity')}</option>

            <option value="Income">{t('accounts.type.income')}</option>

            <option value="Expense">{t('accounts.type.expense')}</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{t('accounts.allCategories')}</option>

            <option value="cash">{t('accounts.category.cash')}</option>

            <option value="bank">{t('accounts.category.bank')}</option>

            <option value="online">{t('accounts.category.online')}</option>

            <option value="cheque">{t('accounts.category.cheque')}</option>

            <option value="credit">{t('accounts.category.credit')}</option>

            <option value="other">{t('accounts.category.other')}</option>
          </select>
        </div>
      </section>

      {/* ACCOUNT LIST */}
      <section className="mt-3 min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-sm font-semibold text-slate-500">
            {t('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center text-sm font-semibold text-slate-500">
            {t('accounts.noAccounts')}
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
              <div className="h-full overflow-auto">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr className="text-left text-xs uppercase tracking-normal text-slate-500">
                      <th className="px-4 py-3">{t('accounts.code')}</th>

                      <th className="px-4 py-3">{t('accounts.accountName')}</th>

                      <th className="px-4 py-3">{t('accounts.type')}</th>

                      <th className="px-4 py-3">{t('inventory.category')}</th>

                      <th className="px-4 py-3">{t('accounts.availableIn')}</th>

                      <th className="px-4 py-3 text-right">{t('accounts.balance')}</th>

                      <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedAccounts.map((account) => (
                      <tr key={account._id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-extrabold text-slate-800">{account.code}</td>

                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-950">{account.name}</div>

                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            {account.isSystem ? t('accounts.system') : t('accounts.user')}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ${accountToneClass(
                              account.type
                            )}`}
                          >
                            {account.type}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-semibold capitalize text-slate-600">
                          {account.category}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                            {scopeLabel(account.moduleScope)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                          Rs. {formatMoney(account.balance)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={account.isSystem}
                              onClick={() => handleEdit(account)}
                              className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <FaEdit aria-hidden="true" />
                              {t('edit')}
                            </button>

                            <button
                              type="button"
                              disabled={account.isSystem}
                              onClick={() => setDeleteTarget(account)}
                              className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <FaTrash aria-hidden="true" />
                              {t('delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MOBILE CARDS - SCROLLABLE */}
            <div
              className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1 md:hidden"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
              }}
            >
              <div className="space-y-2 pb-3">
                {paginatedAccounts.map((account) => (
                  <article
                    key={account._id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-slate-950 sm:text-base">
                          {account.name}
                        </p>

                        <p className="mt-0.5 truncate text-[11px] font-bold uppercase text-slate-400">
                          {account.code}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-extrabold ring-1 ${accountToneClass(
                          account.type
                        )}`}
                      >
                        {account.type}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                      <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="truncate text-[10px] font-bold uppercase text-slate-400">
                          {t('inventory.category')}
                        </p>

                        <p className="mt-0.5 truncate font-bold capitalize text-slate-800">
                          {account.category || '-'}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="truncate text-[10px] font-bold uppercase text-slate-400">
                          {t('accounts.availableIn')}
                        </p>

                        <p className="mt-0.5 truncate font-bold text-slate-800">
                          {scopeLabel(account.moduleScope)}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="truncate text-[10px] font-bold uppercase text-slate-400">
                          {t('accounts.system')}
                        </p>

                        <p className="mt-0.5 truncate font-bold text-slate-800">
                          {account.isSystem ? t('accounts.system') : t('accounts.user')}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="truncate text-[10px] font-bold uppercase text-slate-400">
                          {t('accounts.balance')}
                        </p>

                        <p className="mt-0.5 truncate font-extrabold text-slate-900">
                          Rs. {formatMoney(account.balance)}
                        </p>
                      </div>
                    </div>

                    {!account.isSystem && (
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(account)}
                          aria-label={t('edit')}
                          title={t('edit')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs text-blue-700 transition active:bg-blue-100"
                        >
                          <FaEdit aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(account)}
                          aria-label={t('delete')}
                          title={t('delete')}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-700 transition active:bg-rose-100"
                        >
                          <FaTrash aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* PAGINATION */}
      <div className="mt-2 flex flex-shrink-0 items-center justify-center gap-2 text-xs font-semibold text-slate-600 sm:gap-3 sm:text-sm">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
          className="min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
        >
          {t('previous')}
        </button>

        <span className="whitespace-nowrap">
          {t('page')} {currentPage} {t('of')} {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
          className="min-h-9 rounded-md border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
        >
          {t('next')}
        </button>
      </div>

      {/* DELETE CONFIRMATION */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-extrabold text-slate-950">{t('accounts.deleteAccount')}</h2>

            <p className="mt-2 text-sm font-medium text-slate-600">
              {t('accounts.deleteConfirm')} {deleteTarget.name ? `(${deleteTarget.name})` : ''}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-10 rounded-md bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                {t('common.no')}
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                className="min-h-10 rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
              >
                {t('common.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccountsPage;
