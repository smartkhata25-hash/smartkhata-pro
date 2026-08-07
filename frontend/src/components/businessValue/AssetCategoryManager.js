import React, { useEffect, useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import {
  createBusinessAssetCategory,
  deleteBusinessAssetCategory,
  fetchBusinessAssetCategories,
  getEmptyBusinessAssetCategory,
  sortBusinessAssetCategories,
  updateBusinessAssetCategory,
} from '../../services/businessAssetCategoryService';

import { hasPermission } from '../../utils/permissionHelper';

const AssetCategoryManager = ({ isOpen, onClose, onChanged }) => {
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState(getEmptyBusinessAssetCategory());

  const [editingCategory, setEditingCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');

  const canManage = hasPermission('business_assets.manage_categories');

  const isEditing = Boolean(editingCategory?._id);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await fetchBusinessAssetCategories({
        includeInactive: true,
      });

      const rows = sortBusinessAssetCategories(result.categories || []);

      setCategories(rows);
    } catch (err) {
      setError(err.message || t('businessValue.assetCategoriesLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    loadCategories();
    resetForm();
  }, [isOpen]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return categories;
    }

    return categories.filter((category) => {
      return (
        String(category.name || '')
          .toLowerCase()
          .includes(query) ||
        String(category.description || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [categories, search]);

  const resetForm = () => {
    setFormData(getEmptyBusinessAssetCategory());
    setEditingCategory(null);
    setError('');
  };

  const startEdit = (category) => {
    setEditingCategory(category);

    setFormData({
      name: category.name || '',
      description: category.description || '',
      isActive: category.isActive !== false,
    });

    setError('');
  };

  const handleChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const name = String(formData.name || '').trim();

    if (!name) {
      setError(t('businessValue.assetCategoryNameRequired'));
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (isEditing) {
        await updateBusinessAssetCategory(editingCategory._id, formData);
      } else {
        await createBusinessAssetCategory(formData);
      }

      await loadCategories();
      resetForm();

      if (onChanged) {
        onChanged();
      }
    } catch (err) {
      setError(
        err.message ||
          (isEditing
            ? t('businessValue.assetCategoryUpdateFailed')
            : t('businessValue.assetCategoryCreateFailed'))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    const confirmed = window.confirm(
      `${t('businessValue.deleteAssetCategoryConfirm')} "${category.name}"?`
    );

    if (!confirmed) return;

    try {
      setActionId(category._id);
      setError('');

      await deleteBusinessAssetCategory(category._id);

      await loadCategories();

      if (editingCategory?._id === category._id) {
        resetForm();
      }

      if (onChanged) {
        onChanged();
      }
    } catch (err) {
      setError(err.message || t('businessValue.assetCategoryDeleteFailed'));
    } finally {
      setActionId('');
    }
  };

  const handleToggleActive = async (category) => {
    try {
      setActionId(category._id);
      setError('');

      await updateBusinessAssetCategory(category._id, {
        name: category.name,
        description: category.description || '',
        isActive: category.isActive === false,
      });

      await loadCategories();

      if (onChanged) {
        onChanged();
      }
    } catch (err) {
      setError(err.message || t('businessValue.assetCategoryUpdateFailed'));
    } finally {
      setActionId('');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/20 bg-white shadow-2xl sm:max-w-4xl sm:rounded-3xl">
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-600 px-4 py-4 text-white sm:px-5">
          <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 left-20 h-32 w-32 rounded-full bg-cyan-300/10" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl shadow-sm backdrop-blur">
                🗂️
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-black sm:text-xl">
                  {t('businessValue.manageAssetCategories')}
                </h2>

                <p className="mt-0.5 truncate text-xs text-white/75">
                  {t('businessValue.assetCategoryManagerDescription')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving || Boolean(actionId)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg transition hover:bg-white/25 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[310px_1fr]">
          <div className="border-b border-gray-100 bg-gray-50/70 p-3 md:border-b-0 md:border-r">
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <input
                type="text"
                value={formData.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder={t('businessValue.assetCategoryNamePlaceholder')}
                disabled={!canManage || saving}
                maxLength={80}
                className={inputClass}
                autoFocus
              />

              <textarea
                value={formData.description}
                onChange={(event) => handleChange('description', event.target.value)}
                placeholder={t('businessValue.assetCategoryDescriptionPlaceholder')}
                disabled={!canManage || saving}
                maxLength={250}
                rows={3}
                className={`${inputClass} h-auto resize-none py-2.5`}
              />

              <label className="flex h-10 cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3">
                <span className="text-sm font-semibold text-gray-600">
                  {t('businessValue.assetCategoryActive')}
                </span>

                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(event) => handleChange('isActive', event.target.checked)}
                  disabled={!canManage || saving}
                  className="h-4 w-4 cursor-pointer accent-indigo-600"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}

              {canManage && (
                <div className="grid grid-cols-2 gap-2">
                  {isEditing && (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={saving}
                      className="h-10 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className={`
                      inline-flex h-10 items-center justify-center gap-2
                      rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600
                      px-4 text-sm font-black text-white shadow-sm transition
                      hover:-translate-y-0.5 hover:shadow-md
                      disabled:cursor-not-allowed disabled:opacity-50
                      ${isEditing ? '' : 'col-span-2'}
                    `}
                  >
                    {saving && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    )}

                    {saving
                      ? t('common.saving')
                      : isEditing
                        ? t('businessValue.updateAssetCategory')
                        : t('businessValue.addAssetCategory')}
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b border-gray-100 p-2.5 sm:p-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  🔍
                </span>

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('businessValue.searchAssetCategories')}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3">
              {loading ? (
                <CategoryLoading />
              ) : filteredCategories.length === 0 ? (
                <div className="flex min-h-[230px] flex-col items-center justify-center text-center">
                  <div className="text-4xl">🗂️</div>

                  <h3 className="mt-3 text-base font-black text-gray-800">
                    {t('businessValue.noAssetCategories')}
                  </h3>

                  <p className="mt-1 max-w-sm text-sm text-gray-500">
                    {t('businessValue.noAssetCategoriesDescription')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filteredCategories.map((category) => {
                    const busy = actionId === category._id;

                    return (
                      <div
                        key={category._id}
                        className={`
                          rounded-2xl border p-3 transition
                          ${
                            editingCategory?._id === category._id
                              ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm'
                          }
                        `}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="truncate text-sm font-black text-gray-800">
                                {category.name}
                              </h3>

                              {category.isSystem && (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">
                                  {t('businessValue.defaultCategory')}
                                </span>
                              )}
                            </div>

                            <p className="mt-1 line-clamp-2 min-h-[32px] text-xs text-gray-500">
                              {category.description || t('businessValue.noCategoryDescription')}
                            </p>
                          </div>

                          <StatusBadge active={category.isActive !== false} />
                        </div>

                        {canManage && (
                          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-100 pt-2">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(category)}
                              disabled={busy}
                              title={
                                category.isActive !== false
                                  ? t('businessValue.deactivateCategory')
                                  : t('businessValue.activateCategory')
                              }
                              className={`
                                h-8 rounded-lg px-2.5 text-xs font-bold transition
                                ${
                                  category.isActive !== false
                                    ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }
                                disabled:opacity-50
                              `}
                            >
                              {category.isActive !== false
                                ? t('businessValue.deactivate')
                                : t('businessValue.activate')}
                            </button>

                            <button
                              type="button"
                              onClick={() => startEdit(category)}
                              disabled={busy}
                              title={t('common.edit')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-sm text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                            >
                              ✎
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(category)}
                              disabled={busy}
                              title={t('common.delete')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-sm text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                            >
                              {busy ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                              ) : (
                                '✕'
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-white px-3 py-3 sm:px-5">
          <div className="text-xs font-semibold text-gray-400">
            {t('businessValue.totalCategories')}: {categories.length}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || Boolean(actionId)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-5 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ active }) => {
  return (
    <span
      className={`
        inline-flex shrink-0 rounded-full border px-2 py-1
        text-[9px] font-black
        ${
          active
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-gray-200 bg-gray-100 text-gray-500'
        }
      `}
    >
      {active ? t('businessValue.categoryActive') : t('businessValue.categoryInactive')}
    </span>
  );
};

const CategoryLoading = () => {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {new Array(6).fill(null).map((_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
};

const inputClass = `
  h-10 w-full rounded-xl border border-gray-200 bg-white
  px-3 text-sm font-medium text-gray-800 outline-none transition
  placeholder:text-gray-400
  hover:border-indigo-300
  focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
  disabled:cursor-not-allowed disabled:opacity-60
`;

export default AssetCategoryManager;
