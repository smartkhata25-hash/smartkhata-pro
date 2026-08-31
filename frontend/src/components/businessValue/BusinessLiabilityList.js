import React, { useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  deleteBusinessLiability,
  formatLiabilityAmount,
  calculatePaidLiabilityAmount,
  calculateLiabilityProgress,
} from '../../services/businessLiabilityService';

import { hasPermission } from '../../utils/permissionHelper';

const BusinessLiabilityList = ({
  liabilities = [],
  loading = false,
  onEdit,
  onDeleted,
  onAdd,
  onPay,
  onHistory,
  moduleScope,
}) => {
  const [deletingId, setDeletingId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const canCreate = hasPermission('business_liabilities.create');
  const canEdit = hasPermission('business_liabilities.edit');
  const canDelete = hasPermission('business_liabilities.delete');
  const canPay = hasPermission('business_liabilities.pay');

  const filteredLiabilities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return liabilities.filter((liability) => {
      const matchesSearch =
        !query ||
        String(liability.title || '')
          .toLowerCase()
          .includes(query) ||
        String(liability.notes || '')
          .toLowerCase()
          .includes(query);

      const matchesStatus = statusFilter === 'all' || liability.status === statusFilter;

      const matchesCategory = categoryFilter === 'all' || liability.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [liabilities, search, statusFilter, categoryFilter]);

  const totals = useMemo(() => {
    return filteredLiabilities.reduce(
      (summary, liability) => {
        const originalAmount = Number(liability.originalAmount || 0);

        const remainingAmount = Number(liability.remainingAmount || 0);

        summary.items += 1;
        summary.originalAmount += originalAmount;
        summary.remainingAmount += remainingAmount;
        summary.paidAmount += Math.max(originalAmount - remainingAmount, 0);

        return summary;
      },
      {
        items: 0,
        originalAmount: 0,
        remainingAmount: 0,
        paidAmount: 0,
      }
    );
  }, [filteredLiabilities]);

  const handleDelete = async (liability) => {
    const confirmed = window.confirm(
      `${t('businessValue.deleteLiabilityConfirm')} "${liability.title}"?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(liability._id);

      await deleteBusinessLiability(liability._id, { moduleScope });

      if (onDeleted) {
        onDeleted(liability._id);
      }
    } catch (error) {
      alert(error.message || t('businessValue.liabilityDeleteFailed'));
    } finally {
      setDeletingId('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 p-2.5 sm:flex-row sm:items-center sm:p-3">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            🔍
          </span>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('businessValue.searchLiabilities')}
            className="
              h-10 w-full rounded-xl border border-gray-200 bg-gray-50
              pl-9 pr-3 text-sm text-gray-800 outline-none transition
              placeholder:text-gray-400
              hover:border-rose-300 hover:bg-white
              focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-100
            "
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="
            h-10 rounded-xl border border-gray-200 bg-gray-50
            px-3 text-sm font-semibold text-gray-700 outline-none
            hover:border-rose-300 hover:bg-white
            focus:border-rose-500 focus:ring-2 focus:ring-rose-100
            sm:w-[165px]
          "
        >
          <option value="all">{t('businessValue.allLiabilityCategories')}</option>

          <option value="loan">{t('businessValue.liabilityCategoryLoan')}</option>

          <option value="bank_loan">{t('businessValue.liabilityCategoryBankLoan')}</option>

          <option value="supplier">{t('businessValue.liabilityCategorySupplier')}</option>

          <option value="credit">{t('businessValue.liabilityCategoryCredit')}</option>

          <option value="tax">{t('businessValue.liabilityCategoryTax')}</option>

          <option value="other">{t('businessValue.liabilityCategoryOther')}</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="
            h-10 rounded-xl border border-gray-200 bg-gray-50
            px-3 text-sm font-semibold text-gray-700 outline-none
            hover:border-rose-300 hover:bg-white
            focus:border-rose-500 focus:ring-2 focus:ring-rose-100
            sm:w-[135px]
          "
        >
          <option value="all">{t('businessValue.allLiabilityStatus')}</option>

          <option value="active">{t('businessValue.liabilityStatusActive')}</option>

          <option value="closed">{t('businessValue.liabilityStatusClosed')}</option>
        </select>

        {canCreate && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="
              inline-flex h-10 items-center justify-center gap-2
              rounded-xl bg-gradient-to-r from-rose-600 to-orange-500
              px-4 text-sm font-black text-white shadow-sm transition
              hover:-translate-y-0.5 hover:shadow-md
            "
          >
            <span>＋</span>
            <span>{t('businessValue.addLiability')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/70 p-2.5 sm:grid-cols-4 sm:p-3">
        <CompactTotal label={t('businessValue.liabilityItems')} value={totals.items} icon="💳" />

        <CompactTotal
          label={t('businessValue.originalAmount')}
          value={totals.originalAmount}
          icon="🧾"
          currency
        />

        <CompactTotal
          label={t('businessValue.paidAmount')}
          value={totals.paidAmount}
          icon="✓"
          currency
        />

        <CompactTotal
          label={t('businessValue.remainingAmount')}
          value={totals.remainingAmount}
          icon="⚠"
          currency
          danger
        />
      </div>

      {loading ? (
        <LiabilityLoading />
      ) : filteredLiabilities.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="text-4xl">💳</div>

          <h3 className="mt-3 text-base font-black text-gray-800">
            {search || statusFilter !== 'all' || categoryFilter !== 'all'
              ? t('businessValue.noFilteredLiabilities')
              : t('businessValue.noLiabilities')}
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {search || statusFilter !== 'all' || categoryFilter !== 'all'
              ? t('businessValue.changeLiabilityFilters')
              : t('businessValue.noLiabilitiesDescription')}
          </p>

          {!search && statusFilter === 'all' && categoryFilter === 'all' && canCreate && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="
                  mt-4 inline-flex h-10 items-center gap-2 rounded-xl
                  bg-gradient-to-r from-rose-600 to-orange-500
                  px-4 text-sm font-bold text-white shadow-sm
                "
            >
              ＋ {t('businessValue.addFirstLiability')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('businessValue.liability')}</th>

                  <th className="px-4 py-3 text-left">{t('businessValue.category')}</th>

                  <th className="px-4 py-3 text-right">{t('businessValue.originalAmount')}</th>

                  <th className="px-4 py-3 text-right">{t('businessValue.paidAmount')}</th>

                  <th className="px-4 py-3 text-right">{t('businessValue.remainingAmount')}</th>

                  <th className="px-4 py-3 text-center">{t('businessValue.progress')}</th>

                  <th className="px-4 py-3 text-center">{t('businessValue.status')}</th>

                  <th className="px-4 py-3 text-center">{t('common.actions')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredLiabilities.map((liability) => {
                  const busy = deletingId === liability._id;

                  const paidAmount = calculatePaidLiabilityAmount(liability);

                  const progress = calculateLiabilityProgress(liability);

                  return (
                    <tr
                      key={liability._id}
                      className="border-t border-gray-100 transition hover:bg-rose-50/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-800">{liability.title}</div>

                        <div className="mt-1 max-w-[250px] truncate text-xs text-gray-400">
                          {liability.notes || t('businessValue.noLiabilityNotes')}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <CategoryBadge category={liability.category} />
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-gray-700">
                        {t('currency.rs')} {formatLiabilityAmount(liability.originalAmount)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        {t('currency.rs')} {formatLiabilityAmount(paidAmount)}
                      </td>

                      <td className="px-4 py-3 text-right font-black text-rose-700">
                        {t('currency.rs')} {formatLiabilityAmount(liability.remainingAmount)}
                      </td>

                      <td className="px-4 py-3">
                        <ProgressBar value={progress} />
                      </td>

                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={liability.status} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1.5">
                          {canPay && onPay && Number(liability.remainingAmount || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => onPay(liability)}
                              disabled={busy}
                              title={t('businessValue.payLiability')}
                              className="
            flex h-8 w-8 items-center justify-center
            rounded-lg border border-emerald-200 bg-emerald-50
            text-sm text-emerald-700 transition
            hover:bg-emerald-100 disabled:opacity-50
          "
                            >
                              💸
                            </button>
                          )}

                          {onHistory && (
                            <button
                              type="button"
                              onClick={() => onHistory(liability)}
                              disabled={busy}
                              title={t('businessValue.paymentHistory')}
                              className="
          flex h-8 w-8 items-center justify-center
          rounded-lg border border-blue-200 bg-blue-50
          text-sm text-blue-700 transition
          hover:bg-blue-100 disabled:opacity-50
        "
                            >
                              🧾
                            </button>
                          )}

                          {canEdit && onEdit && (
                            <button
                              type="button"
                              onClick={() => onEdit(liability)}
                              disabled={busy}
                              title={t('common.edit')}
                              className="
          flex h-8 w-8 items-center justify-center
          rounded-lg border border-amber-200 bg-amber-50
          text-sm text-amber-700 transition
          hover:bg-amber-100 disabled:opacity-50
        "
                            >
                              ✎
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(liability)}
                              disabled={busy}
                              title={t('common.delete')}
                              className="
          flex h-8 w-8 items-center justify-center
          rounded-lg border border-red-200 bg-red-50
          text-sm text-red-600 transition
          hover:bg-red-100 disabled:opacity-50
        "
                            >
                              {busy ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                              ) : (
                                '✕'
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-2.5 p-2.5 md:hidden">
            {filteredLiabilities.map((liability) => (
              <MobileLiabilityCard
                key={liability._id}
                liability={liability}
                deleting={deletingId === liability._id}
                canPay={canPay}
                canEdit={canEdit}
                canDelete={canDelete}
                onPay={onPay}
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

const MobileLiabilityCard = ({
  liability,
  deleting,
  canPay,
  canEdit,
  canDelete,
  onPay,
  onHistory,
  onEdit,
  onDelete,
}) => {
  const paidAmount = calculatePaidLiabilityAmount(liability);

  const progress = calculateLiabilityProgress(liability);

  const hasRemaining = Number(liability.remainingAmount || 0) > 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-black text-gray-800">{liability.title}</div>

          <div className="mt-1">
            <CategoryBadge category={liability.category} />
          </div>
        </div>

        <StatusBadge status={liability.status} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MobileValue
          label={t('businessValue.originalAmount')}
          value={liability.originalAmount}
          className="bg-slate-50 text-slate-700"
        />

        <MobileValue
          label={t('businessValue.paidAmount')}
          value={paidAmount}
          className="bg-emerald-50 text-emerald-700"
        />

        <MobileValue
          label={t('businessValue.remainingAmount')}
          value={liability.remainingAmount}
          className="bg-rose-50 text-rose-700"
        />
      </div>

      <div className="mt-3">
        <ProgressBar value={progress} />
      </div>

      {(canPay || onHistory || canEdit || canDelete) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-2">
          {canPay && onPay && hasRemaining && (
            <button
              type="button"
              onClick={() => onPay(liability)}
              disabled={deleting}
              className="h-8 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:opacity-50"
            >
              💸 {t('businessValue.payLiability')}
            </button>
          )}

          {onHistory && (
            <button
              type="button"
              onClick={() => onHistory(liability)}
              disabled={deleting}
              className="h-8 rounded-lg bg-blue-50 px-3 text-xs font-bold text-blue-700 disabled:opacity-50"
            >
              🧾 {t('businessValue.paymentHistory')}
            </button>
          )}

          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(liability)}
              disabled={deleting}
              className="h-8 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700 disabled:opacity-50"
            >
              ✎ {t('common.edit')}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(liability)}
              disabled={deleting}
              className="h-8 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 disabled:opacity-50"
            >
              {deleting ? t('businessValue.deleting') : `✕ ${t('common.delete')}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ProgressBar = ({ value }) => {
  const safeValue = Math.min(Math.max(Number(value || 0), 0), 100);

  return (
    <div className="min-w-[115px]">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-gray-500">
        <span>{t('businessValue.paid')}</span>
        <span>{Math.round(safeValue)}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
          style={{
            width: `${safeValue}%`,
          }}
        />
      </div>
    </div>
  );
};

const CategoryBadge = ({ category }) => {
  const labels = {
    loan: t('businessValue.liabilityCategoryLoan'),
    bank_loan: t('businessValue.liabilityCategoryBankLoan'),
    supplier: t('businessValue.liabilityCategorySupplier'),
    credit: t('businessValue.liabilityCategoryCredit'),
    tax: t('businessValue.liabilityCategoryTax'),
    other: t('businessValue.liabilityCategoryOther'),
  };

  return (
    <span className="inline-flex max-w-[170px] truncate rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
      {labels[category] || labels.other}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const active = status === 'active';

  return (
    <span
      className={`
        inline-flex whitespace-nowrap rounded-full border px-2 py-1
        text-[10px] font-black
        ${
          active
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }
      `}
    >
      {active ? t('businessValue.liabilityStatusActive') : t('businessValue.liabilityStatusClosed')}
    </span>
  );
};

const MobileValue = ({ label, value, className }) => {
  return (
    <div className={`min-w-0 rounded-xl p-2 ${className}`}>
      <div className="truncate text-[9px] font-semibold opacity-70">{label}</div>

      <div className="mt-1 truncate text-xs font-black">
        {t('currency.rs')} {formatLiabilityAmount(value)}
      </div>
    </div>
  );
};

const CompactTotal = ({ label, value, icon, currency = false, danger = false }) => {
  return (
    <div
      className={`
        min-w-0 rounded-xl border px-3 py-2 shadow-sm
        ${danger ? 'border-rose-100 bg-rose-50' : 'border-gray-100 bg-white'}
      `}
    >
      <div
        className={`
          flex items-center gap-1.5 text-[10px] font-semibold
          ${danger ? 'text-rose-600' : 'text-gray-500'}
        `}
      >
        <span>{icon}</span>
        <span className="truncate">{label}</span>
      </div>

      <div
        className={`
          mt-1 truncate text-sm font-black
          ${danger ? 'text-rose-700' : 'text-gray-800'}
        `}
      >
        {currency && `${t('currency.rs')} `}

        {currency ? formatLiabilityAmount(value) : Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
};

const LiabilityLoading = () => {
  return (
    <div className="space-y-2 p-3">
      {new Array(5).fill(null).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  );
};

export default BusinessLiabilityList;
