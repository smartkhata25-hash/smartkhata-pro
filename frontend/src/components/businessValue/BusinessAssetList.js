import React, { useMemo, useState } from 'react';

import { t } from '../../i18n/i18n';

import { deleteBusinessAsset, formatAssetAmount } from '../../services/businessAssetService';

import { hasPermission } from '../../utils/permissionHelper';

const BusinessAssetList = ({
  assets = [],
  loading = false,
  onEdit,
  onDeleted,
  onAdd,
  moduleScope,
}) => {
  const [deletingId, setDeletingId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const canCreate = hasPermission('business_assets.create');
  const canEdit = hasPermission('business_assets.edit');
  const canDelete = hasPermission('business_assets.delete');

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const categoryName = typeof asset.categoryId === 'object' ? asset.categoryId?.name || '' : '';

      const matchesSearch =
        !query ||
        String(asset.name || '')
          .toLowerCase()
          .includes(query) ||
        String(categoryName).toLowerCase().includes(query) ||
        String(asset.notes || '')
          .toLowerCase()
          .includes(query);

      const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [assets, search, statusFilter]);

  const totals = useMemo(() => {
    return filteredAssets.reduce(
      (summary, asset) => {
        summary.items += 1;
        summary.quantity += Number(asset.quantity || 0);
        summary.purchaseValue += Number(
          asset.totalPurchaseValue ?? Number(asset.quantity || 0) * Number(asset.purchaseCost || 0)
        );
        summary.currentValue += Number(
          asset.totalCurrentValue ?? Number(asset.quantity || 0) * Number(asset.currentValue || 0)
        );

        return summary;
      },
      {
        items: 0,
        quantity: 0,
        purchaseValue: 0,
        currentValue: 0,
      }
    );
  }, [filteredAssets]);

  const handleDelete = async (asset) => {
    const confirmed = window.confirm(`${t('businessValue.deleteAssetConfirm')} "${asset.name}"?`);

    if (!confirmed) return;

    try {
      setDeletingId(asset._id);

      await deleteBusinessAsset(asset._id, { moduleScope });

      if (onDeleted) {
        onDeleted(asset._id);
      }
    } catch (error) {
      alert(error.message || t('businessValue.assetDeleteFailed'));
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
            placeholder={t('businessValue.searchAssets')}
            className="
              h-10 w-full rounded-xl border border-gray-200 bg-gray-50
              pl-9 pr-3 text-sm text-gray-800 outline-none transition
              placeholder:text-gray-400
              hover:border-indigo-300 hover:bg-white
              focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100
            "
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="
            h-10 rounded-xl border border-gray-200 bg-gray-50
            px-3 text-sm font-semibold text-gray-700 outline-none
            hover:border-indigo-300 hover:bg-white
            focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
            sm:w-[145px]
          "
        >
          <option value="all">{t('businessValue.allAssetStatus')}</option>

          <option value="active">{t('businessValue.assetStatusActive')}</option>

          <option value="sold">{t('businessValue.assetStatusSold')}</option>

          <option value="removed">{t('businessValue.assetStatusRemoved')}</option>
        </select>

        {canCreate && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="
              inline-flex h-10 items-center justify-center gap-2
              rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600
              px-4 text-sm font-black text-white shadow-sm transition
              hover:-translate-y-0.5 hover:shadow-md
            "
          >
            <span>＋</span>
            <span>{t('businessValue.addAsset')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/70 p-2.5 sm:grid-cols-4 sm:p-3">
        <CompactTotal label={t('businessValue.assetItems')} value={totals.items} icon="🏢" />

        <CompactTotal label={t('businessValue.totalQuantity')} value={totals.quantity} icon="📦" />

        <CompactTotal
          label={t('businessValue.totalPurchaseValue')}
          value={totals.purchaseValue}
          icon="🧾"
          currency
        />

        <CompactTotal
          label={t('businessValue.totalCurrentValue')}
          value={totals.currentValue}
          icon="💎"
          currency
        />
      </div>

      {loading ? (
        <AssetLoading />
      ) : filteredAssets.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="text-4xl">🏢</div>

          <h3 className="mt-3 text-base font-black text-gray-800">
            {search || statusFilter !== 'all'
              ? t('businessValue.noFilteredAssets')
              : t('businessValue.noAssets')}
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {search || statusFilter !== 'all'
              ? t('businessValue.changeAssetFilters')
              : t('businessValue.noAssetsDescription')}
          </p>

          {!search && statusFilter === 'all' && canCreate && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="
                  mt-4 inline-flex h-10 items-center gap-2 rounded-xl
                  bg-gradient-to-r from-indigo-600 to-blue-600
                  px-4 text-sm font-bold text-white shadow-sm
                "
            >
              ＋ {t('businessValue.addFirstAsset')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('businessValue.asset')}</th>

                  <th className="px-4 py-3 text-left">{t('businessValue.category')}</th>

                  <th className="px-4 py-3 text-center">{t('common.qty')}</th>

                  <th className="px-4 py-3 text-right">{t('businessValue.purchaseCost')}</th>

                  <th className="px-4 py-3 text-right">{t('businessValue.currentValue')}</th>

                  <th className="px-4 py-3 text-center">{t('businessValue.status')}</th>

                  <th className="px-4 py-3 text-center">{t('common.actions')}</th>
                </tr>
              </thead>

              <tbody>
                {filteredAssets.map((asset) => {
                  const busy = deletingId === asset._id;

                  const categoryName =
                    typeof asset.categoryId === 'object' ? asset.categoryId?.name || '-' : '-';

                  const totalPurchaseValue =
                    asset.totalPurchaseValue ??
                    Number(asset.quantity || 0) * Number(asset.purchaseCost || 0);

                  const totalCurrentValue =
                    asset.totalCurrentValue ??
                    Number(asset.quantity || 0) * Number(asset.currentValue || 0);

                  return (
                    <tr
                      key={asset._id}
                      className="border-t border-gray-100 transition hover:bg-indigo-50/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-800">{asset.name}</div>

                        <div className="mt-1 max-w-[260px] truncate text-xs text-gray-400">
                          {asset.notes || t('businessValue.noAssetNotes')}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-600">{categoryName}</td>

                      <td className="px-4 py-3 text-center font-bold text-gray-700">
                        {Number(asset.quantity || 0).toLocaleString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-gray-700">
                          {t('currency.rs')} {formatAssetAmount(totalPurchaseValue)}
                        </div>

                        <div className="text-xs text-gray-400">
                          {t('currency.rs')} {formatAssetAmount(asset.purchaseCost)}
                          {' / '}
                          {t('businessValue.unit')}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="font-black text-emerald-700">
                          {t('currency.rs')} {formatAssetAmount(totalCurrentValue)}
                        </div>

                        <div className="text-xs text-gray-400">
                          {t('currency.rs')} {formatAssetAmount(asset.currentValue)}
                          {' / '}
                          {t('businessValue.unit')}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={asset.status} />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          {canEdit && onEdit && (
                            <button
                              type="button"
                              onClick={() => onEdit(asset)}
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
                              onClick={() => handleDelete(asset)}
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
            {filteredAssets.map((asset) => (
              <MobileAssetCard
                key={asset._id}
                asset={asset}
                deleting={deletingId === asset._id}
                canEdit={canEdit}
                canDelete={canDelete}
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

const MobileAssetCard = ({ asset, deleting, canEdit, canDelete, onEdit, onDelete }) => {
  const categoryName = typeof asset.categoryId === 'object' ? asset.categoryId?.name || '-' : '-';

  const totalPurchaseValue =
    asset.totalPurchaseValue ?? Number(asset.quantity || 0) * Number(asset.purchaseCost || 0);

  const totalCurrentValue =
    asset.totalCurrentValue ?? Number(asset.quantity || 0) * Number(asset.currentValue || 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-black text-gray-800">{asset.name}</div>

          <div className="mt-1 truncate text-xs text-gray-500">
            {categoryName} • {Number(asset.quantity || 0).toLocaleString()}{' '}
            {t('businessValue.units')}
          </div>
        </div>

        <StatusBadge status={asset.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MobileValue
          label={t('businessValue.purchaseValue')}
          value={totalPurchaseValue}
          className="bg-slate-50 text-slate-700"
        />

        <MobileValue
          label={t('businessValue.currentValue')}
          value={totalCurrentValue}
          className="bg-emerald-50 text-emerald-700"
        />
      </div>

      {(canEdit || canDelete) && (
        <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-2">
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(asset)}
              disabled={deleting}
              className="h-8 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700"
            >
              ✎ {t('common.edit')}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(asset)}
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

const MobileValue = ({ label, value, className }) => {
  return (
    <div className={`rounded-xl p-2.5 ${className}`}>
      <div className="truncate text-[10px] font-semibold opacity-70">{label}</div>

      <div className="mt-1 truncate text-sm font-black">
        {t('currency.rs')} {formatAssetAmount(value)}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    sold: 'border-blue-200 bg-blue-50 text-blue-700',
    removed: 'border-gray-200 bg-gray-100 text-gray-600',
  };

  const labels = {
    active: t('businessValue.assetStatusActive'),
    sold: t('businessValue.assetStatusSold'),
    removed: t('businessValue.assetStatusRemoved'),
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-black ${
        styles[status] || styles.removed
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

const CompactTotal = ({ label, value, icon, currency = false }) => {
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500">
        <span>{icon}</span>
        <span className="truncate">{label}</span>
      </div>

      <div className="mt-1 truncate text-sm font-black text-gray-800">
        {currency && `${t('currency.rs')} `}
        {currency ? formatAssetAmount(value) : Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
};

const AssetLoading = () => {
  return (
    <div className="space-y-2 p-3">
      {new Array(5).fill(null).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  );
};

export default BusinessAssetList;
