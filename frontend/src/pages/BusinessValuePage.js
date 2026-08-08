import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { t } from '../i18n/i18n';

import BusinessValueSummary from '../components/businessValue/BusinessValueSummary';
import BusinessValueTopBar from '../components/businessValue/BusinessValueTopBar';
import BusinessAssetForm from '../components/businessValue/BusinessAssetForm';
import BusinessAssetList from '../components/businessValue/BusinessAssetList';
import BusinessLiabilityForm from '../components/businessValue/BusinessLiabilityForm';
import BusinessLiabilityPaymentForm from '../components/businessValue/BusinessLiabilityPaymentForm';
import BusinessLiabilityPaymentHistory from '../components/businessValue/BusinessLiabilityPaymentHistory';
import BusinessLiabilityList from '../components/businessValue/BusinessLiabilityList';
import AssetCategoryManager from '../components/businessValue/AssetCategoryManager';
import BusinessReceivableLoanForm from '../components/businessValue/BusinessReceivableLoanForm';
import BusinessReceivableLoanList from '../components/businessValue/BusinessReceivableLoanList';
import BusinessReceivableLoanPaymentForm from '../components/businessValue/BusinessReceivableLoanPaymentForm';
import BusinessReceivableLoanPaymentHistory from '../components/businessValue/BusinessReceivableLoanPaymentHistory';

import {
  BUSINESS_VALUE_PRESETS,
  DEFAULT_COMPLETE_COMPONENTS,
  fetchBusinessValue,
  getPresetComponents,
} from '../services/businessValueService';

import { fetchAssetTitles, fetchBusinessAssets } from '../services/businessAssetService';

import {
  fetchBusinessAssetCategories,
  getActiveBusinessAssetCategories,
  sortBusinessAssetCategories,
} from '../services/businessAssetCategoryService';

import {
  fetchBusinessLiabilities,
  fetchLiabilityTitles,
} from '../services/businessLiabilityService';

import { fetchBusinessReceivableLoans } from '../services/businessReceivableLoanService';

import { hasPermission } from '../utils/permissionHelper';

const TABS = {
  OVERVIEW: 'overview',
  ASSETS: 'assets',
  RECEIVABLE_LOANS: 'receivable-loans',
  LIABILITIES: 'liabilities',
};

const BusinessValuePage = () => {
  const canViewBusinessValue = hasPermission('business_value.view');
  const canViewAssets = hasPermission('business_assets.view');
  const canViewLiabilities = hasPermission('business_liabilities.view');

  const canViewReceivableLoans = hasPermission('business_receivable_loans.view');

  const [activeTab, setActiveTab] = useState(TABS.OVERVIEW);

  const [preset, setPreset] = useState(BUSINESS_VALUE_PRESETS.COMPLETE);

  const [selectedComponents, setSelectedComponents] = useState(DEFAULT_COMPLETE_COMPONENTS);

  const [appliedPreset, setAppliedPreset] = useState(BUSINESS_VALUE_PRESETS.COMPLETE);

  const [appliedComponents, setAppliedComponents] = useState(DEFAULT_COMPLETE_COMPONENTS);

  const [businessValueData, setBusinessValueData] = useState(null);

  const [assets, setAssets] = useState([]);
  const [assetTitles, setAssetTitles] = useState([]);
  const [categories, setCategories] = useState([]);

  const [liabilities, setLiabilities] = useState([]);
  const [liabilityTitles, setLiabilityTitles] = useState([]);
  const [receivableLoans, setReceivableLoans] = useState([]);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [liabilitiesLoading, setLiabilitiesLoading] = useState(false);
  const [receivableLoansLoading, setReceivableLoansLoading] = useState(false);

  const [pageError, setPageError] = useState('');

  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);

  const [liabilityFormOpen, setLiabilityFormOpen] = useState(false);

  const [selectedLiability, setSelectedLiability] = useState(null);

  const [paymentFormOpen, setPaymentFormOpen] = useState(false);

  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);

  const [receivableLoanFormOpen, setReceivableLoanFormOpen] = useState(false);

  const [selectedReceivableLoan, setSelectedReceivableLoan] = useState(null);

  const [receivableLoanPaymentOpen, setReceivableLoanPaymentOpen] = useState(false);

  const [receivableLoanPaymentHistoryOpen, setReceivableLoanPaymentHistoryOpen] = useState(false);

  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  const visibleTabs = useMemo(() => {
    const tabs = [
      {
        key: TABS.OVERVIEW,
        label: t('businessValue.overview'),
        icon: '◈',
      },
    ];

    if (canViewAssets) {
      tabs.push({
        key: TABS.ASSETS,
        label: t('businessValue.assets'),
        icon: '🏢',
      });
    }

    if (canViewReceivableLoans) {
      tabs.push({
        key: TABS.RECEIVABLE_LOANS,
        label: t('businessValue.receivableLoans'),
        icon: '🤝',
      });
    }

    if (canViewLiabilities) {
      tabs.push({
        key: TABS.LIABILITIES,
        label: t('businessValue.liabilities'),
        icon: '💳',
      });
    }

    return tabs;
  }, [canViewAssets, canViewLiabilities, canViewReceivableLoans]);

  const loadBusinessValue = useCallback(
    async ({
      nextPreset = appliedPreset,
      nextComponents = appliedComponents,
      showLoader = true,
    } = {}) => {
      if (!canViewBusinessValue) return;

      try {
        if (showLoader) {
          setSummaryLoading(true);
        }

        setPageError('');

        const result = await fetchBusinessValue({
          preset: nextPreset,
          components: nextComponents,
        });

        setBusinessValueData(result);
      } catch (error) {
        setPageError(error.message || t('businessValue.businessValueLoadFailed'));
      } finally {
        if (showLoader) {
          setSummaryLoading(false);
        }
      }
    },
    [appliedComponents, appliedPreset, canViewBusinessValue]
  );

  const loadAssets = useCallback(
    async ({ showLoader = true } = {}) => {
      if (!canViewAssets) return;

      try {
        if (showLoader) {
          setAssetsLoading(true);
        }

        const result = await fetchBusinessAssets({
          includeInactive: true,
          page: 1,
          limit: 500,
        });

        setAssets(result.assets || []);
      } catch (error) {
        setPageError(error.message || t('businessValue.assetsLoadFailed'));
      } finally {
        if (showLoader) {
          setAssetsLoading(false);
        }
      }
    },
    [canViewAssets]
  );

  const loadCategories = useCallback(async () => {
    if (!canViewAssets) return;

    try {
      const result = await fetchBusinessAssetCategories({
        includeInactive: true,
      });

      setCategories(sortBusinessAssetCategories(result.categories || []));
    } catch (error) {
      setPageError(error.message || t('businessValue.assetCategoriesLoadFailed'));
    }
  }, [canViewAssets]);

  const loadAssetTitles = useCallback(async () => {
    if (!canViewAssets) return;

    try {
      const result = await fetchAssetTitles();

      setAssetTitles(result.titles || []);
    } catch (error) {
      setPageError(error.message || t('businessValue.assetTitlesLoadFailed'));
    }
  }, [canViewAssets]);

  const loadReceivableLoans = useCallback(
    async ({ showLoader = true } = {}) => {
      if (!canViewReceivableLoans) return;

      try {
        if (showLoader) {
          setReceivableLoansLoading(true);
        }

        const result = await fetchBusinessReceivableLoans({
          includeClosed: true,
          page: 1,
          limit: 500,
        });

        setReceivableLoans(result.loans || []);
      } catch (error) {
        setPageError(error.message || t('businessValue.receivableLoansLoadFailed'));
      } finally {
        if (showLoader) {
          setReceivableLoansLoading(false);
        }
      }
    },
    [canViewReceivableLoans]
  );

  const loadLiabilities = useCallback(
    async ({ showLoader = true } = {}) => {
      if (!canViewLiabilities) return;

      try {
        if (showLoader) {
          setLiabilitiesLoading(true);
        }

        const result = await fetchBusinessLiabilities({
          includeClosed: true,
          page: 1,
          limit: 500,
        });

        setLiabilities(result.liabilities || []);
      } catch (error) {
        setPageError(error.message || t('businessValue.liabilitiesLoadFailed'));
      } finally {
        if (showLoader) {
          setLiabilitiesLoading(false);
        }
      }
    },
    [canViewLiabilities]
  );

  const loadLiabilityTitles = useCallback(async () => {
    if (!canViewLiabilities) return;

    try {
      const result = await fetchLiabilityTitles();

      setLiabilityTitles(result.titles || []);
    } catch (error) {
      setPageError(error.message || t('businessValue.liabilityTitlesLoadFailed'));
    }
  }, [canViewLiabilities]);

  const loadInitialData = useCallback(async () => {
    setPageError('');

    const tasks = [];

    if (canViewBusinessValue) {
      tasks.push(
        loadBusinessValue({
          nextPreset: BUSINESS_VALUE_PRESETS.COMPLETE,
          nextComponents: DEFAULT_COMPLETE_COMPONENTS,
        })
      );
    }

    if (canViewAssets) {
      tasks.push(loadAssets());
      tasks.push(loadCategories());
      tasks.push(loadAssetTitles());
    }

    if (canViewReceivableLoans) {
      tasks.push(loadReceivableLoans());
    }

    if (canViewLiabilities) {
      tasks.push(loadLiabilities());
      tasks.push(loadLiabilityTitles());
    }

    await Promise.all(tasks);
  }, [
    canViewAssets,
    canViewBusinessValue,
    canViewLiabilities,
    canViewReceivableLoans,
    loadReceivableLoans,
    loadAssetTitles,
    loadAssets,
    loadBusinessValue,
    loadCategories,
    loadLiabilities,
    loadLiabilityTitles,
  ]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handlePresetChange = (nextPreset) => {
    setPreset(nextPreset);

    if (nextPreset === BUSINESS_VALUE_PRESETS.CUSTOM) {
      return;
    }

    setSelectedComponents(getPresetComponents(nextPreset));
  };

  const handleComponentsChange = (nextComponents) => {
    setSelectedComponents(nextComponents);
    setPreset(BUSINESS_VALUE_PRESETS.CUSTOM);
  };

  const handleApplyFilters = async () => {
    if (!selectedComponents.length) {
      setPageError(t('businessValue.selectAtLeastOne'));
      return;
    }

    setAppliedPreset(preset);
    setAppliedComponents(selectedComponents);

    await loadBusinessValue({
      nextPreset: preset,
      nextComponents: selectedComponents,
    });
  };

  const openNewAssetForm = () => {
    setSelectedAsset(null);
    setAssetFormOpen(true);
  };

  const openEditAssetForm = (asset) => {
    setSelectedAsset(asset);
    setAssetFormOpen(true);
  };

  const handleAssetSaved = async () => {
    await Promise.all([
      loadAssets({
        showLoader: false,
      }),
      loadBusinessValue({
        showLoader: false,
      }),
    ]);
  };

  const handleAssetDeleted = async (assetId) => {
    setAssets((current) => current.filter((asset) => asset._id !== assetId));

    await loadBusinessValue({
      showLoader: false,
    });
  };

  const openNewLiabilityForm = () => {
    setSelectedLiability(null);
    setLiabilityFormOpen(true);
  };

  const openEditLiabilityForm = (liability) => {
    setSelectedLiability(liability);
    setLiabilityFormOpen(true);
  };

  const handleLiabilitySaved = async () => {
    await Promise.all([
      loadLiabilities({
        showLoader: false,
      }),
      loadBusinessValue({
        showLoader: false,
      }),
    ]);

    setPaymentFormOpen(false);
    setPaymentHistoryOpen(false);

    setSelectedLiability(null);
  };

  const handleLiabilityDeleted = async (liabilityId) => {
    setLiabilities((current) => current.filter((liability) => liability._id !== liabilityId));

    await loadBusinessValue({
      showLoader: false,
    });
  };

  const openNewReceivableLoanForm = () => {
    setSelectedReceivableLoan(null);
    setReceivableLoanFormOpen(true);
  };

  const openEditReceivableLoanForm = (loan) => {
    setSelectedReceivableLoan(loan);
    setReceivableLoanFormOpen(true);
  };

  const openReceivableLoanPayment = (loan) => {
    setSelectedReceivableLoan(loan);
    setReceivableLoanPaymentOpen(true);
  };

  const openReceivableLoanPaymentHistory = (loan) => {
    setSelectedReceivableLoan(loan);
    setReceivableLoanPaymentHistoryOpen(true);
  };

  const handleReceivableLoanChanged = async () => {
    await Promise.all([
      loadReceivableLoans({
        showLoader: false,
      }),
      loadBusinessValue({
        showLoader: false,
      }),
    ]);

    setReceivableLoanFormOpen(false);
    setReceivableLoanPaymentOpen(false);
    setReceivableLoanPaymentHistoryOpen(false);
    setSelectedReceivableLoan(null);
  };

  const handleReceivableLoanDeleted = async (loanId) => {
    setReceivableLoans((current) => current.filter((loan) => loan._id !== loanId));

    await loadBusinessValue({
      showLoader: false,
    });
  };

  const openPaymentForm = (liability) => {
    setSelectedLiability(liability);
    setPaymentFormOpen(true);
  };

  const openPaymentHistory = (liability) => {
    setSelectedLiability(liability);
    setPaymentHistoryOpen(true);
  };

  const handleCategoriesChanged = async () => {
    await loadCategories();
  };

  const activeCategories = useMemo(
    () => getActiveBusinessAssetCategories(categories),
    [categories]
  );

  if (!canViewBusinessValue && !canViewAssets && !canViewLiabilities && !canViewReceivableLoans) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1500px] space-y-3 px-2.5 pb-2.5 pt-0 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
        {pageError && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            <span>{pageError}</span>

            <button
              type="button"
              onClick={() => setPageError('')}
              className="shrink-0 text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        <div className="sticky top-0 z-20 rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-sm backdrop-blur-md">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex h-10 min-w-0 items-center justify-center gap-2
                  rounded-xl px-2 text-xs font-black transition
                  sm:text-sm
                  ${
                    activeTab === tab.key
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                  }
                `}
              >
                <span>{tab.icon}</span>

                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === TABS.OVERVIEW && (
          <div className="space-y-3">
            {canViewBusinessValue && (
              <>
                <BusinessValueTopBar
                  data={businessValueData}
                  preset={preset}
                  selectedComponents={selectedComponents}
                  loading={summaryLoading}
                  onPresetChange={handlePresetChange}
                  onComponentsChange={handleComponentsChange}
                  onApply={handleApplyFilters}
                  onRefresh={() =>
                    loadBusinessValue({
                      showLoader: true,
                    })
                  }
                />

                <BusinessValueSummary
                  data={businessValueData}
                  loading={summaryLoading}
                  selectedComponents={appliedComponents}
                />
              </>
            )}

            <QuickManagement
              canViewAssets={canViewAssets}
              canViewLiabilities={canViewLiabilities}
              canViewReceivableLoans={canViewReceivableLoans}
              assetsCount={assets.length}
              liabilitiesCount={liabilities.length}
              receivableLoansCount={receivableLoans.length}
              categoriesCount={categories.length}
              onAssets={() => setActiveTab(TABS.ASSETS)}
              onLiabilities={() => setActiveTab(TABS.LIABILITIES)}
              onReceivableLoans={() => setActiveTab(TABS.RECEIVABLE_LOANS)}
              onCategories={() => setCategoryManagerOpen(true)}
            />
          </div>
        )}

        {activeTab === TABS.ASSETS && canViewAssets && (
          <BusinessAssetList
            assets={assets}
            loading={assetsLoading}
            onAdd={openNewAssetForm}
            onEdit={openEditAssetForm}
            onDeleted={handleAssetDeleted}
          />
        )}

        {activeTab === TABS.RECEIVABLE_LOANS && canViewReceivableLoans && (
          <BusinessReceivableLoanList
            loans={receivableLoans}
            loading={receivableLoansLoading}
            onAdd={openNewReceivableLoanForm}
            onEdit={openEditReceivableLoanForm}
            onReceive={openReceivableLoanPayment}
            onHistory={openReceivableLoanPaymentHistory}
            onDeleted={handleReceivableLoanDeleted}
          />
        )}

        {activeTab === TABS.LIABILITIES && canViewLiabilities && (
          <BusinessLiabilityList
            liabilities={liabilities}
            loading={liabilitiesLoading}
            onAdd={openNewLiabilityForm}
            onEdit={openEditLiabilityForm}
            onDeleted={handleLiabilityDeleted}
            onPay={openPaymentForm}
            onHistory={openPaymentHistory}
          />
        )}
      </div>

      <BusinessAssetForm
        isOpen={assetFormOpen}
        asset={selectedAsset}
        categories={activeCategories}
        titles={assetTitles}
        onClose={() => {
          setAssetFormOpen(false);
          setSelectedAsset(null);
        }}
        onSaved={handleAssetSaved}
        onManageCategories={() => {
          setAssetFormOpen(false);
          setCategoryManagerOpen(true);
        }}
      />

      <BusinessLiabilityForm
        isOpen={liabilityFormOpen}
        liability={selectedLiability}
        titles={liabilityTitles}
        onClose={() => {
          setLiabilityFormOpen(false);
          setSelectedLiability(null);
        }}
        onSaved={handleLiabilitySaved}
      />

      <BusinessLiabilityPaymentForm
        isOpen={paymentFormOpen}
        liability={selectedLiability}
        onClose={() => {
          setPaymentFormOpen(false);
          setSelectedLiability(null);
        }}
        onSaved={handleLiabilitySaved}
      />

      <BusinessLiabilityPaymentHistory
        isOpen={paymentHistoryOpen}
        liability={selectedLiability}
        onClose={() => {
          setPaymentHistoryOpen(false);
          setSelectedLiability(null);
        }}
        onChanged={handleLiabilitySaved}
      />

      <BusinessReceivableLoanForm
        isOpen={receivableLoanFormOpen}
        loan={selectedReceivableLoan}
        onClose={() => {
          setReceivableLoanFormOpen(false);
          setSelectedReceivableLoan(null);
        }}
        onSaved={handleReceivableLoanChanged}
      />

      <BusinessReceivableLoanPaymentForm
        isOpen={receivableLoanPaymentOpen}
        loan={selectedReceivableLoan}
        onClose={() => {
          setReceivableLoanPaymentOpen(false);
          setSelectedReceivableLoan(null);
        }}
        onReceived={handleReceivableLoanChanged}
      />

      <BusinessReceivableLoanPaymentHistory
        isOpen={receivableLoanPaymentHistoryOpen}
        loan={selectedReceivableLoan}
        onClose={() => {
          setReceivableLoanPaymentHistoryOpen(false);
          setSelectedReceivableLoan(null);
        }}
        onChanged={handleReceivableLoanChanged}
      />

      <AssetCategoryManager
        isOpen={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        onChanged={handleCategoriesChanged}
      />
    </div>
  );
};

const QuickManagement = ({
  canViewAssets,
  canViewLiabilities,
  canViewReceivableLoans,
  assetsCount,
  liabilitiesCount,
  receivableLoansCount,
  categoriesCount,
  onAssets,
  onLiabilities,
  onReceivableLoans,
  onCategories,
}) => {
  if (!canViewAssets && !canViewLiabilities && !canViewReceivableLoans) {
    return null;
  }

  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {canViewAssets && (
        <ManagementCard
          title={t('businessValue.manageAssets')}
          description={t('businessValue.manageAssetsDescription')}
          value={assetsCount}
          icon="🏢"
          gradient="from-indigo-600 to-blue-600"
          onClick={onAssets}
        />
      )}

      {canViewReceivableLoans && (
        <ManagementCard
          title={t('businessValue.manageReceivableLoans')}
          description={t('businessValue.manageReceivableLoansDescription')}
          value={receivableLoansCount}
          icon="🤝"
          gradient="from-emerald-600 to-cyan-600"
          onClick={onReceivableLoans}
        />
      )}

      {canViewLiabilities && (
        <ManagementCard
          title={t('businessValue.manageLiabilities')}
          description={t('businessValue.manageLiabilitiesDescription')}
          value={liabilitiesCount}
          icon="💳"
          gradient="from-rose-600 to-orange-500"
          onClick={onLiabilities}
        />
      )}

      {canViewAssets && (
        <ManagementCard
          title={t('businessValue.manageAssetCategories')}
          description={t('businessValue.manageCategoriesDescription')}
          value={categoriesCount}
          icon="🗂️"
          gradient="from-violet-600 to-fuchsia-600"
          onClick={onCategories}
        />
      )}
    </section>
  );
};

const ManagementCard = ({ title, description, value, icon, gradient, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative min-h-[105px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b ${gradient}`} />

      <div className="flex items-start gap-3 pl-1">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-lg text-white shadow-sm`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-black text-gray-800">{title}</h3>

            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-black text-gray-600">
              {Number(value || 0).toLocaleString()}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{description}</p>
        </div>

        <span className="self-center text-gray-300 transition group-hover:translate-x-1 group-hover:text-indigo-500">
          →
        </span>
      </div>
    </button>
  );
};

const AccessDenied = () => {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="text-5xl">🔐</div>

        <h1 className="mt-4 text-xl font-black text-gray-800">{t('businessValue.accessDenied')}</h1>

        <p className="mt-2 text-sm text-gray-500">{t('businessValue.accessDeniedDescription')}</p>
      </div>
    </div>
  );
};

export default BusinessValuePage;
