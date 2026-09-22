import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaBalanceScale,
  FaBook,
  FaFilter,
  FaHandHoldingUsd,
  FaMoneyBillWave,
  FaSearch,
  FaUserTie,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import {
  EMPLOYEE_MODULE_SCOPES,
  getEmployeeLedgersSummary,
} from '../../services/employeeService';
import { useWeavingFeedback } from '../../components/weaving/WeavingFeedbackModal';

const MODULE_SCOPE = EMPLOYEE_MODULE_SCOPES.WEAVING;

const emptySummary = {
  totalEmployees: 0,
  totalPayable: 0,
  totalRecoverable: 0,
  totalLoan: 0,
  totalKharcha: 0,
  netPosition: 0,
};

const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-GB', {
    maximumFractionDigits: 2,
  });

const getEmployeeInitials = (name = '') => {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (words[0]?.[0] || 'E') + (words[1]?.[0] || '');
};

const amountClass = (value, tone) =>
  Number(value || 0) > 0
    ? tone
    : 'text-slate-400';

const SummaryItem = ({ icon: Icon, label, value, tone = 'cyan' }) => {
  const tones = {
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    slate: 'border-slate-200 bg-white/80 text-slate-700',
  };

  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2 ${tones[tone] || tones.cyan}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <p className="truncate text-[11px] font-black uppercase tracking-normal">{label}</p>
      </div>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
};

const PositionBadge = ({ row }) => {
  const type = row.positionType || 'settled';
  const classes = {
    payable: 'border-amber-200 bg-amber-50 text-amber-800',
    recoverable: 'border-rose-200 bg-rose-50 text-rose-800',
    settled: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  const label =
    type === 'payable'
      ? t('weaving.employeeLedgers.payable')
      : type === 'recoverable'
        ? t('weaving.employeeLedgers.recoverable')
        : t('weaving.employeeLedgers.settled');

  return (
    <span
      className={`inline-flex min-w-[112px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-black ${
        classes[type] || classes.settled
      }`}
    >
      {type === 'settled' ? label : `${label} ${formatMoney(row.netPosition)}`}
    </span>
  );
};

const StatusBadge = ({ row }) => {
  const isInactive = Boolean(row.isDeleted) || row.status === 'inactive';
  const label = isInactive
    ? t('weaving.employeeLedgers.inactive')
    : t('weaving.employeeLedgers.active');

  return (
    <span
      className={`inline-flex min-w-[68px] items-center justify-center rounded-full px-2 py-1 text-[11px] font-black uppercase tracking-normal ${
        isInactive
          ? 'bg-slate-100 text-slate-600'
          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      }`}
    >
      {label}
    </span>
  );
};

const MoneyCell = ({ value, tone = 'text-slate-900' }) => (
  <span className={`font-black ${amountClass(value, tone)}`}>{formatMoney(value)}</span>
);

const WeavingEmployeeLedgersPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [ledgerData, setLedgerData] = useState({ summary: emptySummary, employees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });

  const loadLedgers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getEmployeeLedgersSummary({
        moduleScope: MODULE_SCOPE,
        search,
        position: positionFilter,
        status: statusFilter,
      });

      setLedgerData({
        summary: { ...emptySummary, ...(data?.summary || {}) },
        employees: Array.isArray(data?.employees) ? data.employees : [],
      });
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('weaving.employeeLedgers.loadFailed'));
      setLedgerData({ summary: emptySummary, employees: [] });
    } finally {
      setLoading(false);
    }
  }, [positionFilter, search, statusFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadLedgers, 220);

    return () => window.clearTimeout(timeoutId);
  }, [loadLedgers]);

  const summary = ledgerData.summary || emptySummary;
  const employees = ledgerData.employees || [];
  const hasActiveFilters = useMemo(
    () => search.trim() || positionFilter !== 'all' || statusFilter !== 'active',
    [positionFilter, search, statusFilter],
  );

  const openLedger = (employeeId) => {
    if (!employeeId) return;

    navigate(`/weaving/employees/${employeeId}/ledger`);
  };

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/70 p-3 sm:p-4 md:p-5 lg:p-6">
      <section className="mb-3 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
        <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(180px,0.9fr)_minmax(0,2.8fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-cyan-700 text-white shadow-sm">
              <FaBalanceScale aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-slate-950">
                {t('weaving.employeeLedgers.title')}
              </h1>
              <p className="text-xs font-black uppercase tracking-normal text-slate-400">
                {formatMoney(summary.totalEmployees)} {t('weaving.employeeLedgers.employees')}
              </p>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-4">
            <SummaryItem
              icon={FaMoneyBillWave}
              label={t('weaving.employeeLedgers.payable')}
              value={formatMoney(summary.totalPayable)}
              tone="amber"
            />
            <SummaryItem
              icon={FaBalanceScale}
              label={t('weaving.employeeLedgers.recoverable')}
              value={formatMoney(summary.totalRecoverable)}
              tone="rose"
            />
            <SummaryItem
              icon={FaHandHoldingUsd}
              label={t('weaving.employeeLedgers.loan')}
              value={formatMoney(summary.totalLoan)}
              tone="rose"
            />
            <SummaryItem
              icon={FaHandHoldingUsd}
              label={t('weaving.employeeLedgers.kharcha')}
              value={formatMoney(summary.totalKharcha)}
              tone="cyan"
            />
          </div>
        </div>
      </section>

      <section className="mb-3 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.3fr)_minmax(150px,0.65fr)_minmax(150px,0.65fr)]">
          <label className="relative block">
            <FaSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('weaving.employeeLedgers.searchEmployee')}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
            />
          </label>

          <label className="relative block">
            <FaFilter
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <select
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
            >
              <option value="all">{t('weaving.employeeLedgers.positionAll')}</option>
              <option value="payable">{t('weaving.employeeLedgers.payable')}</option>
              <option value="recoverable">{t('weaving.employeeLedgers.recoverable')}</option>
              <option value="settled">{t('weaving.employeeLedgers.settled')}</option>
            </select>
          </label>

          <label className="relative block">
            <FaUserTie
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-2 focus:ring-cyan-100"
            >
              <option value="active">{t('weaving.employeeLedgers.active')}</option>
              <option value="inactive">{t('weaving.employeeLedgers.inactive')}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm font-black text-slate-500">
            {t('travel.common.loading')}
          </div>
        ) : (
          <>
            <div className="hidden overflow-auto lg:block">
              <table className="min-w-[1040px] w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-900 text-xs font-black uppercase tracking-normal text-white">
                  <tr>
                    <th className="w-14 border border-slate-700 px-3 py-3 text-center">#</th>
                    <th className="w-[240px] border border-slate-700 px-3 py-3">
                      {t('weaving.employeeLedgers.employee')}
                    </th>
                    <th className="w-[170px] border border-slate-700 px-3 py-3">
                      {t('weaving.employeeLedgers.unitDepartment')}
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.payable')}
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.recoverable')}
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.loan')}
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.kharcha')}
                    </th>
                    <th className="w-[158px] border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.netPosition')}
                    </th>
                    <th className="w-24 border border-slate-700 px-3 py-3 text-center">
                      {t('weaving.employeeLedgers.status')}
                    </th>
                    <th className="w-28 border border-slate-700 px-3 py-3 text-center">
                      {t('travel.common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((row, index) => (
                    <tr
                      key={row.employeeId}
                      className={`transition hover:bg-cyan-50/50 ${
                        row.isDeleted ? 'bg-amber-50/25' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center text-xs font-black text-slate-400">
                        {index + 1}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black uppercase text-white">
                            {getEmployeeInitials(row.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-950">{row.name || '-'}</p>
                            <p className="truncate text-xs font-bold text-slate-500">
                              {row.employeeNo || row.phone || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5">
                        <p className="truncate font-bold text-slate-800">{row.unit || '-'}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">
                          {row.department || row.designation || '-'}
                        </p>
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <MoneyCell value={row.payable} tone="text-amber-700" />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <MoneyCell value={row.recoverable} tone="text-rose-700" />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <MoneyCell value={row.loanOutstanding} tone="text-rose-700" />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <MoneyCell value={row.kharchaOutstanding} tone="text-cyan-700" />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <PositionBadge row={row} />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <StatusBadge row={row} />
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openLedger(row.employeeId)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-800 transition hover:bg-cyan-100"
                          title={t('weaving.employeeLedgers.viewLedger')}
                        >
                          <FaBook aria-hidden="true" />
                          {t('weaving.employeeLedgers.viewLedger')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2 p-2 lg:hidden">
              {employees.map((row) => (
                <article
                  key={row.employeeId}
                  className={`rounded-lg border p-3 shadow-sm ${
                    row.isDeleted ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black uppercase text-white">
                        {getEmployeeInitials(row.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{row.name || '-'}</p>
                        <p className="truncate text-xs font-bold text-slate-500">
                          {[row.employeeNo, row.unit, row.department].filter(Boolean).join(' | ') || '-'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge row={row} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        {t('weaving.employeeLedgers.payable')}
                      </p>
                      <MoneyCell value={row.payable} tone="text-amber-700" />
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        {t('weaving.employeeLedgers.recoverable')}
                      </p>
                      <MoneyCell value={row.recoverable} tone="text-rose-700" />
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        {t('weaving.employeeLedgers.loan')}
                      </p>
                      <MoneyCell value={row.loanOutstanding} tone="text-rose-700" />
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        {t('weaving.employeeLedgers.kharcha')}
                      </p>
                      <MoneyCell value={row.kharchaOutstanding} tone="text-cyan-700" />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <PositionBadge row={row} />
                    <button
                      type="button"
                      onClick={() => openLedger(row.employeeId)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-800 transition hover:bg-cyan-100"
                    >
                      <FaBook aria-hidden="true" />
                      {t('weaving.employeeLedgers.viewLedger')}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {employees.length === 0 && (
              <div className="border-t border-slate-100 px-4 py-10 text-center">
                <p className="text-sm font-black text-slate-600">
                  {hasActiveFilters
                    ? t('weaving.employeeLedgers.noBalancesFound')
                    : t('weaving.employeeLedgers.empty')}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default WeavingEmployeeLedgersPage;
