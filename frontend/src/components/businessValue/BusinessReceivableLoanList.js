import React, { useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  calculateReceivedLoanAmount,
  calculateReceivableLoanProgress,
  deleteBusinessReceivableLoan,
  formatReceivableLoanAmount,
} from '../../services/businessReceivableLoanService';

import { hasPermission } from '../../utils/permissionHelper';

const BusinessReceivableLoanList = ({
  loans = [],
  loading = false,
  onAdd,
  onEdit,
  onReceive,
  onHistory,
  onDeleted,
}) => {
  const canCreate = hasPermission('business_receivable_loans.create');
  const canEdit = hasPermission('business_receivable_loans.edit');
  const canDelete = hasPermission('business_receivable_loans.delete');
  const canReceive = hasPermission('business_receivable_loans.receive');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingId, setDeletingId] = useState('');

  const filteredLoans = useMemo(() => {
    const query = search.trim().toLowerCase();

    return loans.filter((loan) => {
      if (!loan) return false;

      if (statusFilter !== 'all' && loan.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [loan.title, loan.borrowerName, loan.borrowerType, loan.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [loans, search, statusFilter]);

  const summary = useMemo(() => {
    return loans.reduce(
      (acc, loan) => {
        const original = Number(loan.originalAmount || 0);
        const remaining = Number(loan.remainingAmount || 0);
        const received = Math.max(original - remaining, 0);

        acc.original += original;
        acc.received += received;
        acc.remaining += remaining;

        if (loan.status === 'active') {
          acc.active += 1;
        }

        if (loan.status === 'closed') {
          acc.closed += 1;
        }

        return acc;
      },
      {
        original: 0,
        received: 0,
        remaining: 0,
        active: 0,
        closed: 0,
      }
    );
  }, [loans]);

  const handleDelete = async (loan) => {
    if (!loan?._id || deletingId) return;

    const confirmed = window.confirm(t('businessValue.receivableLoanDeleteConfirm'));

    if (!confirmed) return;

    try {
      setDeletingId(loan._id);

      await deleteBusinessReceivableLoan(loan._id);

      if (onDeleted) {
        await onDeleted(loan._id);
      }
    } catch (error) {
      window.alert(error.message || t('businessValue.receivableLoanDeleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <HeaderSkeleton />

        <div className="space-y-2">
          {new Array(5).fill(null).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-slate-800 sm:text-lg">
              {t('businessValue.receivableLoans')}
            </h2>

            <p className="mt-0.5 text-xs text-slate-400">
              {t('businessValue.receivableLoansDescription')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 lg:w-[240px] lg:flex-none">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('businessValue.searchReceivableLoans')}
                className="
                  h-10 w-full rounded-xl border border-slate-200
                  bg-slate-50 px-3 pr-9 text-sm
                  text-slate-700 outline-none transition
                  placeholder:text-slate-400
                  focus:border-cyan-400 focus:bg-white
                  focus:ring-2 focus:ring-cyan-100
                "
              />

              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                🔎
              </span>
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="
                h-10 rounded-xl border border-slate-200
                bg-slate-50 px-3 text-xs font-bold
                text-slate-600 outline-none transition
                focus:border-cyan-400 focus:bg-white
                focus:ring-2 focus:ring-cyan-100
              "
            >
              <option value="all">{t('businessValue.allStatuses')}</option>

              <option value="active">{t('businessValue.statusActive')}</option>

              <option value="closed">{t('businessValue.statusClosed')}</option>
            </select>

            {canCreate && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="
                  inline-flex h-10 items-center justify-center
                  gap-2 rounded-xl bg-gradient-to-r
                  from-cyan-600 via-blue-600 to-indigo-600
                  px-4 text-xs font-black text-white
                  shadow-sm transition hover:-translate-y-0.5
                  hover:shadow-md
                "
              >
                <span>＋</span>
                <span>{t('businessValue.addReceivableLoan')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryCard
            label={t('businessValue.totalLoans')}
            value={loans.length}
            type="number"
            variant="neutral"
          />

          <SummaryCard
            label={t('businessValue.originalAmount')}
            value={summary.original}
            variant="primary"
          />

          <SummaryCard
            label={t('businessValue.totalReceived')}
            value={summary.received}
            variant="success"
          />

          <SummaryCard
            label={t('businessValue.remainingAmount')}
            value={summary.remaining}
            variant="danger"
          />

          <SummaryCard
            label={t('businessValue.activeLoans')}
            value={summary.active}
            type="number"
            variant="warning"
          />
        </div>
      </div>

      {filteredLoans.length === 0 ? (
        <EmptyState canCreate={canCreate} onAdd={onAdd} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left">
                    <TableHead>{t('businessValue.borrower')}</TableHead>

                    <TableHead>{t('businessValue.borrowerType')}</TableHead>

                    <TableHead align="right">{t('businessValue.originalAmount')}</TableHead>

                    <TableHead align="right">{t('businessValue.totalReceived')}</TableHead>

                    <TableHead align="right">{t('businessValue.remainingAmount')}</TableHead>

                    <TableHead>{t('businessValue.paymentProgress')}</TableHead>

                    <TableHead>{t('businessValue.status')}</TableHead>

                    <TableHead align="center">{t('common.actions')}</TableHead>
                  </tr>
                </thead>

                <tbody>
                  {filteredLoans.map((loan) => (
                    <DesktopRow
                      key={loan._id}
                      loan={loan}
                      deleting={deletingId === loan._id}
                      canReceive={canReceive}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onReceive={onReceive}
                      onHistory={onHistory}
                      onEdit={onEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {filteredLoans.map((loan) => (
              <MobileLoanCard
                key={loan._id}
                loan={loan}
                deleting={deletingId === loan._id}
                canReceive={canReceive}
                canEdit={canEdit}
                canDelete={canDelete}
                onReceive={onReceive}
                onHistory={onHistory}
                onEdit={onEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

const DesktopRow = ({
  loan,
  deleting,
  canReceive,
  canEdit,
  canDelete,
  onReceive,
  onHistory,
  onEdit,
  onDelete,
}) => {
  const receivedAmount = calculateReceivedLoanAmount(loan);

  const progress = calculateReceivableLoanProgress(loan);

  const hasRemaining = Number(loan.remainingAmount || 0) > 0;

  return (
    <tr
      className={`
        border-b border-slate-100
        transition last:border-b-0
        ${loan.status === 'closed' ? 'bg-emerald-50/30' : 'hover:bg-slate-50/70'}
      `}
    >
      <td className="px-4 py-3">
        <div className="min-w-0">
          <div className="max-w-[220px] truncate text-sm font-black text-slate-800">
            {loan.borrowerName}
          </div>

          <div className="mt-0.5 max-w-[220px] truncate text-[11px] font-medium text-slate-400">
            {loan.title}
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <BorrowerTypeBadge type={loan.borrowerType} />
      </td>

      <AmountCell value={loan.originalAmount} className="text-slate-700" />

      <AmountCell value={receivedAmount} className="text-emerald-700" />

      <AmountCell
        value={loan.remainingAmount}
        className={hasRemaining ? 'text-rose-700' : 'text-emerald-700'}
      />

      <td className="min-w-[180px] px-4 py-3">
        <ProgressBar value={progress} />
      </td>

      <td className="px-4 py-3">
        <StatusBadge status={loan.status} />
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-center gap-1.5">
          {canReceive && onReceive && hasRemaining && (
            <ActionButton
              icon="💰"
              title={t('businessValue.receiveLoanPayment')}
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              disabled={deleting}
              onClick={() => onReceive(loan)}
            />
          )}

          {onHistory && (
            <ActionButton
              icon="🧾"
              title={t('businessValue.receivableLoanHistory')}
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              disabled={deleting}
              onClick={() => onHistory(loan)}
            />
          )}

          {canEdit && onEdit && (
            <ActionButton
              icon="✎"
              title={t('common.edit')}
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              disabled={deleting}
              onClick={() => onEdit(loan)}
            />
          )}

          {canDelete && (
            <ActionButton
              icon={
                deleting ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
                ) : (
                  '✕'
                )
              }
              title={t('common.delete')}
              className="border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
              disabled={deleting}
              onClick={() => onDelete(loan)}
            />
          )}
        </div>
      </td>
    </tr>
  );
};

const MobileLoanCard = ({
  loan,
  deleting,
  canReceive,
  canEdit,
  canDelete,
  onReceive,
  onHistory,
  onEdit,
  onDelete,
}) => {
  const receivedAmount = calculateReceivedLoanAmount(loan);

  const progress = calculateReceivableLoanProgress(loan);

  const hasRemaining = Number(loan.remainingAmount || 0) > 0;

  return (
    <div
      className={`
        rounded-2xl border p-3 shadow-sm
        ${
          loan.status === 'closed'
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-slate-200 bg-white'
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-800">{loan.borrowerName}</div>

          <div className="mt-0.5 truncate text-xs text-slate-400">{loan.title}</div>

          <div className="mt-1.5">
            <BorrowerTypeBadge type={loan.borrowerType} />
          </div>
        </div>

        <StatusBadge status={loan.status} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MobileValue
          label={t('businessValue.originalAmount')}
          value={loan.originalAmount}
          className="bg-slate-50 text-slate-700"
        />

        <MobileValue
          label={t('businessValue.totalReceived')}
          value={receivedAmount}
          className="bg-emerald-50 text-emerald-700"
        />

        <MobileValue
          label={t('businessValue.remainingAmount')}
          value={loan.remainingAmount}
          className={hasRemaining ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}
        />
      </div>

      <div className="mt-3">
        <ProgressBar value={progress} />
      </div>

      {(canReceive || onHistory || canEdit || canDelete) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-2">
          {canReceive && onReceive && hasRemaining && (
            <button
              type="button"
              onClick={() => onReceive(loan)}
              disabled={deleting}
              className="h-8 rounded-lg bg-emerald-50 px-3 text-xs font-black text-emerald-700 disabled:opacity-50"
            >
              💰 {t('businessValue.receiveLoanPayment')}
            </button>
          )}

          {onHistory && (
            <button
              type="button"
              onClick={() => onHistory(loan)}
              disabled={deleting}
              className="h-8 rounded-lg bg-blue-50 px-3 text-xs font-black text-blue-700 disabled:opacity-50"
            >
              🧾 {t('businessValue.receivableLoanHistory')}
            </button>
          )}

          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(loan)}
              disabled={deleting}
              className="h-8 rounded-lg bg-amber-50 px-3 text-xs font-black text-amber-700 disabled:opacity-50"
            >
              ✎ {t('common.edit')}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(loan)}
              disabled={deleting}
              className="h-8 rounded-lg bg-rose-50 px-3 text-xs font-black text-rose-600 disabled:opacity-50"
            >
              {deleting ? t('businessValue.deleting') : `✕ ${t('common.delete')}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ActionButton = ({ icon, title, className, disabled, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex h-8 w-8 items-center justify-center
        rounded-lg border text-sm transition
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${className}
      `}
    >
      {icon}
    </button>
  );
};

const TableHead = ({ children, align = 'left' }) => {
  return (
    <th
      className={`
        px-4 py-3 text-[10px]
        font-black uppercase tracking-wide
        text-slate-400
        ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}
      `}
    >
      {children}
    </th>
  );
};

const AmountCell = ({ value, className = '' }) => {
  return (
    <td
      className={`
        whitespace-nowrap px-4 py-3
        text-right text-sm font-black
        ${className}
      `}
    >
      {t('currency.rs')} {formatReceivableLoanAmount(value)}
    </td>
  );
};

const ProgressBar = ({ value }) => {
  const progress = Math.min(Math.max(Number(value || 0), 0), 100);

  let barClass = 'from-rose-500 to-orange-500';

  if (progress >= 100) {
    barClass = 'from-emerald-500 to-green-500';
  } else if (progress >= 75) {
    barClass = 'from-blue-500 to-cyan-500';
  } else if (progress >= 25) {
    barClass = 'from-amber-500 to-orange-500';
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-slate-400">
          {t('businessValue.paymentProgress')}
        </span>

        <span className="text-[10px] font-black text-slate-600">{progress.toFixed(0)}%</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`
            h-full rounded-full bg-gradient-to-r
            transition-all duration-300
            ${barClass}
          `}
          style={{
            width: `${progress}%`,
          }}
        />
      </div>
    </div>
  );
};

const BorrowerTypeBadge = ({ type }) => {
  const meta = {
    person: {
      labelKey: 'businessValue.borrowerTypePerson',
      className: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    employee: {
      labelKey: 'businessValue.borrowerTypeEmployee',
      className: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    customer: {
      labelKey: 'businessValue.borrowerTypeCustomer',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    supplier: {
      labelKey: 'businessValue.borrowerTypeSupplier',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    other: {
      labelKey: 'businessValue.borrowerTypeOther',
      className: 'border-gray-200 bg-gray-50 text-gray-600',
    },
  };

  const selected = meta[type] || meta.other;

  return (
    <span
      className={`
        inline-flex rounded-full border
        px-2 py-0.5 text-[10px] font-black
        ${selected.className}
      `}
    >
      {t(selected.labelKey)}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const closed = status === 'closed';

  return (
    <span
      className={`
        inline-flex rounded-full border
        px-2 py-0.5 text-[10px] font-black
        ${
          closed
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-cyan-200 bg-cyan-50 text-cyan-700'
        }
      `}
    >
      {closed ? t('businessValue.statusClosed') : t('businessValue.statusActive')}
    </span>
  );
};

const MobileValue = ({ label, value, className }) => {
  return (
    <div
      className={`
        min-w-0 rounded-xl px-2 py-2
        ${className}
      `}
    >
      <div className="truncate text-[9px] font-bold uppercase tracking-wide opacity-60">
        {label}
      </div>

      <div className="mt-0.5 truncate text-xs font-black">
        {t('currency.rs')} {formatReceivableLoanAmount(value)}
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, type = 'currency', variant = 'neutral' }) => {
  const styles = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',

    primary: 'border-cyan-200 bg-cyan-50 text-cyan-700',

    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',

    danger: 'border-rose-200 bg-rose-50 text-rose-700',

    warning: 'border-amber-200 bg-amber-50 text-amber-700',
  };

  const displayValue =
    type === 'number'
      ? Number(value || 0).toLocaleString('en-PK')
      : `${t('currency.rs')} ${formatReceivableLoanAmount(value)}`;

  return (
    <div
      className={`
        min-w-0 rounded-xl border
        px-2.5 py-2
        ${styles[variant] || styles.neutral}
      `}
    >
      <div className="truncate text-[9px] font-bold uppercase tracking-wide opacity-60">
        {label}
      </div>

      <div className="mt-0.5 truncate text-xs font-black sm:text-sm">{displayValue}</div>
    </div>
  );
};

const EmptyState = ({ canCreate, onAdd }) => {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-2xl">
        🤝
      </div>

      <h3 className="mt-3 text-sm font-black text-slate-700">
        {t('businessValue.noReceivableLoans')}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
        {t('businessValue.noReceivableLoansDescription')}
      </p>

      {canCreate && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="
            mt-4 inline-flex h-9 items-center
            justify-center gap-1.5 rounded-xl
            bg-gradient-to-r from-cyan-600
            to-blue-600 px-4 text-xs
            font-black text-white shadow-sm
          "
        >
          ＋ {t('businessValue.addReceivableLoan')}
        </button>
      )}
    </div>
  );
};

const HeaderSkeleton = () => {
  return <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />;
};

export default BusinessReceivableLoanList;
