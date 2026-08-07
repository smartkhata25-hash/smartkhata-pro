import React, { useEffect, useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  createBusinessLiability,
  updateBusinessLiability,
  getEmptyBusinessLiability,
  calculatePaidLiabilityAmount,
  calculateLiabilityProgress,
  formatLiabilityAmount,
} from '../../services/businessLiabilityService';

const LIABILITY_CATEGORIES = [
  {
    value: 'loan',
    labelKey: 'businessValue.liabilityCategoryLoan',
  },
  {
    value: 'bank_loan',
    labelKey: 'businessValue.liabilityCategoryBankLoan',
  },
  {
    value: 'supplier',
    labelKey: 'businessValue.liabilityCategorySupplier',
  },
  {
    value: 'credit',
    labelKey: 'businessValue.liabilityCategoryCredit',
  },
  {
    value: 'tax',
    labelKey: 'businessValue.liabilityCategoryTax',
  },
  {
    value: 'other',
    labelKey: 'businessValue.liabilityCategoryOther',
  },
];

const BusinessLiabilityForm = ({ isOpen, liability = null, titles = [], onClose, onSaved }) => {
  const [formData, setFormData] = useState(getEmptyBusinessLiability());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(liability?._id);

  useEffect(() => {
    if (!isOpen) return;

    if (liability) {
      setFormData({
        title: liability.title || '',
        category: liability.category || 'other',
        originalAmount: liability.originalAmount ?? 0,
        remainingAmount: liability.remainingAmount ?? 0,
        startDate: liability.startDate
          ? new Date(liability.startDate).toISOString().slice(0, 10)
          : '',
        notes: liability.notes || '',
        status: liability.status || 'active',
      });
    } else {
      setFormData(getEmptyBusinessLiability());
    }

    setError('');
  }, [isOpen, liability]);

  const paidAmount = useMemo(() => calculatePaidLiabilityAmount(formData), [formData]);

  const progress = useMemo(() => calculateLiabilityProgress(formData), [formData]);

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateForm = () => {
    const originalAmount = Number(formData.originalAmount);
    const remainingAmount =
      formData.remainingAmount === '' ? originalAmount : Number(formData.remainingAmount);

    if (!String(formData.title || '').trim()) {
      return t('businessValue.liabilityTitleRequired');
    }

    if (!Number.isFinite(originalAmount) || originalAmount < 0) {
      return t('businessValue.originalAmountInvalid');
    }

    if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
      return t('businessValue.remainingAmountInvalid');
    }

    if (remainingAmount > originalAmount) {
      return t('businessValue.remainingExceedsOriginal');
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        ...formData,
        remainingAmount:
          formData.remainingAmount === ''
            ? Number(formData.originalAmount || 0)
            : Number(formData.remainingAmount || 0),
      };

      const result = isEditing
        ? await updateBusinessLiability(liability._id, payload)
        : await createBusinessLiability(payload);

      if (onSaved) {
        onSaved(result.liability);
      }

      onClose();
    } catch (err) {
      setError(
        err.message ||
          (isEditing
            ? t('businessValue.liabilityUpdateFailed')
            : t('businessValue.liabilityCreateFailed'))
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="
          flex max-h-[94vh] w-full flex-col overflow-hidden
          rounded-t-3xl border border-white/20 bg-white shadow-2xl
          sm:max-w-3xl sm:rounded-3xl
        "
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-rose-700 via-red-600 to-orange-500 px-4 py-4 text-white sm:px-5">
          <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 left-16 h-28 w-28 rounded-full bg-yellow-200/10" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl shadow-sm backdrop-blur">
                💳
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-black sm:text-xl">
                  {isEditing ? t('businessValue.editLiability') : t('businessValue.addLiability')}
                </h2>

                <p className="mt-0.5 truncate text-xs text-white/75">
                  {t('businessValue.liabilityFormDescription')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg transition hover:bg-white/25 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <input
                  list="business-liability-titles"
                  type="text"
                  value={formData.title}
                  onChange={(event) => handleChange('title', event.target.value)}
                  placeholder={t('businessValue.liabilityTitlePlaceholder')}
                  disabled={saving}
                  maxLength={120}
                  className={inputClass}
                  autoFocus
                />

                <datalist id="business-liability-titles">
                  {titles.map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
              </div>

              <select
                value={formData.category}
                onChange={(event) => handleChange('category', event.target.value)}
                disabled={saving}
                className={inputClass}
              >
                {LIABILITY_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {t(category.labelKey)}
                  </option>
                ))}
              </select>

              <select
                value={formData.status}
                onChange={(event) => handleChange('status', event.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="active">{t('businessValue.liabilityStatusActive')}</option>

                <option value="closed">{t('businessValue.liabilityStatusClosed')}</option>
              </select>

              <div className="relative">
                <span className={currencyPrefixClass}>{t('currency.rs')}</span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.originalAmount}
                  onChange={(event) => handleChange('originalAmount', event.target.value)}
                  placeholder={t('businessValue.originalAmountPlaceholder')}
                  disabled={saving}
                  className={`${inputClass} pl-12`}
                />
              </div>

              <div className="relative">
                <span className={currencyPrefixClass}>{t('currency.rs')}</span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.remainingAmount}
                  onChange={(event) => handleChange('remainingAmount', event.target.value)}
                  placeholder={t('businessValue.remainingAmountPlaceholder')}
                  disabled={saving}
                  className={`${inputClass} pl-12`}
                />
              </div>

              <input
                type="date"
                value={formData.startDate}
                onChange={(event) => handleChange('startDate', event.target.value)}
                disabled={saving}
                title={t('businessValue.liabilityStartDate')}
                className={inputClass}
              />

              <textarea
                value={formData.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder={t('businessValue.liabilityNotesPlaceholder')}
                disabled={saving}
                maxLength={500}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <ValuePreview
                title={t('businessValue.paidAmount')}
                value={paidAmount}
                icon="✓"
                className="from-emerald-600 to-teal-600"
              />

              <ValuePreview
                title={t('businessValue.remainingAmount')}
                value={formData.remainingAmount || 0}
                icon="💳"
                className="from-rose-600 to-orange-500"
              />
            </div>

            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-600">
                <span>{t('businessValue.liabilityPaymentProgress')}</span>

                <span>{Math.round(progress)}%</span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(Math.max(progress, 0), 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-white px-3 py-3 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="
                h-10 rounded-xl border border-gray-200 bg-white px-4
                text-sm font-bold text-gray-600 transition hover:bg-gray-50
                disabled:opacity-50
              "
            >
              {t('common.cancel')}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="
                inline-flex h-10 min-w-[130px] items-center justify-center gap-2
                rounded-xl bg-gradient-to-r from-rose-600 to-orange-500
                px-5 text-sm font-black text-white shadow-md transition
                hover:-translate-y-0.5 hover:shadow-lg
                disabled:cursor-not-allowed disabled:opacity-50
                disabled:hover:translate-y-0
              "
            >
              {saving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}

              {saving ? t('common.saving') : isEditing ? t('common.update') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ValuePreview = ({ title, value, icon, className }) => {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${className} p-3 text-white shadow-sm`}>
      <div className="flex items-center gap-2 text-[11px] font-medium text-white/75">
        <span>{icon}</span>
        <span className="truncate">{title}</span>
      </div>

      <div className="mt-1 truncate text-sm font-black sm:text-base">
        {t('currency.rs')} {formatLiabilityAmount(value)}
      </div>
    </div>
  );
};

const inputClass = `
  h-10 w-full rounded-xl border border-gray-200 bg-gray-50
  px-3 text-sm font-medium text-gray-800 outline-none transition
  placeholder:text-gray-400
  hover:border-rose-300 hover:bg-white
  focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-100
  disabled:cursor-not-allowed disabled:opacity-60
`;

const currencyPrefixClass = `
  pointer-events-none absolute left-3 top-1/2 z-10
  -translate-y-1/2 text-xs font-bold text-gray-400
`;

export default BusinessLiabilityForm;
