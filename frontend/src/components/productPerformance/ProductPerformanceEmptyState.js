import React from 'react';

import { t } from '../../i18n/i18n';

const VIEW_MESSAGE_KEYS = Object.freeze({
  all: 'productPerformance.empty.all',
  'top-performing': 'productPerformance.empty.topPerforming',
  'best-selling': 'productPerformance.empty.bestSelling',
  'most-profitable': 'productPerformance.empty.mostProfitable',
  'slow-moving': 'productPerformance.empty.slowMoving',
  'dead-stock': 'productPerformance.empty.deadStock',
  'never-sold': 'productPerformance.empty.neverSold',
  'negative-stock': 'productPerformance.empty.negativeStock',
});

const getEmptyMessageKey = (activeView, hasActiveFilters) => {
  if (hasActiveFilters) {
    return 'productPerformance.empty.filtered';
  }

  return VIEW_MESSAGE_KEYS[activeView] || 'productPerformance.empty.default';
};

const ProductPerformanceEmptyState = ({
  hasActiveFilters = false,
  activeView = 'all',
  onReset,
}) => {
  const messageKey = getEmptyMessageKey(activeView, hasActiveFilters);

  const handleReset = () => {
    if (hasActiveFilters && typeof onReset === 'function') {
      onReset();
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-3xl"
      >
        📊
      </div>

      <h2 className="mt-5 text-lg font-bold text-gray-900">
        {t('productPerformance.empty.title')}
      </h2>

      <p className="mt-2 max-w-lg text-sm leading-6 text-gray-500">{t(messageKey)}</p>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleReset}
          className="mt-6 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {t('productPerformance.empty.clearFilters')}
        </button>
      )}
    </div>
  );
};

export default ProductPerformanceEmptyState;
