import React from 'react';

import { t } from '../../i18n/i18n';
import { formatBusinessDateForDisplay } from '../../utils/localDateTime';

const TABLE_COLUMNS = Object.freeze([
  {
    key: 'productName',
    labelKey: 'productPerformance.table.product',
    align: 'left',
    sortable: true,
  },
  {
    key: 'category',
    labelKey: 'productPerformance.table.category',
    align: 'left',
    sortable: false,
  },
  {
    key: 'currentStock',
    labelKey: 'productPerformance.table.currentStock',
    align: 'right',
    sortable: true,
  },
  {
    key: 'netSoldQty',
    labelKey: 'productPerformance.table.netSoldQty',
    align: 'right',
    sortable: true,
  },
  {
    key: 'netSales',
    labelKey: 'productPerformance.table.netSales',
    align: 'right',
    sortable: true,
  },
  {
    key: 'netCost',
    labelKey: 'productPerformance.table.netCost',
    align: 'right',
    sortable: true,
  },
  {
    key: 'netProfit',
    labelKey: 'productPerformance.table.netProfit',
    align: 'right',
    sortable: true,
  },
  {
    key: 'profitMargin',
    labelKey: 'productPerformance.table.margin',
    align: 'right',
    sortable: true,
  },
  {
    key: 'performanceScore',
    labelKey: 'productPerformance.table.score',
    align: 'center',
    sortable: true,
  },
  {
    key: 'lastSaleDate',
    labelKey: 'productPerformance.table.lastSale',
    align: 'center',
    sortable: true,
  },
  {
    key: 'status',
    labelKey: 'productPerformance.table.status',
    align: 'center',
    sortable: false,
  },
  {
    key: 'actions',
    labelKey: 'common.actions',
    align: 'center',
    sortable: false,
  },
]);

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

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return formatBusinessDateForDisplay(value);
};

const getTextAlignmentClass = (align) => {
  switch (align) {
    case 'right':
      return 'text-right';

    case 'center':
      return 'text-center';

    case 'left':
    default:
      return 'text-left';
  }
};

const getSortIndicator = ({ columnKey, sortBy, sortOrder }) => {
  if (columnKey !== sortBy) {
    return '↕';
  }

  return sortOrder === 'asc' ? '↑' : '↓';
};

const ProductStatusBadge = ({ status }) => {
  const labelKey = STATUS_LABEL_KEYS[status] || 'productPerformance.status.unknown';

  const statusClass = STATUS_CLASSES[status] || 'bg-gray-100 text-gray-700';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
      {t(labelKey)}
    </span>
  );
};

const PerformanceScore = ({ score, label }) => {
  const safeScore = Math.min(Math.max(getSafeNumber(score), 0), 100);

  return (
    <div className="flex min-w-[92px] flex-col items-center gap-1">
      <span className="text-sm font-bold text-gray-900">{safeScore.toFixed(1)}</span>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{
            width: `${safeScore}%`,
          }}
        />
      </div>

      <span className="text-[10px] text-gray-500">
        {label ? t(`productPerformance.scoreLabel.${label}`) : '-'}
      </span>
    </div>
  );
};

const TableSkeleton = () => {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-gray-100">
          {TABLE_COLUMNS.map((column) => (
            <td key={column.key} className="px-4 py-4">
              <div className="h-4 animate-pulse rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
};

const ProductPerformanceTable = ({
  rows = [],
  loading = false,
  sortBy = 'performanceScore',
  sortOrder = 'desc',
  onSortChange,
  onProductClick,
}) => {
  const handleSort = (column) => {
    if (loading || !column.sortable || typeof onSortChange !== 'function') {
      return;
    }

    const nextSortOrder = sortBy === column.key && sortOrder === 'desc' ? 'asc' : 'desc';

    onSortChange(column.key, nextSortOrder);
  };

  const handleProductOpen = (productId) => {
    if (!productId || typeof onProductClick !== 'function') {
      return;
    }

    onProductClick(productId);
  };

  return (
    <div id="product-performance-report-panel" role="tabpanel" className="overflow-x-auto">
      <table className="min-w-[1450px] w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-200">
            {TABLE_COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 ${getTextAlignmentClass(
                  column.align
                )}`}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(column)}
                    disabled={loading}
                    className={`inline-flex items-center gap-1 rounded px-1 py-1 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                      column.align === 'right'
                        ? 'justify-end'
                        : column.align === 'center'
                          ? 'justify-center'
                          : 'justify-start'
                    }`}
                  >
                    <span>{t(column.labelKey)}</span>

                    <span
                      aria-hidden="true"
                      className={sortBy === column.key ? 'text-blue-600' : 'text-gray-400'}
                    >
                      {getSortIndicator({
                        columnKey: column.key,
                        sortBy,
                        sortOrder,
                      })}
                    </span>
                  </button>
                ) : (
                  t(column.labelKey)
                )}
              </th>
            ))}
          </tr>
        </thead>

        {loading ? (
          <TableSkeleton />
        ) : (
          <tbody>
            {rows.map((row) => {
              const productId = row.productId?.toString?.() || row.productId || '';

              return (
                <tr
                  key={productId}
                  className="border-b border-gray-100 transition hover:bg-blue-50/40"
                >
                  <td className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleProductOpen(productId)}
                      className="max-w-[240px] text-left"
                    >
                      <span className="block truncate font-semibold text-blue-700 hover:underline">
                        {row.productName || '-'}
                      </span>

                      <span className="mt-1 block text-xs text-gray-500">
                        {row.rackNo
                          ? `${t('productPerformance.table.rack')}: ${row.rackNo}`
                          : row.unit || '-'}
                      </span>
                    </button>
                  </td>

                  <td className="px-4 py-3 text-left text-gray-700">{row.category || '-'}</td>

                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      getSafeNumber(row.currentStock) < 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {formatNumber(row.currentStock)}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-800">
                    {formatNumber(row.netSoldQty)}
                  </td>

                  <td className="px-4 py-3 text-right font-medium text-blue-700">
                    {formatCurrency(row.netSales)}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(row.netCost)}
                  </td>

                  <td
                    className={`px-4 py-3 text-right font-bold ${
                      getSafeNumber(row.netProfit) >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(row.netProfit)}
                  </td>

                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      getSafeNumber(row.profitMargin) >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {formatNumber(row.profitMargin, 1)}%
                  </td>

                  <td className="px-4 py-3 text-center">
                    <PerformanceScore score={row.performanceScore} label={row.performanceLabel} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">
                    {formatDate(row.lastSaleDate)}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <ProductStatusBadge status={row.status} />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleProductOpen(productId)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                    >
                      {t('productPerformance.table.viewDetails')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
    </div>
  );
};

export default ProductPerformanceTable;
