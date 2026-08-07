import React, { useEffect, useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  createBusinessAsset,
  updateBusinessAsset,
  getEmptyBusinessAsset,
  calculateAssetPurchaseValue,
  calculateAssetCurrentValue,
  formatAssetAmount,
} from '../../services/businessAssetService';

const BusinessAssetForm = ({
  isOpen,
  asset = null,
  categories = [],
  titles = [],
  onClose,
  onSaved,
  onManageCategories,
}) => {
  const [formData, setFormData] = useState(getEmptyBusinessAsset());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(asset?._id);

  useEffect(() => {
    if (!isOpen) return;

    if (asset) {
      setFormData({
        categoryId:
          typeof asset.categoryId === 'object'
            ? asset.categoryId?._id || ''
            : asset.categoryId || '',
        name: asset.name || '',
        quantity: asset.quantity ?? 1,
        purchaseCost: asset.purchaseCost ?? 0,
        currentValue: asset.currentValue ?? 0,
        purchaseDate: asset.purchaseDate
          ? new Date(asset.purchaseDate).toISOString().slice(0, 10)
          : '',
        notes: asset.notes || '',
        status: asset.status || 'active',
      });
    } else {
      setFormData(getEmptyBusinessAsset());
    }

    setError('');
  }, [asset, isOpen]);

  const purchaseValue = useMemo(() => calculateAssetPurchaseValue(formData), [formData]);

  const currentValue = useMemo(() => calculateAssetCurrentValue(formData), [formData]);

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleTitleChange = (event) => {
    handleChange('name', event.target.value);
  };

  const validateForm = () => {
    if (!String(formData.name || '').trim()) {
      return t('businessValue.assetNameRequired');
    }

    if (!formData.categoryId) {
      return t('businessValue.assetCategoryRequired');
    }

    if (Number(formData.quantity) <= 0) {
      return t('businessValue.assetQuantityInvalid');
    }

    if (Number(formData.purchaseCost) < 0) {
      return t('businessValue.assetPurchaseCostInvalid');
    }

    if (Number(formData.currentValue) < 0) {
      return t('businessValue.assetCurrentValueInvalid');
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

      const result = isEditing
        ? await updateBusinessAsset(asset._id, formData)
        : await createBusinessAsset(formData);

      if (onSaved) {
        onSaved(result.asset);
      }

      onClose();
    } catch (err) {
      setError(
        err.message ||
          (isEditing ? t('businessValue.assetUpdateFailed') : t('businessValue.assetCreateFailed'))
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
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-600 px-4 py-4 text-white sm:px-5">
          <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 left-16 h-28 w-28 rounded-full bg-cyan-200/10" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl shadow-sm backdrop-blur">
                🏢
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-black sm:text-xl">
                  {isEditing ? t('businessValue.editAsset') : t('businessValue.addAsset')}
                </h2>

                <p className="mt-0.5 truncate text-xs text-white/75">
                  {t('businessValue.assetFormDescription')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg hover:bg-white/25 disabled:opacity-50"
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
                  list="business-asset-titles"
                  type="text"
                  value={formData.name}
                  onChange={handleTitleChange}
                  placeholder={t('businessValue.assetNamePlaceholder')}
                  disabled={saving}
                  maxLength={120}
                  className={inputClass}
                  autoFocus
                />

                <datalist id="business-asset-titles">
                  {titles.map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
              </div>

              <div className="flex gap-2">
                <select
                  value={formData.categoryId}
                  onChange={(event) => handleChange('categoryId', event.target.value)}
                  disabled={saving}
                  className={`${inputClass} min-w-0 flex-1`}
                >
                  <option value="">{t('businessValue.selectAssetCategory')}</option>

                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                {onManageCategories && (
                  <button
                    type="button"
                    onClick={onManageCategories}
                    disabled={saving}
                    title={t('businessValue.manageAssetCategories')}
                    className="
                      flex h-10 w-10 shrink-0 items-center justify-center
                      rounded-xl border border-indigo-200 bg-indigo-50
                      font-bold text-indigo-700 transition hover:bg-indigo-100
                      disabled:opacity-50
                    "
                  >
                    ⚙
                  </button>
                )}
              </div>

              <select
                value={formData.status}
                onChange={(event) => handleChange('status', event.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="active">{t('businessValue.assetStatusActive')}</option>
                <option value="sold">{t('businessValue.assetStatusSold')}</option>
                <option value="removed">{t('businessValue.assetStatusRemoved')}</option>
              </select>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formData.quantity}
                onChange={(event) => handleChange('quantity', event.target.value)}
                placeholder={t('businessValue.quantityPlaceholder')}
                disabled={saving}
                className={inputClass}
              />

              <input
                type="date"
                value={formData.purchaseDate}
                onChange={(event) => handleChange('purchaseDate', event.target.value)}
                disabled={saving}
                title={t('businessValue.purchaseDate')}
                className={inputClass}
              />

              <div className="relative">
                <span className={currencyPrefixClass}>{t('currency.rs')}</span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.purchaseCost}
                  onChange={(event) => handleChange('purchaseCost', event.target.value)}
                  placeholder={t('businessValue.purchaseCostPlaceholder')}
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
                  value={formData.currentValue}
                  onChange={(event) => handleChange('currentValue', event.target.value)}
                  placeholder={t('businessValue.currentValuePlaceholder')}
                  disabled={saving}
                  className={`${inputClass} pl-12`}
                />
              </div>

              <textarea
                value={formData.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder={t('businessValue.assetNotesPlaceholder')}
                disabled={saving}
                maxLength={500}
                rows={2}
                className={`${inputClass} resize-none sm:col-span-2`}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <ValuePreview
                title={t('businessValue.totalPurchaseValue')}
                value={purchaseValue}
                icon="🧾"
                className="from-slate-700 to-slate-900"
              />

              <ValuePreview
                title={t('businessValue.totalCurrentValue')}
                value={currentValue}
                icon="💎"
                className="from-emerald-600 to-teal-600"
              />
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
                rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600
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
        {t('currency.rs')} {formatAssetAmount(value)}
      </div>
    </div>
  );
};

const inputClass = `
  h-10 w-full rounded-xl border border-gray-200 bg-gray-50
  px-3 text-sm font-medium text-gray-800 outline-none transition
  placeholder:text-gray-400
  hover:border-indigo-300 hover:bg-white
  focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100
  disabled:cursor-not-allowed disabled:opacity-60
`;

const currencyPrefixClass = `
  pointer-events-none absolute left-3 top-1/2 z-10
  -translate-y-1/2 text-xs font-bold text-gray-400
`;

export default BusinessAssetForm;
