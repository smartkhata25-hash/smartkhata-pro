import React, { useMemo } from 'react';
import { t } from '../../i18n/i18n';

const TAB_CONFIG = Object.freeze([
  {
    value: 'all',
    labelKey: 'productPerformance.tabs.all',
    summaryKey: 'totalProducts',
  },
  {
    value: 'top-performing',
    labelKey: 'productPerformance.tabs.topPerforming',
    summaryKey: null,
  },
  {
    value: 'best-selling',
    labelKey: 'productPerformance.tabs.bestSelling',
    summaryKey: null,
  },
  {
    value: 'most-profitable',
    labelKey: 'productPerformance.tabs.mostProfitable',
    summaryKey: null,
  },
  {
    value: 'slow-moving',
    labelKey: 'productPerformance.tabs.slowMoving',
    summaryKey: 'slowMovingProducts',
    additionalSummaryKey: 'verySlowProducts',
  },
  {
    value: 'dead-stock',
    labelKey: 'productPerformance.tabs.deadStock',
    summaryKey: 'deadProducts',
  },
  {
    value: 'never-sold',
    labelKey: 'productPerformance.tabs.neverSold',
    summaryKey: 'neverSoldProducts',
  },
  {
    value: 'negative-stock',
    labelKey: 'productPerformance.tabs.negativeStock',
    summaryKey: 'negativeStockProducts',
  },
]);

const getSafeCount = (value) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue;
};

const getTabCount = (tab, summary) => {
  if (!tab.summaryKey || !summary) {
    return null;
  }

  const primaryCount = getSafeCount(summary[tab.summaryKey]);

  const additionalCount = tab.additionalSummaryKey
    ? getSafeCount(summary[tab.additionalSummaryKey])
    : 0;

  return primaryCount + additionalCount;
};

const ProductPerformanceTabs = ({
  value = 'all',
  summary = null,
  disabled = false,
  refreshing = false,
  onRefresh,
  onChange,
}) => {
  const tabs = useMemo(() => {
    return TAB_CONFIG.map((tab) => ({
      ...tab,
      count: getTabCount(tab, summary),
    }));
  }, [summary]);

  const handleTabChange = (tabValue) => {
    if (disabled || tabValue === value || typeof onChange !== 'function') {
      return;
    }

    onChange(tabValue);
  };

  const handleKeyDown = (event, currentIndex) => {
    if (disabled || typeof onChange !== 'function') {
      return;
    }

    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') {
      nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();

    const nextTab = tabs[nextIndex];

    if (!nextTab) {
      return;
    }

    onChange(nextTab.value);

    requestAnimationFrame(() => {
      const nextButton = document.querySelector(`[data-performance-tab="${nextTab.value}"]`);

      nextButton?.focus();
    });
  };

  return (
    <section
      aria-label={t('productPerformance.tabs.navigationLabel')}
      className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" className="flex flex-1 gap-2 overflow-x-auto pb-1">
          {tabs.map((tab, index) => {
            const isActive = value === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="product-performance-report-panel"
                tabIndex={isActive ? 0 : -1}
                data-performance-tab={tab.value}
                disabled={disabled}
                onClick={() => handleTabChange(tab.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`
                  inline-flex min-h-[40px] shrink-0 items-center gap-2
                  rounded-xl border px-4 py-2 text-sm font-medium
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-blue-200
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                  }
                `}
              >
                <span>{t(tab.labelKey)}</span>

                {tab.count !== null && (
                  <span
                    className={`
                      inline-flex min-w-[24px] items-center justify-center
                      rounded-full px-2 py-0.5 text-xs font-semibold
                      ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}
                    `}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || refreshing}
          title={t('common.refresh')}
          className="
            h-10 w-10 shrink-0
            rounded-xl
            border border-gray-200
            bg-white
            flex items-center justify-center
            hover:bg-blue-50
            hover:border-blue-400
            transition
            disabled:opacity-50
          "
        >
          <svg
            className={refreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 005.3 5.3M4 15a8 8 0 0014.7 3.7"
            />
          </svg>
        </button>
      </div>
    </section>
  );
};

export default ProductPerformanceTabs;
