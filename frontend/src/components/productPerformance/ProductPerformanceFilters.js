import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/i18n';
import { getCategories } from '../../services/categoryService';
const SORT_OPTIONS = Object.freeze([
  { value: 'performanceScore', labelKey: 'productPerformance.sort.performanceScore' },
  { value: 'productName', labelKey: 'productPerformance.sort.productName' },
  { value: 'currentStock', labelKey: 'productPerformance.sort.currentStock' },
  { value: 'grossSoldQty', labelKey: 'productPerformance.sort.grossSoldQty' },
  { value: 'refundQty', labelKey: 'productPerformance.sort.refundQty' },
  { value: 'netSoldQty', labelKey: 'productPerformance.sort.netSoldQty' },
  { value: 'grossSales', labelKey: 'productPerformance.sort.grossSales' },
  { value: 'refundAmount', labelKey: 'productPerformance.sort.refundAmount' },
  { value: 'netSales', labelKey: 'productPerformance.sort.netSales' },
  { value: 'netCost', labelKey: 'productPerformance.sort.netCost' },
  { value: 'netProfit', labelKey: 'productPerformance.sort.netProfit' },
  { value: 'profitMargin', labelKey: 'productPerformance.sort.profitMargin' },
  { value: 'invoiceCount', labelKey: 'productPerformance.sort.invoiceCount' },
  { value: 'lastSaleDate', labelKey: 'productPerformance.sort.lastSaleDate' },
  { value: 'lastPurchaseDate', labelKey: 'productPerformance.sort.lastPurchaseDate' },
  { value: 'daysSinceLastSale', labelKey: 'productPerformance.sort.daysSinceLastSale' },
  { value: 'blockedStockValue', labelKey: 'productPerformance.sort.blockedStockValue' },
]);

const SORT_ORDER_OPTIONS = Object.freeze([
  { value: 'desc', labelKey: 'productPerformance.sort.descending' },
  { value: 'asc', labelKey: 'productPerformance.sort.ascending' },
]);

const QUICK_DATE_OPTIONS = Object.freeze([
  { value: 'all', labelKey: 'productPerformance.date.allTime' },
  { value: 'today', labelKey: 'date.today' },
  { value: 'thisMonth', labelKey: 'date.thisMonth' },
  { value: 'lastMonth', labelKey: 'date.lastMonth' },
  { value: 'thisYear', labelKey: 'date.thisYear' },
  { value: 'custom', labelKey: 'date.custom' },
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
      return { startDate: formatDate(now), endDate: formatDate(now) };
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
      return { startDate: '', endDate: '' };
    default:
      return null;
  }
};

const detectQuickDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return 'all';
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
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  const selectedQuickDate = useMemo(
    () => detectQuickDateRange(filters.startDate, filters.endDate),
    [filters.startDate, filters.endDate]
  );

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);

      const responseData = await getCategories();

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
      console.error('Failed to load product performance categories:', error);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      if (selectedRange === 'custom') return;
      const range = getQuickDateRange(selectedRange);
      if (range) onMultipleChange(range);
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

  const currentStockStatusValue = useMemo(() => {
    if (filters.hideZeroStock) return 'hideZero';
    if (filters.inStockOnly) return 'inStockOnly';
    if (filters.includeNegativeStock) return 'includeNegative';
    return 'all';
  }, [filters.hideZeroStock, filters.inStockOnly, filters.includeNegativeStock]);

  const handleStockStatusChange = (e) => {
    const val = e.target.value;
    onMultipleChange({
      hideZeroStock: val === 'hideZero',
      inStockOnly: val === 'inStockOnly',
      includeNegativeStock: val === 'includeNegative',
    });
  };

  const selectedCategoryName = useMemo(() => {
    const cat = categories.find((c) => c.id === filters.categoryId);
    return cat ? cat.name : '';
  }, [categories, filters.categoryId]);

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(categorySearchQuery.toLowerCase())
    );
  }, [categories, categorySearchQuery]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all">
      <div className="flex flex-col gap-3">
        {/* ROW 1: Search, Searchable Category Dropdown, Date Range, Start Date, End Date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Search Input */}
          <div className="relative lg:col-span-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              id="product-performance-search"
              name="search"
              type="search"
              value={filters.search}
              onChange={handleInputChange}
              disabled={loading}
              autoComplete="off"
              placeholder={
                t('productPerformance.filters.searchPlaceholder') || 'Search by product name...'
              }
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </div>

          {/* Searchable Category Dropdown (Clean, No Extra Icon) */}
          <div className="relative lg:col-span-3" ref={categoryDropdownRef}>
            <div
              onClick={() => !loading && setIsCategoryOpen((prev) => !prev)}
              className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100/60 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100"
            >
              <span
                className={`truncate ${selectedCategoryName ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}
              >
                {categoriesLoading
                  ? t('common.loading')
                  : selectedCategoryName ||
                    t('productPerformance.filters.allCategories') ||
                    'All Categories'}
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>

            {isCategoryOpen && (
              <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl">
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="Search category..."
                  className="mb-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                <div className="max-h-52 overflow-y-auto space-y-1">
                  <div
                    onClick={() => {
                      onChange('categoryId', '');
                      setIsCategoryOpen(false);
                      setCategorySearchQuery('');
                    }}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold ${!filters.categoryId ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {t('productPerformance.filters.allCategories') || 'All Categories'}
                  </div>
                  {filteredCategories.map((cat) => (
                    <div
                      key={cat.id}
                      onClick={() => {
                        onChange('categoryId', cat.id);
                        setIsCategoryOpen(false);
                        setCategorySearchQuery('');
                      }}
                      className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium ${filters.categoryId === cat.id ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {cat.name}
                    </div>
                  ))}
                  {filteredCategories.length === 0 && (
                    <div className="p-3 text-center text-xs text-slate-400">No category found</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Date Range */}
          <div className="lg:col-span-2">
            <select
              id="product-performance-quick-date"
              value={selectedQuickDate}
              onChange={handleQuickDateChange}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            >
              {QUICK_DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="lg:col-span-1.5 lg:col-span-2">
            <input
              id="product-performance-start-date"
              type="date"
              value={filters.startDate}
              onChange={handleStartDateChange}
              disabled={loading}
              max={filters.endDate || undefined}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* End Date */}
          <div className="lg:col-span-1.5 lg:col-span-1 border-slate-200">
            <input
              id="product-performance-end-date"
              type="date"
              value={filters.endDate}
              onChange={handleEndDateChange}
              disabled={loading}
              min={filters.startDate || undefined}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* ROW 2: Sort By, Sort Order, Dead Days, Stock Status Dropdown, Clear Filters Button */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Sort By */}
          <div className="lg:col-span-3">
            <select
              id="product-performance-sort-by"
              name="sortBy"
              value={filters.sortBy}
              onChange={handleInputChange}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div className="lg:col-span-2">
            <select
              id="product-performance-sort-order"
              name="sortOrder"
              value={filters.sortOrder}
              onChange={handleInputChange}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            >
              {SORT_ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Dead Stock After Days Input */}
          <div className="relative lg:col-span-2">
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
              placeholder="Dead After (Days)"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Combined Stock Status Selector */}
          <div className="lg:col-span-3">
            <select
              id="product-performance-stock-status"
              value={currentStockStatusValue}
              onChange={handleStockStatusChange}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            >
              <option value="all">All Stock Statuses</option>
              <option value="hideZero">Hide Zero-Stock Products</option>
              <option value="inStockOnly">In-Stock Products Only</option>
              <option value="includeNegative">Include Negative Stock</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="lg:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={onReset}
              disabled={loading || !hasActiveFilters}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t('productPerformance.filters.clearFilters') || 'Clear Filters'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductPerformanceFilters;
