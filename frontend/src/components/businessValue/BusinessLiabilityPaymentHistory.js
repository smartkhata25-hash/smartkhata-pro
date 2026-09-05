import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  fetchLiabilityPaymentHistory,
  formatLiabilityAmount,
  reverseLiabilityPayment,
} from '../../services/businessLiabilityService';
import { formatBusinessDateForDisplay } from '../../utils/localDateTime';

const METHOD_META = {
  cash: {
    icon: '💵',
    labelKey: 'businessValue.paymentMethodCash',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  bank: {
    icon: '🏦',
    labelKey: 'businessValue.paymentMethodBank',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  online: {
    icon: '📲',
    labelKey: 'businessValue.paymentMethodOnline',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  cheque: {
    icon: '🧾',
    labelKey: 'businessValue.paymentMethodCheque',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
  },
};

const formatDate = (value) => {
  if (!value) return '-';

  return formatBusinessDateForDisplay(value, { locale: 'en-PK' });
};

const BusinessLiabilityPaymentHistory = ({
  isOpen = false,
  liability = null,
  onClose,
  onChanged,
  moduleScope,
}) => {
  const [historyData, setHistoryData] = useState(null);

  const [loading, setLoading] = useState(false);

  const [reversingId, setReversingId] = useState('');

  const [error, setError] = useState('');

  const liabilityId = liability?._id;

  const payments = useMemo(() => {
    return Array.isArray(historyData?.payments) ? historyData.payments : [];
  }, [historyData]);

  const summary = historyData?.summary || {
    totalPayments: 0,
    totalPaid: 0,
    remainingAmount: Number(liability?.remainingAmount || 0),
    progress: 0,
  };

  const loadHistory = useCallback(async () => {
    if (!liabilityId) return;

    try {
      setLoading(true);
      setError('');

      const result = await fetchLiabilityPaymentHistory(liabilityId, {
        moduleScope,
      });

      setHistoryData(result?.data || null);
    } catch (loadError) {
      console.error('Liability Payment History Load Error:', loadError);

      setError(loadError.message || t('businessValue.paymentHistoryLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [liabilityId, moduleScope]);

  useEffect(() => {
    if (!isOpen || !liabilityId) {
      return;
    }

    loadHistory();
  }, [isOpen, liabilityId, loadHistory]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleReverse = async (payment) => {
    if (!payment?._id || payment.isReversed === true || reversingId) {
      return;
    }

    const confirmed = window.confirm(t('businessValue.reversePaymentConfirm'));

    if (!confirmed) return;

    try {
      setReversingId(payment._id);
      setError('');

      await reverseLiabilityPayment(liabilityId, payment._id, { moduleScope });

      await loadHistory();

      if (onChanged) {
        await onChanged();
      }
    } catch (reverseError) {
      console.error('Reverse Liability Payment Error:', reverseError);

      setError(reverseError.message || t('businessValue.reversePaymentFailed'));
    } finally {
      setReversingId('');
    }
  };

  if (!isOpen || !liability) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div
        className="
          relative z-10 flex max-h-[92vh]
          w-full max-w-[760px]
          flex-col overflow-hidden
          rounded-3xl border
          border-white/60 bg-white
          shadow-2xl
        "
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-800 px-4 py-3.5 text-white sm:px-5">
          <div className="absolute -right-10 -top-14 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-inner">
                🧾
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-base font-black sm:text-lg">
                  {t('businessValue.paymentHistory')}
                </h2>

                <p className="mt-0.5 truncate text-xs font-medium text-white/75">
                  {liability.title}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="
                flex h-9 w-9 shrink-0
                items-center justify-center
                rounded-xl bg-white/10
                text-lg transition
                hover:bg-white/20
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-4 sm:px-5">
          <SummaryCard
            label={t('businessValue.totalPayments')}
            value={summary.totalPayments}
            type="number"
            variant="neutral"
          />

          <SummaryCard
            label={t('businessValue.totalPaid')}
            value={summary.totalPaid}
            variant="success"
          />

          <SummaryCard
            label={t('businessValue.remainingAmount')}
            value={summary.remainingAmount}
            variant="danger"
          />

          <SummaryCard
            label={t('businessValue.paymentProgress')}
            value={summary.progress}
            type="percent"
            variant="primary"
          />
        </div>

        <div className="border-b border-slate-100 bg-white px-3 py-3 sm:px-5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-500">
              {t('businessValue.paymentProgress')}
            </span>

            <span className="text-xs font-black text-indigo-700">
              {Number(summary.progress || 0).toFixed(1)}%
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="
                h-full rounded-full
                bg-gradient-to-r
                from-indigo-600 via-blue-600
                to-cyan-500
                transition-all duration-300
              "
              style={{
                width: `${Math.min(Math.max(Number(summary.progress || 0), 0), 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {new Array(4).fill(null).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <PaymentItem
                  key={payment._id}
                  payment={payment}
                  reversing={reversingId === payment._id}
                  onReverse={() => handleReverse(payment)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-3 py-3 sm:px-5">
          <div className="text-[11px] font-semibold text-slate-400">
            {t('businessValue.paymentHistoryNote')}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="
              h-10 shrink-0 rounded-xl
              border border-slate-200
              bg-white px-4
              text-sm font-bold
              text-slate-600 transition
              hover:bg-slate-50
            "
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentItem = ({ payment, reversing, onReverse }) => {
  const method = METHOD_META[payment.paymentMethod] || METHOD_META.cash;

  const reversed = payment.isReversed === true;

  return (
    <div
      className={`
        rounded-2xl border p-3
        transition
        ${
          reversed
            ? 'border-slate-200 bg-slate-50 opacity-70'
            : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div
          className={`
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl border text-lg
            ${method.badge}
          `}
        >
          {method.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black text-slate-800">
                {t('currency.rs')} {formatLiabilityAmount(payment.amount)}
              </div>

              <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                {formatDate(payment.paymentDate)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`
                  rounded-full border
                  px-2 py-0.5
                  text-[10px] font-black
                  ${method.badge}
                `}
              >
                {t(method.labelKey)}
              </span>

              {reversed && (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-600">
                  {t('businessValue.reversed')}
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-500 sm:grid-cols-2">
            <DetailLine
              label={t('businessValue.paymentAccount')}
              value={payment.accountId?.name || '-'}
            />

            <DetailLine label={t('businessValue.referenceNo')} value={payment.referenceNo || '-'} />

            <DetailLine
              label={t('businessValue.remainingBefore')}
              value={`${t('currency.rs')} ${formatLiabilityAmount(payment.remainingBefore)}`}
            />

            <DetailLine
              label={t('businessValue.remainingAfter')}
              value={`${t('currency.rs')} ${formatLiabilityAmount(payment.remainingAfter)}`}
            />
          </div>

          {payment.note && (
            <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
              {payment.note}
            </div>
          )}

          {!reversed && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onReverse}
                disabled={reversing}
                className="
                  inline-flex h-8 items-center
                  justify-center gap-1.5
                  rounded-lg border
                  border-rose-200 bg-rose-50
                  px-3 text-xs font-black
                  text-rose-600 transition
                  hover:bg-rose-100
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                {reversing ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />

                    <span>{t('businessValue.reversing')}</span>
                  </>
                ) : (
                  <>
                    <span>↶</span>

                    <span>{t('businessValue.reversePayment')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailLine = ({ label, value }) => {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
      <span className="shrink-0 text-[10px] font-semibold text-slate-400">{label}</span>

      <span className="truncate text-[11px] font-bold text-slate-600">{value}</span>
    </div>
  );
};

const SummaryCard = ({ label, value, type = 'currency', variant = 'neutral' }) => {
  const styles = {
    neutral: 'border-slate-200 bg-white text-slate-700',

    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',

    danger: 'border-rose-200 bg-rose-50 text-rose-700',

    primary: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };

  let displayValue = value;

  if (type === 'currency') {
    displayValue = `${t('currency.rs')} ${formatLiabilityAmount(value)}`;
  }

  if (type === 'number') {
    displayValue = Number(value || 0).toLocaleString('en-PK');
  }

  if (type === 'percent') {
    displayValue = `${Number(value || 0).toFixed(1)}%`;
  }

  return (
    <div
      className={`
        min-w-0 rounded-xl border
        px-2.5 py-2
        ${styles[variant] || styles.neutral}
      `}
    >
      <div className="truncate text-[9px] font-bold uppercase tracking-wide opacity-65 sm:text-[10px]">
        {label}
      </div>

      <div className="mt-0.5 truncate text-xs font-black sm:text-sm">{displayValue}</div>
    </div>
  );
};

const EmptyState = () => {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
        🧾
      </div>

      <h3 className="mt-3 text-sm font-black text-slate-700">
        {t('businessValue.noPaymentHistory')}
      </h3>

      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
        {t('businessValue.noPaymentHistoryDescription')}
      </p>
    </div>
  );
};

export default BusinessLiabilityPaymentHistory;
