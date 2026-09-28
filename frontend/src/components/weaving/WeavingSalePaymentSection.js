import React from 'react';

import { requestWeavingConfirmation } from './WeavingFeedbackModal';
import { t } from '../../i18n/i18n';

export const salesInput =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-500';

export const SaleField = ({ label, children, className = '' }) => (
  <label className={`block min-w-0 ${className}`}>
    {label && (
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
    )}

    {children}
  </label>
);

export const paymentReceived = (form) => Math.round(Number(form.receivedNow || 0) * 100) / 100;

export const paymentError = (form) => {
  const received = paymentReceived(form);

  if (!Number.isFinite(received) || received < 0) {
    return t('weaving.salesPro.invalidReceived');
  }

  if (received > 0 && !form.paymentAccountId) {
    return t('weaving.salesPro.accountRequired');
  }

  if (received > 0 && !form.paymentMethod) {
    return t('weaving.salesCleanup.methodRequired');
  }

  if (
    received > 0 &&
    form.paymentMethod === 'cheque' &&
    ['chequeNo', 'chequeBank', 'chequeDate', 'chequeDueDate'].some(
      (field) => !String(form[field] || '').trim()
    )
  ) {
    return t('weaving.salesPro.chequeRequired');
  }

  return '';
};

export const confirmExcessPayment = (form, total) => {
  const received = paymentReceived(form);

  if (received <= total) {
    return Promise.resolve(true);
  }

  const money = (value) =>
    Number(value || 0).toLocaleString('en-PK', {
      maximumFractionDigits: 2,
    });

  return requestWeavingConfirmation({
    title: t('weaving.salesCleanup.excessTitle'),

    message:
      `${t('weaving.salesCleanup.invoiceAmount')}: Rs. ${money(total)}\n` +
      `${t('weaving.salesCleanup.receivedAmount')}: Rs. ${money(received)}\n` +
      `${t('weaving.salesCleanup.excess')}: Rs. ${money(received - total)}\n\n` +
      `${t('weaving.salesCleanup.excessMessage')}`,

    cancelLabel: t('weaving.salesCleanup.goBack'),

    confirmLabel: t('weaving.salesCleanup.continueReceive'),
  });
};

export default function WeavingSalePaymentSection({ form, onChange, total, accounts = [], date }) {
  const received = paymentReceived(form);

  const balance = Math.max(0, Number(total || 0) - received);

  const dueDate = (days) => {
    if (!date) return '';

    const value = new Date(`${date}T00:00:00Z`);

    if (Number.isNaN(value.getTime())) {
      return '';
    }

    value.setUTCDate(value.getUTCDate() + Number(days || 0));

    return value.toISOString().slice(0, 10);
  };

  const setReceived = (value) => {
    const amount = value;

    if (!amount || Number(amount) <= 0) {
      onChange({
        receivedNow: amount,

        paymentAccountId: '',
        paymentMethod: '',

        chequeNo: '',
        chequeBank: '',
        chequeDate: '',
        chequeDueDate: '',
      });

      return;
    }

    onChange({
      receivedNow: amount,
    });
  };

  const setMethod = (paymentMethod) => {
    if (paymentMethod !== 'cheque') {
      onChange({
        paymentMethod,

        chequeNo: '',
        chequeBank: '',
        chequeDate: '',
        chequeDueDate: '',
      });

      return;
    }

    onChange({
      paymentMethod,
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* RECEIVED AMOUNT */}
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label={t('weaving.salesCleanup.receivedAmount')}
          placeholder={t('weaving.salesCleanup.receivedAmount')}
          className={salesInput}
          value={form.receivedNow || ''}
          onChange={(event) => setReceived(event.target.value)}
        />

        {/* ACCOUNT + METHOD ONLY WHEN MONEY RECEIVED */}
        {received > 0 && (
          <>
            <select
              aria-label={t('weaving.sales.paymentAccount')}
              className={salesInput}
              value={form.paymentAccountId || ''}
              onChange={(event) =>
                onChange({
                  paymentAccountId: event.target.value,
                })
              }
            >
              <option value="">{t('weaving.salesPro.selectAccount')}</option>

              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              aria-label={t('weaving.sales.paymentMethod')}
              className={salesInput}
              value={form.paymentMethod || ''}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">{t('weaving.salesCleanup.selectMethod')}</option>

              {['cash', 'bank', 'online', 'cheque'].map((method) => (
                <option key={method} value={method}>
                  {t(`weaving.salesPro.${method}`)}
                </option>
              ))}
            </select>
          </>
        )}

        {/* CREDIT DAYS / DUE DATE */}
        {balance > 0 && (
          <>
            <input
              type="number"
              min="0"
              step="1"
              aria-label={t('weaving.sales.creditDays')}
              placeholder={t('weaving.sales.creditDays')}
              className={salesInput}
              value={form.creditDays || ''}
              onChange={(event) =>
                onChange({
                  creditDays: event.target.value,

                  dueDate: dueDate(event.target.value),
                })
              }
            />

            <input
              type="date"
              aria-label={t('weaving.sales.dueDate')}
              title={t('weaving.sales.dueDate')}
              className={salesInput}
              value={form.dueDate || dueDate(form.creditDays)}
              onChange={(event) =>
                onChange({
                  dueDate: event.target.value,
                })
              }
            />
          </>
        )}
      </div>

      {/* CHEQUE DETAILS */}
      {received > 0 && form.paymentMethod === 'cheque' && (
        <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            aria-label={t('weaving.salesPro.chequeNo')}
            placeholder={t('weaving.salesPro.chequeNo')}
            className={salesInput}
            value={form.chequeNo || ''}
            onChange={(event) =>
              onChange({
                chequeNo: event.target.value,
              })
            }
          />

          <input
            type="text"
            aria-label={t('weaving.salesPro.chequeBank')}
            placeholder={t('weaving.salesPro.chequeBank')}
            className={salesInput}
            value={form.chequeBank || ''}
            onChange={(event) =>
              onChange({
                chequeBank: event.target.value,
              })
            }
          />

          <label className="relative">
            <span className="pointer-events-none absolute -top-2 left-3 z-10 bg-slate-50 px-1 text-[10px] font-semibold text-slate-500">
              {t('weaving.salesPro.chequeDate')}
            </span>

            <input
              type="date"
              aria-label={t('weaving.salesPro.chequeDate')}
              className={salesInput}
              value={form.chequeDate || ''}
              onChange={(event) =>
                onChange({
                  chequeDate: event.target.value,
                })
              }
            />
          </label>

          <label className="relative">
            <span className="pointer-events-none absolute -top-2 left-3 z-10 bg-slate-50 px-1 text-[10px] font-semibold text-slate-500">
              {t('weaving.salesPro.chequeDueDate')}
            </span>

            <input
              type="date"
              aria-label={t('weaving.salesPro.chequeDueDate')}
              className={salesInput}
              value={form.chequeDueDate || ''}
              onChange={(event) =>
                onChange({
                  chequeDueDate: event.target.value,
                })
              }
            />
          </label>
        </div>
      )}

      {/* SMALL AMOUNT INFO ONLY */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-slate-500">
        <span>
          {t('weaving.salesPro.finalAmount')}:{' '}
          <b className="text-slate-800">
            Rs.{' '}
            {Number(total || 0).toLocaleString('en-PK', {
              maximumFractionDigits: 2,
            })}
          </b>
        </span>

        {received > 0 && (
          <span>
            {t('weaving.salesCleanup.receivedAmount')}:{' '}
            <b className="text-emerald-700">
              Rs.{' '}
              {received.toLocaleString('en-PK', {
                maximumFractionDigits: 2,
              })}
            </b>
          </span>
        )}

        {balance > 0 && (
          <span>
            {t('weaving.salesPro.balance')}:{' '}
            <b className="text-amber-700">
              Rs.{' '}
              {balance.toLocaleString('en-PK', {
                maximumFractionDigits: 2,
              })}
            </b>
          </span>
        )}

        {received > Number(total || 0) && (
          <span>
            {t('weaving.salesCleanup.excess')}:{' '}
            <b className="text-blue-700">
              Rs.{' '}
              {(received - Number(total || 0)).toLocaleString('en-PK', {
                maximumFractionDigits: 2,
              })}
            </b>
          </span>
        )}
      </div>
    </section>
  );
}
