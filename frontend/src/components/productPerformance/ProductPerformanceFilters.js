import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { t } from '../../i18n/i18n';

const SORT_OPTIONS = Object.freeze([
  {
    value: 'performanceScore',
    labelKey: 'productPerformance.sort.performanceScore',
  },
  {
    value: 'productName',
    labelKey: 'productPerformance.sort.productName',
  },
  {
    value: 'currentStock',
    labelKey: 'productPerformance.sort.currentStock',
  },
  {
    value: 'grossSoldQty',
    labelKey: 'productPerformance.sort.grossSoldQty',
  },
  {
    value: 'refundQty',
    labelKey: 'productPerformance.sort.refundQty',
  },
  {
    value: 'netSoldQty',
    labelKey: 'productPerformance.sort.netSoldQty',
  },
  {
    value: 'grossSales',
    labelKey: 'productPerformance.sort.grossSales',
  },
  {
    value: 'refundAmount',
    labelKey: 'productPerformance.sort.refundAmount',
  },
  {
    value: 'netSales',
    labelKey: 'productPerformance.sort.netSales',
  },
  {
    value: 'netCost',
    labelKey: 'productPerformance.sort.netCost',
  },
  {
    value: 'netProfit',
    labelKey: 'productPerformance.sort.netProfit',
  },
  {
    value: 'profitMargin',
    labelKey: 'productPerformance.sort.profitMargin',
  },
  {
    value: 'invoiceCount',
    labelKey: 'productPerformance.sort.invoiceCount',
  },
  {
    value: 'lastSaleDate',
    labelKey: 'productPerformance.sort.lastSaleDate',
  },
  {
    value: 'lastPurchaseDate',
    labelKey: 'productPerformance.sort.lastPurchaseDate',
  },
  {
    value: 'daysSinceLastSale',
    labelKey: 'productPerformance.sort.daysSinceLastSale',
  },
  {
    value: 'blockedStockValue',
    labelKey: 'productPerformance.sort.blockedStockValue',
  },
]);

const SORT_ORDER_OPTIONS = Object.freeze([
  {
    value: 'desc',
    labelKey: 'productPerformance.sort.descending',
  },
  {
    value: 'asc',
    labelKey: 'productPerformance.sort.ascending',
  },
]);

const QUICK_DATE_OPTIONS = Object.freeze([
  {
    value: 'all',
    labelKey: 'productPerformance.date.allTime',
  },
  {
    value: 'today',
    labelKey: 'date.today',
  },
  {
    value: 'thisMonth',
    labelKey: 'date.thisMonth',
  },
  {
    value: 'lastMonth',
    labelKey: 'date.lastMonth',
  },
  {
    value: 'thisYear',
    labelKey: 'date.thisYear',
  },
  {
    value: 'custom',
    labelKey: 'date.custom',
  },
]);

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getQuickDateRange = (rangeType) => {
  const now = new Date();

  switch (rangeType) {
    case 'today':
      return {
        startDate: formatDate(now),
        endDate: formatDate(now),
      };

    case 'thisMonth':
      return {
        startDate: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };

    case 'lastMonth':
      return {
        startDate: formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: formatDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };

    case 'thisYear':
      return {
        startDate: `${now.getFullYear()}-01-01`,
        endDate: `${now.getFullYear()}-12-31`,
      };

    case 'all':
      return {
        startDate: '',
        endDate: '',
      };

    default:
      return null;
  }
};

const detectQuickDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) {
    return 'all';
  }

  const rangeTypes = ['today', 'thisMonth', 'lastMonth', 'thisYear'];

  const matchedRange = rangeTypes.find((rangeType) => {
    const range = getQuickDateRange(rangeType);

    return range?.startDate === startDate && range?.endDate === endDate;
  });

  return matchedRange || 'custom';
};

const ProductPerformanceFilters = ({
  filters,
  loading = false,
  hasActiveFilters = false,
  onChange,
  onMultipleChange,
  onReset,
}) => {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');

  const baseUrl = process.env.REACT_APP_API_BASE_URL;

  const selectedQuickDate = useMemo(
    () => detectQuickDateRange(filters.startDate, filters.endDate),
    [filters.startDate, filters.endDate]
  );

  const loadCategories = useCallback(
    async (signal) => {
      try {
        setCategoriesLoading(true);
        setCategoriesError('');

        if (!baseUrl) {
          throw new Error('REACT_APP_API_BASE_URL is not configured.');
        }

        const token = localStorage.getItem('token');

        if (!token) {
          throw new Error('Authentication token is missing.');
        }

        const response = await axios.get(`${baseUrl}/api/categories`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal,
        });

        const responseData = response?.data;

        const categoryList = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.categories)
            ? responseData.categories
            : [];

        const normalizedCategories = categoryList
          .filter((category) => category?._id)
          .map((category) => ({
            id: category._id,
            name: category.name || '-',
          }))
          .sort((first, second) =>
            first.name.localeCompare(second.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          );

        setCategories(normalizedCategories);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
          return;
        }

        console.error('Product performance categories error:', error);

        setCategories([]);
        setCategoriesError(t('productPerformance.errors.categoriesLoadFailed'));
      } finally {
        if (!signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    },
    [baseUrl]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadCategories(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCategories]);

  const handleInputChange = useCallback(
    (event) => {
      const { name, value, type, checked } = event.target;

      onChange(name, type === 'checkbox' ? checked : value);
    },
    [onChange]
  );

  const handleQuickDateChange = useCallback(
    (event) => {
      const selectedRange = event.target.value;

      if (selectedRange === 'custom') {
        return;
      }

      const range = getQuickDateRange(selectedRange);

      if (!range) {
        return;
      }

      onMultipleChange(range);
    },
    [onMultipleChange]
  );

  const handleStartDateChange = useCallback(
    (event) => {
      const startDate = event.target.value;

      onMultipleChange({
        startDate,
        endDate:
          filters.endDate && startDate && filters.endDate < startDate ? startDate : filters.endDate,
      });
    },
    [filters.endDate, onMultipleChange]
  );

  const handleEndDateChange = useCallback(
    (event) => {
      const endDate = event.target.value;

      onMultipleChange({
        endDate,
        startDate:
          filters.startDate && endDate && filters.startDate > endDate ? endDate : filters.startDate,
      });
    },
    [filters.startDate, onMultipleChange]
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {t('productPerformance.filters.title')}
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            {t('productPerformance.filters.description')}
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          disabled={loading || !hasActiveFilters}
          className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('productPerformance.filters.clearFilters')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <label
            htmlFor="product-performance-search"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.searchProduct')}
          </label>

          <input
            id="product-performance-search"
            name="search"
            type="search"
            value={filters.search}
            onChange={handleInputChange}
            disabled={loading}
            autoComplete="off"
            placeholder={t('productPerformance.filters.searchPlaceholder')}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="product-performance-category"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.category')}
          </label>

          <select
            id="product-performance-category"
            name="categoryId"
            value={filters.categoryId}
            onChange={handleInputChange}
            disabled={loading || categoriesLoading}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            <option value="">
              {categoriesLoading
                ? t('common.loading')
                : t('productPerformance.filters.allCategories')}
            </option>

            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          {categoriesError && <p className="mt-1 text-xs text-red-600">{categoriesError}</p>}
        </div>

        <div>
          <label
            htmlFor="product-performance-quick-date"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.dateRange')}
          </label>

          <select
            id="product-performance-quick-date"
            value={selectedQuickDate}
            onChange={handleQuickDateChange}
            disabled={loading}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {QUICK_DATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="product-performance-start-date"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('date.startDate')}
          </label>

          <input
            id="product-performance-start-date"
            type="date"
            value={filters.startDate}
            onChange={handleStartDateChange}
            disabled={loading}
            max={filters.endDate || undefined}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="product-performance-end-date"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('date.endDate')}
          </label>

          <input
            id="product-performance-end-date"
            type="date"
            value={filters.endDate}
            onChange={handleEndDateChange}
            disabled={loading}
            min={filters.startDate || undefined}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>

        <div>
          <label
            htmlFor="product-performance-sort-by"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.sortBy')}
          </label>

          <select
            id="product-performance-sort-by"
            name="sortBy"
            value={filters.sortBy}
            onChange={handleInputChange}
            disabled={loading}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="product-performance-sort-order"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.sortOrder')}
          </label>

          <select
            id="product-performance-sort-order"
            name="sortOrder"
            value={filters.sortOrder}
            onChange={handleInputChange}
            disabled={loading}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {SORT_ORDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="product-performance-dead-days"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            {t('productPerformance.filters.deadAfterDays')}
          </label>

          <input
            id="product-performance-dead-days"
            name="deadAfterDays"
            type="number"
            min="1"
            max="3650"
            step="1"
            value={filters.deadAfterDays}
            onChange={handleInputChange}
            disabled={loading}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 transition hover:bg-gray-50">
          <input
            name="hideZeroStock"
            type="checkbox"
            checked={filters.hideZeroStock}
            onChange={handleInputChange}
            disabled={loading}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
          />

          <span className="text-sm text-gray-700">
            {t('productPerformance.filters.hideZeroStock')}
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 transition hover:bg-gray-50">
          <input
            name="inStockOnly"
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={handleInputChange}
            disabled={loading}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
          />

          <span className="text-sm text-gray-700">
            {t('productPerformance.filters.inStockOnly')}
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 transition hover:bg-gray-50">
          <input
            name="includeNegativeStock"
            type="checkbox"
            checked={filters.includeNegativeStock}
            onChange={handleInputChange}
            disabled={loading}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
          />

          <span className="text-sm text-gray-700">
            {t('productPerformance.filters.includeNegativeStock')}
          </span>
        </label>
      </div>
    </section>
  );
};

export default ProductPerformanceFilters;
