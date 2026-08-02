import React, { useEffect } from 'react';

import { t } from '../../i18n/i18n';

const STOCK_TYPE_LABEL_KEYS = Object.freeze({
  IN: 'productPerformance.drawer.stockType.in',
  OUT: 'productPerformance.drawer.stockType.out',
  ADJUST_IN: 'productPerformance.drawer.stockType.adjustIn',
  ADJUST_OUT: 'productPerformance.drawer.stockType.adjustOut',
});

const STOCK_TYPE_CLASSES = Object.freeze({
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-red-100 text-red-700',
  ADJUST_IN: 'bg-blue-100 text-blue-700',
  ADJUST_OUT: 'bg-orange-100 text-orange-700',
});

const STATUS_LABEL_KEYS = Object.freeze({
  active: 'productPerformance.status.active',
  'slow-moving': 'productPerformance.status.slowMoving',
  'very-slow': 'productPerformance.status.verySlow',
  'dead-stock': 'productPerformance.status.deadStock',
  'never-sold': 'productPerformance.status.neverSold',
  'zero-stock': 'productPerformance.status.zeroStock',
  'negative-stock': 'productPerformance.status.negativeStock',
});

const STATUS_CLASSES = Object.freeze({
  active: 'bg-green-100 text-green-700',
  'slow-moving': 'bg-yellow-100 text-yellow-700',
  'very-slow': 'bg-orange-100 text-orange-700',
  'dead-stock': 'bg-red-100 text-red-700',
  'never-sold': 'bg-purple-100 text-purple-700',
  'zero-stock': 'bg-gray-100 text-gray-700',
  'negative-stock': 'bg-rose-100 text-rose-700',
});

const getSafeNumber = (value) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const formatNumber = (value, maximumFractionDigits = 2) => {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(getSafeNumber(value));
};

const formatCurrency = (value) => {
  return `${t('currency.rs')} ${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.round(getSafeNumber(value)))}`;
};

const formatDate = (value, includeTime = false) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
};

const DetailCard = ({ label, value, valueClassName = 'text-gray-900' }) => {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>

      <p className={`mt-1 break-words text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
};

const SectionHeader = ({ title, count = null }) => {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>

      {count !== null && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
          {count}
        </span>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const labelKey = STATUS_LABEL_KEYS[status] || 'productPerformance.status.unknown';

  const statusClass = STATUS_CLASSES[status] || 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
      {t(labelKey)}
    </span>
  );
};

const StockTypeBadge = ({ type }) => {
  const labelKey = STOCK_TYPE_LABEL_KEYS[type] || 'productPerformance.drawer.stockType.unknown';

  const badgeClass = STOCK_TYPE_CLASSES[type] || 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>
      {t(labelKey)}
    </span>
  );
};

const DrawerSkeleton = () => {
  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>

      <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
      <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
    </div>
  );
};

const EmptyTableRow = ({ colSpan, message }) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-500">
        {message}
      </td>
    </tr>
  );
};

const RecentSalesTable = ({ rows = [] }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-[700px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
              {t('common.billNo')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
              {t('customer')}
            </th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
              {t('common.date')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('common.qty')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('rate')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('common.total')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('reports.profit')}
            </th>
          </tr>
        </thead>

        <tbody>
          {!rows.length ? (
            <EmptyTableRow colSpan={7} message={t('productPerformance.drawer.noRecentSales')} />
          ) : (
            rows.map((item) => (
              <tr
                key={item.invoiceId}
                className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-3 py-2 font-medium text-gray-900">{item.billNo || '-'}</td>

                <td className="px-3 py-2 text-gray-700">{item.customerName || '-'}</td>

                <td className="px-3 py-2 text-center text-gray-600">
                  {formatDate(item.invoiceDate)}
                </td>

                <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>

                <td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td>

                <td className="px-3 py-2 text-right font-medium text-blue-700">
                  {formatCurrency(item.total)}
                </td>

                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    getSafeNumber(item.profit) >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(item.profit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const RecentRefundsTable = ({ rows = [] }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-[620px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
              {t('common.billNo')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
              {t('customer')}
            </th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
              {t('common.date')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('common.qty')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('rate')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('common.total')}
            </th>
          </tr>
        </thead>

        <tbody>
          {!rows.length ? (
            <EmptyTableRow colSpan={6} message={t('productPerformance.drawer.noRecentRefunds')} />
          ) : (
            rows.map((item) => (
              <tr
                key={item.refundId}
                className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
              >
                <td className="px-3 py-2 font-medium text-gray-900">{item.billNo || '-'}</td>

                <td className="px-3 py-2 text-gray-700">{item.customerName || '-'}</td>

                <td className="px-3 py-2 text-center text-gray-600">
                  {formatDate(item.invoiceDate)}
                </td>

                <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>

                <td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td>

                <td className="px-3 py-2 text-right font-semibold text-red-600">
                  {formatCurrency(item.total)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const StockMovementsTable = ({ rows = [] }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
              {t('common.date')}
            </th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">
              {t('common.type')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('common.qty')}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">
              {t('rate')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('note')}</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
              {t('productPerformance.drawer.reference')}
            </th>
          </tr>
        </thead>

        <tbody>
          {!rows.length ? (
            <EmptyTableRow colSpan={6} message={t('productPerformance.drawer.noStockMovements')} />
          ) : (
            rows.map((item) => {
              const movementId = item._id || `${item.type}-${item.date}-${item.quantity}`;

              return (
                <tr
                  key={movementId}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-center text-gray-600">
                    {formatDate(item.date, true)}
                  </td>

                  <td className="px-3 py-2 text-center">
                    <StockTypeBadge type={item.type} />
                  </td>

                  <td className="px-3 py-2 text-right font-semibold">
                    {formatNumber(item.quantity)}
                  </td>

                  <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>

                  <td className="max-w-[260px] px-3 py-2 text-gray-700">
                    <span className="block truncate" title={item.note || ''}>
                      {item.note || '-'}
                    </span>
                  </td>

                  <td className="px-3 py-2 text-gray-600">
                    {item.adjustNo || item.invoiceModel || '-'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const ProductPerformanceDrawer = ({
  isOpen = false,
  loading = false,
  error = '',
  data = null,
  onClose,
  onRetry,
}) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const product = data?.product || {};
  const performance = data?.performance || {};

  const recentSales = Array.isArray(data?.recentSales) ? data.recentSales : [];

  const recentRefunds = Array.isArray(data?.recentRefunds) ? data.recentRefunds : [];

  const recentStockMovements = Array.isArray(data?.recentStockMovements)
    ? data.recentStockMovements
    : [];

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleRetry = () => {
    if (typeof onRetry === 'function') {
      onRetry();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={handleClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-performance-drawer-title"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[900px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id="product-performance-drawer-title"
              className="truncate text-lg font-bold text-gray-900"
            >
              {loading
                ? t('productPerformance.drawer.loadingTitle')
                : product.productName || t('productPerformance.drawer.title')}
            </h2>

            {!loading && product.category && (
              <p className="mt-1 truncate text-sm text-gray-500">
                {product.category}
                {product.rackNo
                  ? ` • ${t('productPerformance.table.rack')}: ${product.rackNo}`
                  : ''}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <DrawerSkeleton />
          ) : error ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center p-6 text-center">
              <div className="rounded-full bg-red-100 px-4 py-3 text-xl">⚠</div>

              <h3 className="mt-4 text-base font-bold text-gray-900">
                {t('productPerformance.drawer.loadFailed')}
              </h3>

              <p className="mt-2 max-w-md text-sm text-red-600">{error}</p>

              <button
                type="button"
                onClick={handleRetry}
                className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {t('productPerformance.drawer.tryAgain')}
              </button>
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              <section>
                <SectionHeader title={t('productPerformance.drawer.productSummary')} />

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={performance.status} />

                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {t('productPerformance.drawer.performanceScore')}:{' '}
                    {formatNumber(performance.performanceScore, 1)}
                  </span>

                  {performance.performanceLabel && (
                    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      {t(`productPerformance.scoreLabel.${performance.performanceLabel}`)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <DetailCard
                    label={t('productPerformance.drawer.currentStock')}
                    value={formatNumber(performance.currentStock)}
                    valueClassName={
                      getSafeNumber(performance.currentStock) < 0 ? 'text-red-600' : 'text-gray-900'
                    }
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.unitCost')}
                    value={formatCurrency(product.unitCost)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.salePrice')}
                    value={formatCurrency(product.salePrice)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.netSoldQty')}
                    value={formatNumber(performance.netSoldQty)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.netSales')}
                    value={formatCurrency(performance.netSales)}
                    valueClassName="text-blue-700"
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.netCost')}
                    value={formatCurrency(performance.netCost)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.netProfit')}
                    value={formatCurrency(performance.netProfit)}
                    valueClassName={
                      getSafeNumber(performance.netProfit) >= 0 ? 'text-green-700' : 'text-red-600'
                    }
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.profitMargin')}
                    value={`${formatNumber(performance.profitMargin, 1)}%`}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.invoiceCount')}
                    value={formatNumber(performance.invoiceCount, 0)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.refundQty')}
                    value={formatNumber(performance.refundQty)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.lastSaleDate')}
                    value={formatDate(performance.lastSaleDate)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.lastPurchaseDate')}
                    value={formatDate(performance.lastPurchaseDate)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.daysSinceLastSale')}
                    value={
                      performance.daysSinceLastSale === null ||
                      performance.daysSinceLastSale === undefined
                        ? '-'
                        : formatNumber(performance.daysSinceLastSale, 0)
                    }
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.blockedStockValue')}
                    value={formatCurrency(performance.blockedStockValue)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.lastPurchaseRate')}
                    value={formatCurrency(performance.lastPurchaseRate)}
                  />

                  <DetailCard
                    label={t('productPerformance.drawer.unit')}
                    value={product.unit || '-'}
                  />
                </div>

                {product.description && (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500">{t('common.description')}</p>

                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {product.description}
                    </p>
                  </div>
                )}
              </section>

              <section>
                <SectionHeader
                  title={t('productPerformance.drawer.recentSales')}
                  count={recentSales.length}
                />

                <RecentSalesTable rows={recentSales} />
              </section>

              <section>
                <SectionHeader
                  title={t('productPerformance.drawer.recentRefunds')}
                  count={recentRefunds.length}
                />

                <RecentRefundsTable rows={recentRefunds} />
              </section>

              <section>
                <SectionHeader
                  title={t('productPerformance.drawer.stockMovements')}
                  count={recentStockMovements.length}
                />

                <StockMovementsTable rows={recentStockMovements} />
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default ProductPerformanceDrawer;
