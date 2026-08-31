import React, { useEffect, useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';
import { getValidPaymentAccounts } from '../../services/accountService';

import {
  BUSINESS_RECEIVABLE_BORROWER_TYPES,
  BUSINESS_RECEIVABLE_PAYMENT_METHODS,
  createBusinessReceivableLoan,
  getEmptyBusinessReceivableLoan,
  updateBusinessReceivableLoan,
} from '../../services/businessReceivableLoanService';

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

const BORROWER_TYPES = [
  {
    key: BUSINESS_RECEIVABLE_BORROWER_TYPES.PERSON,
    labelKey: 'businessValue.borrowerTypePerson',
  },
  {
    key: BUSINESS_RECEIVABLE_BORROWER_TYPES.EMPLOYEE,
    labelKey: 'businessValue.borrowerTypeEmployee',
  },
  {
    key: BUSINESS_RECEIVABLE_BORROWER_TYPES.CUSTOMER,
    labelKey: 'businessValue.borrowerTypeCustomer',
  },
  {
    key: BUSINESS_RECEIVABLE_BORROWER_TYPES.SUPPLIER,
    labelKey: 'businessValue.borrowerTypeSupplier',
  },
  {
    key: BUSINESS_RECEIVABLE_BORROWER_TYPES.OTHER,
    labelKey: 'businessValue.borrowerTypeOther',
  },
];

const getToday = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatDateForInput = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const BusinessReceivableLoanForm = ({
  isOpen = false,
  loan = null,
  onClose,
  onSaved,
  moduleScope,
}) => {
  const isEditing = Boolean(loan?._id);

  const [form, setForm] = useState({
    ...getEmptyBusinessReceivableLoan(),
    startDate: getToday(),
  });

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

    if (loan?._id) {
      setForm({
        title: loan.title || '',
        borrowerName: loan.borrowerName || '',
        borrowerType: loan.borrowerType || 'person',
        originalAmount: Number(loan.originalAmount || 0),
        startDate: formatDateForInput(loan.startDate),
        dueDate: formatDateForInput(loan.dueDate),
        notes: loan.notes || '',
        paymentMethod: 'cash',
        accountId: '',
      });
    } else {
      setForm({
        ...getEmptyBusinessReceivableLoan(),
        startDate: getToday(),
      });
    }

    setError('');
  }, [isOpen, loan]);

  useEffect(() => {
    if (!isOpen || isEditing) return;

    let active = true;

    const loadAccounts = async () => {
      try {
        setAccountsLoading(true);

        const loadedAccounts = await getValidPaymentAccounts({
          forceRefresh: true,
          moduleScope,
        });

        if (!active) return;

        setAccounts(Array.isArray(loadedAccounts) ? loadedAccounts : []);
      } catch (loadError) {
        console.error('Receivable Loan Payment Accounts Load Error:', loadError);

        if (active) {
          setAccounts([]);
          setError(t('businessValue.receivableLoanAccountsLoadFailed'));
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
  }, [isOpen, isEditing, moduleScope]);

  useEffect(() => {
    if (!isOpen || isEditing) return;

    const selectedStillValid = filteredAccounts.some((account) => account._id === form.accountId);

    if (!selectedStillValid) {
      setForm((current) => ({
        ...current,
        accountId: filteredAccounts.length === 1 ? filteredAccounts[0]._id : '',
      }));
    }
  }, [filteredAccounts, form.accountId, isEditing, isOpen]);

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

  const handlePaymentMethodChange = (method) => {
    setForm((current) => ({
      ...current,
      paymentMethod: method,
      accountId: '',
    }));

    setError('');
  };

  const validateForm = () => {
    if (!String(form.title || '').trim()) {
      return t('businessValue.receivableLoanTitleRequired');
    }

    if (!String(form.borrowerName || '').trim()) {
      return t('businessValue.borrowerNameRequired');
    }

    if (!form.borrowerType) {
      return t('businessValue.borrowerTypeRequired');
    }

    if (!isEditing) {
      const amount = Number(form.originalAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return t('businessValue.receivableLoanAmountRequired');
      }

      if (!form.paymentMethod) {
        return t('businessValue.receivableLoanPaymentMethodRequired');
      }

      if (!form.accountId) {
        return t('businessValue.receivableLoanAccountRequired');
      }
    }

    if (!form.startDate) {
      return t('businessValue.receivableLoanStartDateRequired');
    }

    if (form.dueDate && new Date(form.dueDate) < new Date(form.startDate)) {
      return t('businessValue.receivableLoanDueDateInvalid');
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) return;

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');

      let result;

      if (isEditing) {
        result = await updateBusinessReceivableLoan(loan._id, {
          title: form.title,
          borrowerName: form.borrowerName,
          borrowerType: form.borrowerType,
          startDate: form.startDate,
          dueDate: form.dueDate,
          notes: form.notes,
        }, { moduleScope });
      } else {
        result = await createBusinessReceivableLoan({
          title: form.title,
          borrowerName: form.borrowerName,
          borrowerType: form.borrowerType,
          originalAmount: Number(form.originalAmount),
          startDate: form.startDate,
          dueDate: form.dueDate,
          notes: form.notes,
          paymentMethod: form.paymentMethod,
          accountId: form.accountId,
        }, { moduleScope });
      }

      if (onSaved) {
        await onSaved(result);
      }

      if (onClose) {
        onClose();
      }
    } catch (submitError) {
      console.error('Business Receivable Loan Form Error:', submitError);

      setError(submitError.message || t('businessValue.receivableLoanSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
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
          relative z-10 flex max-h-[94vh] w-full
          max-w-[700px] flex-col overflow-hidden
          rounded-3xl border border-white/60
          bg-white shadow-2xl
        "
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-700 px-4 py-3.5 text-white sm:px-5">
          <div className="absolute -right-10 -top-14 h-32 w-32 rounded-full bg-white/10 blur-xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl shadow-inner">
                🤝
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-base font-black sm:text-lg">
                  {isEditing
                    ? t('businessValue.editReceivableLoan')
                    : t('businessValue.addReceivableLoan')}
                </h2>

                <p className="mt-0.5 truncate text-xs font-medium text-white/75">
                  {isEditing
                    ? t('businessValue.editReceivableLoanDescription')
                    : t('businessValue.addReceivableLoanDescription')}
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-3 sm:p-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                maxLength={120}
                disabled={saving}
                placeholder={t('businessValue.receivableLoanTitlePlaceholder')}
                className="
                  h-11 rounded-xl border border-slate-200
                  bg-slate-50 px-3 text-sm font-semibold
                  text-slate-700 outline-none transition
                  placeholder:font-medium placeholder:text-slate-400
                  focus:border-cyan-400 focus:bg-white
                  focus:ring-2 focus:ring-cyan-100
                "
              />

              <input
                type="text"
                value={form.borrowerName}
                onChange={(event) => updateField('borrowerName', event.target.value)}
                maxLength={120}
                disabled={saving}
                placeholder={t('businessValue.borrowerNamePlaceholder')}
                className="
                  h-11 rounded-xl border border-slate-200
                  bg-slate-50 px-3 text-sm font-semibold
                  text-slate-700 outline-none transition
                  placeholder:font-medium placeholder:text-slate-400
                  focus:border-cyan-400 focus:bg-white
                  focus:ring-2 focus:ring-cyan-100
                "
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <select
                value={form.borrowerType}
                onChange={(event) => updateField('borrowerType', event.target.value)}
                disabled={saving}
                className="
                  h-11 rounded-xl border border-slate-200
                  bg-slate-50 px-3 text-sm font-semibold
                  text-slate-700 outline-none transition
                  focus:border-cyan-400 focus:bg-white
                  focus:ring-2 focus:ring-cyan-100
                "
              >
                {BORROWER_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>
                    {t(type.labelKey)}
                  </option>
                ))}
              </select>

              {!isEditing ? (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.originalAmount}
                  onChange={(event) => updateField('originalAmount', event.target.value)}
                  disabled={saving}
                  placeholder={t('businessValue.receivableLoanAmountPlaceholder')}
                  className="
                    h-11 rounded-xl border border-slate-200
                    bg-slate-50 px-3 text-sm font-black
                    text-slate-700 outline-none transition
                    placeholder:font-medium placeholder:text-slate-400
                    focus:border-cyan-400 focus:bg-white
                    focus:ring-2 focus:ring-cyan-100
                  "
                />
              ) : (
                <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span className="text-xs font-semibold text-slate-400">
                    {t('businessValue.originalAmount')}
                  </span>

                  <span className="text-sm font-black text-slate-700">
                    {Number(loan?.originalAmount || 0).toLocaleString('en-PK')}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="relative">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => updateField('startDate', event.target.value)}
                  disabled={saving}
                  className="
                    h-11 w-full rounded-xl border border-slate-200
                    bg-slate-50 px-3 text-sm font-semibold
                    text-slate-700 outline-none transition
                    focus:border-cyan-400 focus:bg-white
                    focus:ring-2 focus:ring-cyan-100
                  "
                />

                <span className="pointer-events-none absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {t('businessValue.receivableLoanStartDate')}
                </span>
              </div>

              <div className="relative">
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => updateField('dueDate', event.target.value)}
                  disabled={saving}
                  className="
                    h-11 w-full rounded-xl border border-slate-200
                    bg-slate-50 px-3 text-sm font-semibold
                    text-slate-700 outline-none transition
                    focus:border-cyan-400 focus:bg-white
                    focus:ring-2 focus:ring-cyan-100
                  "
                />

                <span className="pointer-events-none absolute -top-2 left-3 bg-white px-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {t('businessValue.receivableLoanDueDate')}
                </span>
              </div>
            </div>

            {!isEditing && (
              <>
                <div className="rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-blue-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-slate-700">
                        {t('businessValue.loanGivenFrom')}
                      </div>

                      <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                        {t('businessValue.loanGivenFromDescription')}
                      </div>
                    </div>

                    <span className="text-lg">💸</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {PAYMENT_METHODS.map((method) => {
                      const active = form.paymentMethod === method.key;

                      return (
                        <button
                          key={method.key}
                          type="button"
                          onClick={() => handlePaymentMethodChange(method.key)}
                          disabled={saving}
                          className={`
                            flex min-w-0 flex-col
                            items-center justify-center gap-0.5
                            rounded-xl border px-1 py-2
                            transition
                            ${
                              active
                                ? 'border-cyan-300 bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-100'
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
                      rounded-xl border border-slate-200
                      bg-slate-50 px-3 pr-9 text-sm
                      font-semibold text-slate-700
                      outline-none transition
                      focus:border-cyan-400 focus:bg-white
                      focus:ring-2 focus:ring-cyan-100
                      disabled:opacity-60
                    "
                  >
                    <option value="">
                      {accountsLoading
                        ? t('businessValue.loadingReceivableLoanAccounts')
                        : t('businessValue.selectLoanSourceAccount')}
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
                    {t('businessValue.noReceivableLoanAccountForMethod')}
                  </div>
                )}
              </>
            )}

            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              maxLength={500}
              rows={3}
              disabled={saving}
              placeholder={t('businessValue.receivableLoanNotesPlaceholder')}
              className="
                min-h-[82px] w-full resize-none
                rounded-xl border border-slate-200
                bg-slate-50 px-3 py-2.5 text-sm
                text-slate-700 outline-none transition
                placeholder:text-slate-400
                focus:border-cyan-400 focus:bg-white
                focus:ring-2 focus:ring-cyan-100
              "
            />

            {!isEditing && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                <span className="font-black">{t('businessValue.accountingEffect')}:</span>{' '}
                {t('businessValue.receivableLoanAccountingEffect')}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-3 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="
              h-10 rounded-xl border border-slate-200
              bg-white px-4 text-sm font-bold
              text-slate-600 transition hover:bg-slate-50
              disabled:opacity-50
            "
          >
            {t('common.cancel')}
          </button>

          <button
            type="submit"
            disabled={saving || (!isEditing && !form.accountId)}
            className="
              inline-flex h-10 min-w-[130px]
              items-center justify-center gap-2
              rounded-xl bg-gradient-to-r
              from-cyan-600 via-blue-600 to-indigo-600
              px-4 text-sm font-black text-white
              shadow-md transition hover:-translate-y-0.5
              hover:shadow-lg disabled:cursor-not-allowed
              disabled:opacity-50
              disabled:hover:translate-y-0
            "
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />

                <span>{t('businessValue.savingReceivableLoan')}</span>
              </>
            ) : (
              <>
                <span>✓</span>

                <span>
                  {isEditing ? t('common.update') : t('businessValue.saveReceivableLoan')}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BusinessReceivableLoanForm;
