import React from 'react';

import { t } from '../../i18n/i18n';

const SUMMARY_CARD_CONFIG = Object.freeze([
  {
    key: 'totalProducts',
    labelKey: 'productPerformance.summary.totalProducts',
    type: 'number',
    view: 'all',
  },
  {
    key: 'totalNetSales',
    labelKey: 'productPerformance.summary.totalNetSales',
    type: 'currency',
    view: 'best-selling',
  },
  {
    key: 'totalNetProfit',
    labelKey: 'productPerformance.summary.totalNetProfit',
    type: 'currency',
    view: 'most-profitable',
  },
  {
    key: 'totalNetSoldQty',
    labelKey: 'productPerformance.summary.totalNetSoldQty',
    type: 'number',
    view: 'best-selling',
  },
  {
    key: 'slowMovingProducts',
    secondaryKey: 'verySlowProducts',
    labelKey: 'productPerformance.summary.slowMovingProducts',
    type: 'combinedNumber',
    view: 'slow-moving',
  },
  {
    key: 'deadProducts',
    labelKey: 'productPerformance.summary.deadProducts',
    type: 'number',
    view: 'dead-stock',
  },
  {
    key: 'deadStockValue',
    labelKey: 'productPerformance.summary.deadStockValue',
    type: 'currency',
    view: 'dead-stock',
  },
  {
    key: 'neverSoldProducts',
    labelKey: 'productPerformance.summary.neverSoldProducts',
    type: 'number',
    view: 'never-sold',
  },
  {
    key: 'neverSoldStockValue',
    labelKey: 'productPerformance.summary.neverSoldStockValue',
    type: 'currency',
    view: 'never-sold',
  },
  {
    key: 'negativeStockProducts',
    labelKey: 'productPerformance.summary.negativeStockProducts',
    type: 'number',
    view: 'negative-stock',
  },
]);

const getSafeNumber = (value) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const formatNumber = (value) => {
  return new Intl.NumberFormat().format(getSafeNumber(value));
};

const formatCurrency = (value) => {
  return `${t('currency.rs')} ${new Intl.NumberFormat().format(Math.round(getSafeNumber(value)))}`;
};

const getCardValue = (card, summary) => {
  if (!summary) {
    return card.type === 'currency' ? formatCurrency(0) : formatNumber(0);
  }

  if (card.type === 'combinedNumber') {
    const primaryValue = getSafeNumber(summary[card.key]);

    const secondaryValue = getSafeNumber(summary[card.secondaryKey]);

    return formatNumber(primaryValue + secondaryValue);
  }

  if (card.type === 'currency') {
    return formatCurrency(summary[card.key]);
  }

  return formatNumber(summary[card.key]);
};

const SummaryCardSkeleton = () => {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-3 w-24 rounded bg-gray-200" />
      <div className="mt-4 h-7 w-32 rounded bg-gray-200" />
    </div>
  );
};

const SummaryCard = ({ label, value, isActive = false, disabled = false, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        min-h-[112px] w-full rounded-2xl border p-4 text-left
        shadow-sm transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-blue-200
        disabled:cursor-not-allowed disabled:opacity-60
        ${
          isActive
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
        }
      `}
    >
      <p className={`text-xs font-medium ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>
        {label}
      </p>

      <p
        className={`mt-3 break-words text-xl font-bold sm:text-2xl ${
          isActive ? 'text-blue-900' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </button>
  );
};

const TopProductCard = ({ topProduct, isActive = false, disabled = false, onClick }) => {
  const hasTopProduct = Boolean(topProduct?.productId);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !hasTopProduct}
      className={`
        min-h-[112px] w-full rounded-2xl border p-4 text-left
        shadow-sm transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-blue-200
        disabled:cursor-not-allowed disabled:opacity-60
        ${
          isActive
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
        }
      `}
    >
      <p className={`text-xs font-medium ${isActive ? 'text-blue-700' : 'text-gray-500'}`}>
        {t('productPerformance.summary.topProduct')}
      </p>

      <p
        className={`mt-2 truncate text-base font-bold ${
          isActive ? 'text-blue-900' : 'text-gray-900'
        }`}
        title={topProduct?.productName || ''}
      >
        {topProduct?.productName || t('productPerformance.summary.noTopProduct')}
      </p>

      {hasTopProduct && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            {t('productPerformance.summary.score')}:{' '}
            {getSafeNumber(topProduct.performanceScore).toFixed(1)}
          </span>

          <span>
            {t('productPerformance.summary.profit')}: {formatCurrency(topProduct.netProfit)}
          </span>
        </div>
      )}
    </button>
  );
};

const ProductPerformanceSummaryCards = ({
  summary = null,
  loading = false,
  activeView = 'all',
  onViewChange,
}) => {
  const handleViewChange = (view) => {
    if (loading || !view || typeof onViewChange !== 'function' || view === activeView) {
      return;
    }

    onViewChange(view);
  };

  if (loading && !summary) {
    return (
      <section
        aria-label={t('productPerformance.summary.sectionLabel')}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <SummaryCardSkeleton key={index} />
        ))}
      </section>
    );
  }

  return (
    <section
      aria-label={t('productPerformance.summary.sectionLabel')}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <TopProductCard
        topProduct={summary?.topProduct || null}
        isActive={activeView === 'top-performing'}
        disabled={loading}
        onClick={() => handleViewChange('top-performing')}
      />

      {SUMMARY_CARD_CONFIG.map((card) => (
        <SummaryCard
          key={card.key}
          label={t(card.labelKey)}
          value={getCardValue(card, summary)}
          isActive={activeView === card.view}
          disabled={loading}
          onClick={() => handleViewChange(card.view)}
        />
      ))}
    </section>
  );
};

export default ProductPerformanceSummaryCards;
