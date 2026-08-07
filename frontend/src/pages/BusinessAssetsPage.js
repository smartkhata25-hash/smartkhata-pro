import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

import assetService, {
  getBusinessValueReport,
  getCategoryValueReport,
} from '../services/assetService';
import { getAccounts } from '../services/accountService';
import { fetchParties } from '../services/partyService';

import AssetOverview from '../components/assets/AssetOverview';
import AssetList from '../components/assets/AssetList';
import AssetDepreciationPanel from '../components/assets/AssetDepreciationPanel';
import AssetReportsPanel from '../components/assets/AssetReportsPanel';
import AssetSetupPanel from '../components/assets/AssetSetupPanel';
import AssetFormModal from '../components/assets/AssetFormModal';
import AssetDetailDrawer from '../components/assets/AssetDetailDrawer';
import AssetFilters from '../components/assets/AssetFilters';

import AssetValueModal from '../components/assets/AssetValueModal';
import AssetStatusModal from '../components/assets/AssetStatusModal';
import AssetSaleModal from '../components/assets/AssetSaleModal';
import AssetDisposalModal from '../components/assets/AssetDisposalModal';

const TAB_KEYS = Object.freeze({
  OVERVIEW: 'overview',
  ASSETS: 'assets',
  DEPRECIATION: 'depreciation',
  REPORTS: 'reports',
  SETUP: 'setup',
});

const EMPTY_SUMMARY = Object.freeze({
  totalAssets: 0,
  totalQuantity: 0,
  availableQuantity: 0,
  totalPurchaseValue: 0,
  totalCurrentValue: 0,
  totalAccumulatedDepreciation: 0,
  totalImpairmentLoss: 0,
  totalRevaluationAmount: 0,
  totalMaintenanceCost: 0,
  soldValue: 0,
  recoveryValue: 0,
  valueDifference: 0,
  valueRetainedPercent: 0,
});

const unwrapResponse = (response) => {
  if (!response) return {};

  return response.data || response;
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const normalizeSummary = (summary = {}) => ({
  totalAssets: toNumber(summary.totalAssets),
  totalQuantity: toNumber(summary.totalQuantity),
  availableQuantity: toNumber(summary.availableQuantity),
  totalPurchaseValue: toNumber(summary.totalPurchaseValue),
  totalCurrentValue: toNumber(summary.totalCurrentValue),
  totalAccumulatedDepreciation: toNumber(summary.totalAccumulatedDepreciation),
  totalImpairmentLoss: toNumber(summary.totalImpairmentLoss),
  totalRevaluationAmount: toNumber(summary.totalRevaluationAmount),
  totalMaintenanceCost: toNumber(summary.totalMaintenanceCost),
  soldValue: toNumber(summary.soldValue),
  recoveryValue: toNumber(summary.recoveryValue),
  valueDifference: toNumber(summary.valueDifference),
  valueRetainedPercent: toNumber(summary.valueRetainedPercent),
});

const extractRows = (response, possibleKeys = []) => {
  const data = unwrapResponse(response);

  if (Array.isArray(data)) {
    return data;
  }

  for (const key of possibleKeys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.rows)) {
    return data.rows;
  }

  return [];
};

const BusinessAssetsPage = () => {
  const canViewAssets = hasPermission('assets.view');

  const canCreateAsset = hasPermission('assets.create');

  const canViewDepreciation = hasPermission('assets.depreciation.view');

  const canViewReports = hasPermission('reports.asset_reports');

  const canManageCategories =
    hasPermission('assets.categories.view') || hasPermission('assets.titles.view');

  const availableTabs = useMemo(() => {
    const tabs = [
      {
        key: TAB_KEYS.OVERVIEW,
        label: t('assets.tabs.overview'),
        description: t('assets.tabs.overviewDescription'),
        icon: OverviewIcon,
        visible: canViewAssets,
      },
      {
        key: TAB_KEYS.ASSETS,
        label: t('assets.tabs.assets'),
        description: t('assets.tabs.assetsDescription'),
        icon: AssetsIcon,
        visible: canViewAssets,
      },
      {
        key: TAB_KEYS.DEPRECIATION,
        label: t('assets.tabs.depreciation'),
        description: t('assets.tabs.depreciationDescription'),
        icon: DepreciationIcon,
        visible: canViewDepreciation,
      },
      {
        key: TAB_KEYS.REPORTS,
        label: t('assets.tabs.reports'),
        description: t('assets.tabs.reportsDescription'),
        icon: ReportsIcon,
        visible: canViewReports,
      },
      {
        key: TAB_KEYS.SETUP,
        label: t('assets.tabs.setup'),
        description: t('assets.tabs.setupDescription'),
        icon: SetupIcon,
        visible: canManageCategories,
      },
    ];

    return tabs.filter((tab) => tab.visible);
  }, [canManageCategories, canViewAssets, canViewDepreciation, canViewReports]);

  const [activeTab, setActiveTab] = useState(TAB_KEYS.OVERVIEW);

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [categoryRows, setCategoryRows] = useState([]);

  const [isOverviewLoading, setIsOverviewLoading] = useState(true);

  const [overviewError, setOverviewError] = useState('');

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);

  const [editingAsset, setEditingAsset] = useState(null);

  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  const [assetFormMode, setAssetFormMode] = useState('create');

  const [filters, setFilters] = useState({});

  const [actionAsset, setActionAsset] = useState(null);

  const [isValueModalOpen, setIsValueModalOpen] = useState(false);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);

  const [accounts, setAccounts] = useState([]);

  const [parties, setParties] = useState([]);

  const [referenceDataError, setReferenceDataError] = useState('');
  useEffect(() => {
    const activeExists = availableTabs.some((tab) => tab.key === activeTab);

    if (!activeExists && availableTabs.length) {
      setActiveTab(availableTabs[0].key);
    }
  }, [activeTab, availableTabs]);

  const fetchOverview = useCallback(
    async ({ showFullLoader = false } = {}) => {
      if (!canViewAssets) {
        setIsOverviewLoading(false);
        return;
      }

      if (showFullLoader) {
        setIsOverviewLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setOverviewError('');

      try {
        const [businessValueResponse, categoryValueResponse] = await Promise.all([
          getBusinessValueReport({
            page: 1,
            limit: 5,
            sortBy: 'currentValue',
            sortOrder: 'desc',
          }),

          getCategoryValueReport(),
        ]);

        const businessValueData = unwrapResponse(businessValueResponse);

        const categoryValueData = unwrapResponse(categoryValueResponse);

        setSummary(normalizeSummary(businessValueData.summary || EMPTY_SUMMARY));

        setCategoryRows(Array.isArray(categoryValueData.rows) ? categoryValueData.rows : []);
      } catch (error) {
        console.error('Business assets overview error:', error);

        setOverviewError(error.message || t('assets.errors.overviewLoadFailed'));
      } finally {
        setIsOverviewLoading(false);
        setIsRefreshing(false);
      }
    },
    [canViewAssets]
  );

  const fetchReferenceData = useCallback(async () => {
    if (!canViewAssets) {
      return;
    }

    setReferenceDataError('');

    try {
      const [accountsResponse, partiesResponse] = await Promise.all([
        getAccounts(),

        fetchParties({
          status: 'active',
        }),
      ]);

      setAccounts(extractRows(accountsResponse, ['accounts', 'items', 'results']));

      setParties(extractRows(partiesResponse, ['parties', 'items', 'results']));
    } catch (error) {
      console.error('Asset reference data error:', error);

      setReferenceDataError(
        error?.response?.data?.message ||
          error?.message ||
          t('assets.errors.referenceDataLoadFailed')
      );
    }
  }, [canViewAssets]);

  useEffect(() => {
    fetchOverview({
      showFullLoader: true,
    });
  }, [fetchOverview, refreshKey]);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([
      fetchOverview({
        showFullLoader: false,
      }),

      fetchReferenceData(),
    ]);
  }, [fetchOverview, fetchReferenceData]);

  const openCreateAsset = useCallback(() => {
    setEditingAsset(null);
    setAssetFormMode('create');
    setIsAssetFormOpen(true);
  }, []);

  const openEditAsset = useCallback((asset) => {
    if (!asset) return;

    setEditingAsset(asset);
    setAssetFormMode('edit');
    setIsAssetFormOpen(true);
  }, []);

  const closeAssetForm = useCallback(() => {
    setIsAssetFormOpen(false);
    setEditingAsset(null);
    setAssetFormMode('create');
  }, []);

  const openAssetDetails = useCallback((assetOrId) => {
    const assetId =
      typeof assetOrId === 'object'
        ? assetOrId?._id || assetOrId?.productId || assetOrId?.assetId
        : assetOrId;

    if (!assetId) return;

    setSelectedAssetId(assetId);
    setIsDetailDrawerOpen(true);
  }, []);

  const closeAssetDetails = useCallback(() => {
    setIsDetailDrawerOpen(false);
    setSelectedAssetId(null);
  }, []);
  const openValueModal = useCallback((asset) => {
    if (!asset) return;

    setActionAsset(asset);
    setIsValueModalOpen(true);
  }, []);

  const closeValueModal = useCallback(() => {
    setIsValueModalOpen(false);
    setActionAsset(null);
  }, []);

  const openStatusModal = useCallback((asset) => {
    if (!asset) return;

    setActionAsset(asset);
    setIsStatusModalOpen(true);
  }, []);

  const closeStatusModal = useCallback(() => {
    setIsStatusModalOpen(false);
    setActionAsset(null);
  }, []);

  const openSaleModal = useCallback((asset) => {
    if (!asset) return;

    setActionAsset(asset);
    setIsSaleModalOpen(true);
  }, []);

  const closeSaleModal = useCallback(() => {
    setIsSaleModalOpen(false);
    setActionAsset(null);
  }, []);

  const openDisposalModal = useCallback((asset) => {
    if (!asset) return;

    setActionAsset(asset);
    setIsDisposalModalOpen(true);
  }, []);

  const closeDisposalModal = useCallback(() => {
    setIsDisposalModalOpen(false);
    setActionAsset(null);
  }, []);

  const handleModalSaved = useCallback(() => {
    setIsValueModalOpen(false);
    setIsStatusModalOpen(false);
    setIsSaleModalOpen(false);
    setIsDisposalModalOpen(false);
    setActionAsset(null);

    triggerRefresh();
  }, [triggerRefresh]);

  const handleLifecycleSaved = useCallback(() => {
    setIsSaleModalOpen(false);
    setIsDisposalModalOpen(false);
    setActionAsset(null);

    closeAssetDetails();
    triggerRefresh();
  }, [closeAssetDetails, triggerRefresh]);

  const handleAssetSaved = useCallback(
    (savedAsset) => {
      closeAssetForm();
      triggerRefresh();

      if (savedAsset?._id) {
        setSelectedAssetId(savedAsset._id);
      }
    },
    [closeAssetForm, triggerRefresh]
  );

  const handleAssetChanged = useCallback(() => {
    triggerRefresh();
  }, [triggerRefresh]);

  const activeTabConfig = availableTabs.find((tab) => tab.key === activeTab) || availableTabs[0];

  if (!canViewAssets && !availableTabs.length) {
    return <AccessDeniedState />;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-28 -right-20 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />

          <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />

          <div className="absolute top-10 left-10 h-32 w-32 rounded-full bg-violet-100/70 blur-2xl" />
        </div>

        <div className="relative px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1600px]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white shadow-lg shadow-indigo-200">
                  <BusinessAssetIcon />
                </div>

                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      {t('assets.title')}
                    </h1>

                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      {t('assets.professionalModule')}
                    </span>
                  </div>

                  <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                    {t('assets.description')}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
                    <HeaderMetric
                      icon={<ValueIcon />}
                      label={t('assets.header.currentValue')}
                      value={formatCurrency(summary.totalCurrentValue)}
                    />

                    <HeaderMetric
                      icon={<CountIcon />}
                      label={t('assets.header.totalAssets')}
                      value={formatNumber(summary.totalAssets)}
                    />

                    <HeaderMetric
                      icon={<HealthIcon />}
                      label={t('assets.header.valueRetained')}
                      value={`${formatNumber(summary.valueRetainedPercent, 1)}%`}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshIcon spinning={isRefreshing} />

                  {isRefreshing ? t('assets.refreshing') : t('common.refresh')}
                </button>

                {canCreateAsset && (
                  <button
                    type="button"
                    onClick={openCreateAsset}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-200 active:translate-y-0"
                  >
                    <PlusIcon />

                    {t('assets.addAsset')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div
            className="flex gap-2 overflow-x-auto py-3"
            role="tablist"
            aria-label={t('assets.tabs.navigationLabel')}
          >
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    'group relative flex min-w-max items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition',
                    isActive
                      ? 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-800 shadow-sm'
                      : 'border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-lg transition',
                      isActive
                        ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-100'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200',
                    ].join(' ')}
                  >
                    <Icon />
                  </span>

                  <span>
                    <span className="block text-sm font-semibold">{tab.label}</span>

                    <span className="hidden max-w-[190px] truncate text-[11px] font-normal text-slate-500 xl:block">
                      {tab.description}
                    </span>
                  </span>

                  {isActive && (
                    <span className="absolute inset-x-4 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          {overviewError && (
            <ErrorBanner
              message={overviewError}
              onRetry={() =>
                fetchOverview({
                  showFullLoader: true,
                })
              }
            />
          )}
          {referenceDataError && (
            <ErrorBanner message={referenceDataError} onRetry={fetchReferenceData} />
          )}

          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{activeTabConfig?.label}</h2>

              <p className="mt-1 text-sm text-slate-500">{activeTabConfig?.description}</p>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500 sm:mt-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-300" />

              {t('assets.liveData')}
            </div>
          </div>

          {activeTab === TAB_KEYS.OVERVIEW && (
            <AssetOverview
              summary={summary}
              categoryRows={categoryRows}
              loading={isOverviewLoading}
              onViewAssets={() => setActiveTab(TAB_KEYS.ASSETS)}
              onViewReports={() => setActiveTab(TAB_KEYS.REPORTS)}
              onAddAsset={openCreateAsset}
              canCreateAsset={canCreateAsset}
              refreshKey={refreshKey}
            />
          )}

          {activeTab === TAB_KEYS.ASSETS && (
            <div className="space-y-5">
              <AssetFilters
                filters={filters}
                onChange={setFilters}
                onApply={setFilters}
                onReset={setFilters}
                loading={isRefreshing}
              />

              <AssetList
                service={assetService}
                refreshKey={refreshKey}
                filters={filters}
                onAddAsset={openCreateAsset}
                onEditAsset={openEditAsset}
                onViewAsset={openAssetDetails}
                onAdjustValue={openValueModal}
                onChangeStatus={openStatusModal}
                onSellAsset={openSaleModal}
                onDisposeAsset={openDisposalModal}
                onAssetChanged={handleAssetChanged}
                canCreateAsset={canCreateAsset}
                canEditAsset={hasPermission('assets.edit')}
                canDeleteAsset={hasPermission('assets.delete')}
                canSellAsset={hasPermission('assets.sell')}
                canDisposeAsset={hasPermission('assets.dispose')}
              />
            </div>
          )}

          {activeTab === TAB_KEYS.DEPRECIATION && (
            <AssetDepreciationPanel
              service={assetService}
              refreshKey={refreshKey}
              onAssetChanged={handleAssetChanged}
              canPostDepreciation={hasPermission('assets.depreciation.post')}
              canReverseDepreciation={hasPermission('assets.depreciation.reverse')}
              onViewAsset={openAssetDetails}
            />
          )}

          {activeTab === TAB_KEYS.REPORTS && (
            <AssetReportsPanel
              service={assetService}
              summary={summary}
              categoryRows={categoryRows}
              refreshKey={refreshKey}
              onViewAsset={openAssetDetails}
            />
          )}

          {activeTab === TAB_KEYS.SETUP && (
            <AssetSetupPanel
              service={assetService}
              refreshKey={refreshKey}
              onSetupChanged={handleAssetChanged}
              canCreateCategory={hasPermission('assets.categories.create')}
              canEditCategory={hasPermission('assets.categories.edit')}
              canDeleteCategory={hasPermission('assets.categories.delete')}
              canCreateTitle={hasPermission('assets.titles.create')}
              canEditTitle={hasPermission('assets.titles.edit')}
              canDeleteTitle={hasPermission('assets.titles.delete')}
            />
          )}
        </div>
      </main>

      <AssetFormModal
        isOpen={isAssetFormOpen}
        mode={assetFormMode}
        asset={editingAsset}
        service={assetService}
        onClose={closeAssetForm}
        onSaved={handleAssetSaved}
      />

      <AssetDetailDrawer
        isOpen={isDetailDrawerOpen}
        assetId={selectedAssetId}
        service={assetService}
        onClose={closeAssetDetails}
        onEdit={openEditAsset}
        onAdjustValue={openValueModal}
        onChangeStatus={openStatusModal}
        onSell={openSaleModal}
        onDispose={openDisposalModal}
        onChanged={handleAssetChanged}
        canEdit={hasPermission('assets.edit')}
        canSell={hasPermission('assets.sell')}
        canDispose={hasPermission('assets.dispose')}
        canPostDepreciation={hasPermission('assets.depreciation.post')}
      />
      <AssetValueModal
        isOpen={isValueModalOpen}
        asset={actionAsset}
        service={assetService}
        accounts={accounts}
        onClose={closeValueModal}
        onSaved={handleModalSaved}
        canPostJournal={hasPermission('journal.create')}
      />

      <AssetStatusModal
        isOpen={isStatusModalOpen}
        asset={actionAsset}
        service={assetService}
        onClose={closeStatusModal}
        onSaved={handleModalSaved}
        onOpenSale={openSaleModal}
        onOpenDisposal={openDisposalModal}
        canSell={hasPermission('assets.sell')}
        canDispose={hasPermission('assets.dispose')}
      />

      <AssetSaleModal
        isOpen={isSaleModalOpen}
        asset={actionAsset}
        service={assetService}
        accounts={accounts}
        customers={[]}
        parties={parties}
        onClose={closeSaleModal}
        onSaved={handleLifecycleSaved}
        canPostJournal={hasPermission('journal.create')}
      />

      <AssetDisposalModal
        isOpen={isDisposalModalOpen}
        asset={actionAsset}
        service={assetService}
        accounts={accounts}
        onClose={closeDisposalModal}
        onSaved={handleLifecycleSaved}
        canPostJournal={hasPermission('journal.create')}
      />
    </div>
  );
};

const HeaderMetric = ({ icon, label, value }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="text-indigo-600">{icon}</span>

    <span>{label}:</span>

    <span className="font-bold text-slate-700">{value}</span>
  </span>
);

const ErrorBanner = ({ message, onRetry }) => (
  <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
        <ErrorIcon />
      </span>

      <div>
        <h3 className="text-sm font-bold text-red-800">{t('assets.errors.unableToLoad')}</h3>

        <p className="mt-0.5 text-sm text-red-700">{message}</p>
      </div>
    </div>

    <button
      type="button"
      onClick={onRetry}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
    >
      <RefreshIcon />

      {t('assets.tryAgain')}
    </button>
  </div>
);

const AccessDeniedState = () => (
  <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
        <LockIcon />
      </div>

      <h1 className="mt-5 text-xl font-bold text-slate-900">{t('assets.accessDenied.title')}</h1>

      <p className="mt-2 text-sm leading-6 text-slate-500">
        {t('assets.accessDenied.description')}
      </p>
    </div>
  </div>
);

const formatCurrency = (value) => {
  const amount = toNumber(value);

  return `${t('currency.rs')} ${amount.toLocaleString('en-PK', {
    maximumFractionDigits: 0,
  })}`;
};

const formatNumber = (value, fractionDigits = 0) => {
  return toNumber(value).toLocaleString('en-PK', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const BusinessAssetIcon = () => (
  <svg
    className="h-7 w-7"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 21V8.5a1.5 1.5 0 0 1 .75-1.3l6.5-3.75a1.5 1.5 0 0 1 1.5 0l6.5 3.75A1.5 1.5 0 0 1 20 8.5V21"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.5 21h19M8 21v-6h8v6M8 10h.01M12 10h.01M16 10h.01"
    />
  </svg>
);

const OverviewIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
);

const AssetsIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
  </svg>
);

const DepreciationIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M7 9h10M9 13h6M11 17h2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m18 15 2 2 2-2M20 17v4" />
  </svg>
);

const ReportsIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

const SetupIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.35.7.64.96.3.26.68.4 1.08.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.64Z"
    />
  </svg>
);

const PlusIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
  </svg>
);

const RefreshIcon = ({ spinning = false }) => (
  <svg
    className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
  </svg>
);

const ValueIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path
      strokeLinecap="round"
      d="M8.5 9.5c0-1.1 1.2-2 3-2s3 .9 3 2-1.2 2-3 2-3 .9-3 2 1.2 2 3 2 3-.9 3-2M12 5.5v13"
    />
  </svg>
);

const CountIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);

const HealthIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);

const ErrorIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" d="M12 7v6M12 17h.01" />
  </svg>
);

const LockIcon = () => (
  <svg
    className="h-7 w-7"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path strokeLinecap="round" d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export default BusinessAssetsPage;
