import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { t } from '../../i18n/i18n';

import {
  BUSINESS_RECEIVABLE_PAYMENT_METHODS,
  formatReceivableLoanAmount,
  receiveBusinessReceivableLoanPayment,
} from '../../services/businessReceivableLoanService';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const PAYMENT_METHODS = [
  {
    key: BUSINESS_RECEIVABLE_PAYMENT_METHODS.CASH,
    labelKey: 'businessValue.receivableLoanPaymentMethodCash',
    icon: '💵',
    categories: ['cash'],
  },
  {
    key: BUSINESS_RECEIVABLE_PAYMENT_METHODS.BANK,
    labelKey: 'businessValue.receivableLoanPaymentMethodBank',
    icon: '🏦',
    categories: ['bank'],
  },
  {
    key: BUSINESS_RECEIVABLE_PAYMENT_METHODS.ONLINE,
    labelKey: 'businessValue.receivableLoanPaymentMethodOnline',
    icon: '📲',
    categories: ['online'],
  },
  {
    key: BUSINESS_RECEIVABLE_PAYMENT_METHODS.CHEQUE,
    labelKey: 'businessValue.receivableLoanPaymentMethodCheque',
    icon: '🧾',
    categories: ['cheque'],
  },
];

const getAuthConfig = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getToday = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const BusinessReceivableLoanPaymentForm = ({
  isOpen = false,
  loan = null,
  onClose,
  onReceived,
}) => {
  const [form, setForm] = useState({
    amount: '',
    paymentDate: getToday(),
    paymentMethod: BUSINESS_RECEIVABLE_PAYMENT_METHODS.CASH,
    accountId: '',
    referenceNo: '',
    note: '',
  });

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const originalAmount = Number(loan?.originalAmount || 0);

  const remainingAmount = Number(loan?.remainingAmount || 0);

  const receivedAmount = Math.max(originalAmount - remainingAmount, 0);

  const selectedMethod = useMemo(() => {
    return (
      PAYMENT_METHODS.find((method) => method.key === form.paymentMethod) || PAYMENT_METHODS[0]
    );
  }, [form.paymentMethod]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (!account) return false;

      if (account.type !== 'Asset') {
        return false;
      }

      if (account.isActive === false) {
        return false;
      }

      return selectedMethod.categories.includes(String(account.category || '').toLowerCase());
    });
  }, [accounts, selectedMethod]);

  useEffect(() => {
    if (!isOpen) return;

    setForm({
      amount: '',
      paymentDate: getToday(),
      paymentMethod: BUSINESS_RECEIVABLE_PAYMENT_METHODS.CASH,
      accountId: '',
      referenceNo: '',
      note: '',
    });

    setError('');
  }, [isOpen, loan?._id]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    const loadAccounts = async () => {
      try {
        setAccountsLoading(true);

        const response = await axios.get(
          `${BASE_URL}/api/accounts?filter=payment`,
          getAuthConfig()
        );

        if (!active) return;

        const data = response.data;

        const loadedAccounts = Array.isArray(data)
          ? data
          : Array.isArray(data?.accounts)
            ? data.accounts
            : Array.isArray(data?.data)
              ? data.data
              : [];

        setAccounts(loadedAccounts);
      } catch (loadError) {
        console.error('Receivable Loan Receiving Accounts Error:', loadError);

        if (active) {
          setAccounts([]);
          setError(t('businessValue.receivableLoanReceivingAccountsLoadFailed'));
        }
      } finally {
        if (active) {
          setAccountsLoading(false);
        }
      }
    };

    loadAccounts();

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const currentAccountIsValid = filteredAccounts.some(
      (account) => account._id === form.accountId
    );

    if (!currentAccountIsValid) {
      setForm((current) => ({
        ...current,
        accountId: filteredAccounts.length === 1 ? filteredAccounts[0]._id : '',
      }));
    }
  }, [filteredAccounts, form.accountId, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError('');
    }
  };

  const handleMethodChange = (method) => {
    setForm((current) => ({
      ...current,
      paymentMethod: method,
      accountId: '',
    }));

    setError('');
  };

  const handleReceiveFull = () => {
    if (remainingAmount <= 0) return;

    updateField('amount', String(remainingAmount));
  };

  const validateForm = () => {
    const amount = Number(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return t('businessValue.receivableLoanReceiveAmountRequired');
    }

    if (amount > remainingAmount) {
      return t('businessValue.receivableLoanReceiveExceedsRemaining');
    }

    if (!form.paymentDate) {
      return t('businessValue.receivableLoanReceiveDateRequired');
    }

    if (!form.paymentMethod) {
      return t('businessValue.receivableLoanReceiveMethodRequired');
    }

    if (!form.accountId) {
      return t('businessValue.receivableLoanReceivingAccountRequired');
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!loan?._id || saving) return;

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const result = await receiveBusinessReceivableLoanPayment(loan._id, {
        amount: Number(form.amount),
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        accountId: form.accountId,
        referenceNo: form.referenceNo,
        note: form.note,
      });

      if (onReceived) {
        await onReceived(result);
      }

      if (onClose) {
        onClose();
      }
    } catch (submitError) {
      console.error('Receive Business Receivable Loan Payment Error:', submitError);

      setError(submitError.message || t('businessValue.receivableLoanReceiveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !loan) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={saving ? undefined : onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={handleSubmit}
        className="
          relative z-10 flex max-h-[92vh]
          w-full max-w-[640px]
          flex-col overflow-hidden
          rounded-3xl border border-white/60
          bg-white shadow-2xl
        "
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 px-4 py-3.5 text-white sm:px-5">
          <div className="absolute -right-10 -top-14 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-inner">
                💰
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-base font-black sm:text-lg">
                  {t('businessValue.receiveReceivableLoanPayment')}
                </h2>

                <p className="mt-0.5 truncate text-xs font-medium text-white/75">
                  {loan.borrowerName}
                  {loan.title ? ` • ${loan.title}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="
                flex h-9 w-9 shrink-0
                items-center justify-center
                rounded-xl bg-white/10
                text-lg transition
                hover:bg-white/20
                disabled:opacity-50
              "
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/80 p-3 sm:px-5">
          <AmountStat
            label={t('businessValue.originalAmount')}
            value={originalAmount}
            variant="neutral"
          />

          <AmountStat
            label={t('businessValue.totalReceived')}
            value={receivedAmount}
            variant="success"
          />

          <AmountStat
            label={t('businessValue.remainingAmount')}
            value={remainingAmount}
            variant="danger"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-3 sm:p-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                <span className="mt-0.5">⚠</span>

                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  max={remainingAmount}
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => updateField('amount', event.target.value)}
                  disabled={saving}
                  placeholder={t('businessValue.receivableLoanReceiveAmountPlaceholder')}
                  className="
                    h-11 w-full rounded-xl
                    border border-slate-200
                    bg-slate-50 px-3 pr-20
                    text-sm font-black text-slate-700
                    outline-none transition
                    placeholder:font-medium
                    placeholder:text-slate-400
                    focus:border-emerald-400
                    focus:bg-white
                    focus:ring-2
                    focus:ring-emerald-100
                  "
                />

                <button
                  type="button"
                  onClick={handleReceiveFull}
                  disabled={saving || remainingAmount <= 0}
                  className="
                    absolute right-1.5 top-1/2
                    -translate-y-1/2
                    rounded-lg bg-emerald-100
                    px-2 py-1 text-[10px]
                    font-black text-emerald-700
                    transition hover:bg-emerald-200
                    disabled:opacity-50
                  "
                >
                  {t('businessValue.receiveFullAmount')}
                </button>
              </div>

              <input
                type="date"
                value={form.paymentDate}
                onChange={(event) => updateField('paymentDate', event.target.value)}
                disabled={saving}
                className="
                  h-11 w-full rounded-xl
                  border border-slate-200
                  bg-slate-50 px-3
                  text-sm font-semibold
                  text-slate-700 outline-none
                  transition
                  focus:border-emerald-400
                  focus:bg-white
                  focus:ring-2
                  focus:ring-emerald-100
                "
              />
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-slate-700">
                    {t('businessValue.receivableLoanReceivedInto')}
                  </div>

                  <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                    {t('businessValue.receivableLoanReceivedIntoDescription')}
                  </div>
                </div>

                <span className="text-lg">↙</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((method) => {
                  const active = form.paymentMethod === method.key;

                  return (
                    <button
                      key={method.key}
                      type="button"
                      onClick={() => handleMethodChange(method.key)}
                      disabled={saving}
                      className={`
                        flex min-w-0 flex-col
                        items-center justify-center
                        gap-0.5 rounded-xl border
                        px-1 py-2 transition
                        ${
                          active
                            ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100'
                            : 'border-transparent bg-white/60 text-slate-500 hover:bg-white'
                        }
                        disabled:opacity-50
                      `}
                    >
                      <span className="text-base">{method.icon}</span>

                      <span className="w-full truncate text-[10px] font-black sm:text-xs">
                        {t(method.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <select
                value={form.accountId}
                onChange={(event) => updateField('accountId', event.target.value)}
                disabled={saving || accountsLoading}
                className="
                  h-11 w-full appearance-none
                  rounded-xl border
                  border-slate-200 bg-slate-50
                  px-3 pr-9 text-sm font-semibold
                  text-slate-700 outline-none
                  transition
                  focus:border-emerald-400
                  focus:bg-white
                  focus:ring-2
                  focus:ring-emerald-100
                  disabled:opacity-60
                "
              >
                <option value="">
                  {accountsLoading
                    ? t('businessValue.loadingReceivableLoanReceivingAccounts')
                    : t('businessValue.selectReceivableLoanReceivingAccount')}
                </option>

                {filteredAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name}
                    {account.code ? ` (${account.code})` : ''}
                  </option>
                ))}
              </select>

              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                ▾
              </span>
            </div>

            {!accountsLoading && filteredAccounts.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {t('businessValue.noReceivableLoanReceivingAccountForMethod')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input
                type="text"
                value={form.referenceNo}
                onChange={(event) => updateField('referenceNo', event.target.value)}
                maxLength={100}
                disabled={saving}
                placeholder={t('businessValue.receivableLoanReceiveReferencePlaceholder')}
                className="
                  h-11 rounded-xl border
                  border-slate-200 bg-slate-50
                  px-3 text-sm text-slate-700
                  outline-none transition
                  placeholder:text-slate-400
                  focus:border-emerald-400
                  focus:bg-white
                  focus:ring-2
                  focus:ring-emerald-100
                "
              />

              <input
                type="text"
                value={form.note}
                onChange={(event) => updateField('note', event.target.value)}
                maxLength={500}
                disabled={saving}
                placeholder={t('businessValue.receivableLoanReceiveNotePlaceholder')}
                className="
                  h-11 rounded-xl border
                  border-slate-200 bg-slate-50
                  px-3 text-sm text-slate-700
                  outline-none transition
                  placeholder:text-slate-400
                  focus:border-emerald-400
                  focus:bg-white
                  focus:ring-2
                  focus:ring-emerald-100
                "
              />
            </div>

            <div className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-emerald-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">
                  {t('businessValue.receivableLoanRemainingAfterReceipt')}
                </span>

                <span className="text-sm font-black text-emerald-700">
                  {t('currency.rs')}{' '}
                  {formatReceivableLoanAmount(
                    Math.max(remainingAmount - Number(form.amount || 0), 0)
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
              <span className="font-black">{t('businessValue.accountingEffect')}:</span>{' '}
              {t('businessValue.receivableLoanReceiptAccountingEffect')}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-3 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="
              h-10 rounded-xl border
              border-slate-200 bg-white
              px-4 text-sm font-bold
              text-slate-600 transition
              hover:bg-slate-50
              disabled:opacity-50
            "
          >
            {t('common.cancel')}
          </button>

          <button
            type="submit"
            disabled={saving || remainingAmount <= 0 || !form.accountId}
            className="
              inline-flex h-10 min-w-[140px]
              items-center justify-center
              gap-2 rounded-xl
              bg-gradient-to-r
              from-emerald-600 via-teal-600
              to-cyan-600 px-4
              text-sm font-black text-white
              shadow-md transition
              hover:-translate-y-0.5
              hover:shadow-lg
              disabled:cursor-not-allowed
              disabled:opacity-50
              disabled:hover:translate-y-0
            "
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />

                <span>{t('businessValue.receivingLoanPayment')}</span>
              </>
            ) : (
              <>
                <span>✓</span>

                <span>{t('businessValue.receiveLoanPaymentNow')}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const AmountStat = ({ label, value, variant = 'neutral' }) => {
  const styles = {
    neutral: 'border-slate-200 bg-white text-slate-700',

    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',

    danger: 'border-rose-200 bg-rose-50 text-rose-700',
  };

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

      <div className="mt-0.5 truncate text-xs font-black sm:text-sm">
        {t('currency.rs')} {formatReceivableLoanAmount(value)}
      </div>
    </div>
  );
};

export default BusinessReceivableLoanPaymentForm;
