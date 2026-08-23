import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { t } from '../i18n/i18n';

import {
  fetchProductPerformanceDetails,
  fetchProductPerformanceReport,
} from '../services/productPerformanceService';

import ProductPerformanceFilters from '../components/productPerformance/ProductPerformanceFilters';
import ProductPerformanceTabs from '../components/productPerformance/ProductPerformanceTabs';
import ProductPerformanceSummaryCards from '../components/productPerformance/ProductPerformanceSummaryCards';
import ProductPerformanceTable from '../components/productPerformance/ProductPerformanceTable';
import ProductPerformancePagination from '../components/productPerformance/ProductPerformancePagination';
import ProductPerformanceDrawer from '../components/productPerformance/ProductPerformanceDrawer';
import ProductPerformanceEmptyState from '../components/productPerformance/ProductPerformanceEmptyState';

const DEFAULT_FILTERS = Object.freeze({
  view: 'all',
  search: '',
  categoryId: '',
  startDate: '',
  endDate: '',
  deadAfterDays: 90,
  hideZeroStock: false,
  inStockOnly: false,
  includeNegativeStock: true,
  sortBy: 'performanceScore',
  sortOrder: 'desc',
  page: 1,
  limit: 25,
});

const BOOLEAN_QUERY_FIELDS = Object.freeze([
  'hideZeroStock',
  'inStockOnly',
  'includeNegativeStock',
]);

const NUMBER_QUERY_FIELDS = Object.freeze(['page', 'limit', 'deadAfterDays']);

const parseBoolean = (value, fallback) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
};

const parsePositiveNumber = (value, fallback) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

const getFiltersFromSearchParams = (searchParams) => {
  const filters = {
    ...DEFAULT_FILTERS,
  };

  Object.keys(DEFAULT_FILTERS).forEach((key) => {
    const value = searchParams.get(key);

    if (value === null) {
      return;
    }

    if (BOOLEAN_QUERY_FIELDS.includes(key)) {
      filters[key] = parseBoolean(value, DEFAULT_FILTERS[key]);
      return;
    }

    if (NUMBER_QUERY_FIELDS.includes(key)) {
      filters[key] = parsePositiveNumber(value, DEFAULT_FILTERS[key]);
      return;
    }

    filters[key] = value;
  });

  return filters;
};

const buildSearchParams = (filters) => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const defaultValue = DEFAULT_FILTERS[key];

    const shouldSkip =
      value === undefined || value === null || value === '' || value === defaultValue;

    if (shouldSkip) {
      return;
    }

    params.set(key, String(value));
  });

  return params;
};

const createInitialReportState = () => ({
  summary: null,
  rows: [],
  pagination: {
    page: 1,
    limit: DEFAULT_FILTERS.limit,
    totalRows: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
  generatedAt: null,
});

const createInitialDrawerState = () => ({
  isOpen: false,
  loading: false,
  error: '',
  data: null,
  productId: null,
});

const ProductPerformancePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState(() => getFiltersFromSearchParams(searchParams));

  const [report, setReport] = useState(createInitialReportState);
  const [drawerState, setDrawerState] = useState(createInitialDrawerState);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const reportRequestIdRef = useRef(0);
  const detailsRequestIdRef = useRef(0);
  const searchTimeoutRef = useRef(null);
  const firstLoadRef = useRef(true);

  const normalizedFilters = useMemo(() => {
    return {
      ...filters,

      page: Math.max(Number(filters.page) || 1, 1),

      limit: Math.min(Math.max(Number(filters.limit) || DEFAULT_FILTERS.limit, 1), 100),

      deadAfterDays: Math.min(
        Math.max(Number(filters.deadAfterDays) || DEFAULT_FILTERS.deadAfterDays, 1),
        3650
      ),
    };
  }, [filters]);

  const updateUrl = useCallback(
    (nextFilters) => {
      const params = buildSearchParams(nextFilters);

      setSearchParams(params, {
        replace: true,
      });
    },
    [setSearchParams]
  );

  const loadReport = useCallback(
    async ({ showRefreshLoader = false } = {}) => {
      const requestId = reportRequestIdRef.current + 1;
      reportRequestIdRef.current = requestId;

      try {
        setError('');

        if (showRefreshLoader) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await fetchProductPerformanceReport(normalizedFilters, {
          forceRefresh: showRefreshLoader,
        });

        if (requestId !== reportRequestIdRef.current) {
          return;
        }

        const responsePage = Number(response?.pagination?.page || 1);

        setReport({
          summary: response?.summary || null,

          rows: Array.isArray(response?.rows) ? response.rows : [],

          pagination: {
            page: responsePage,

            limit: Number(response?.pagination?.limit || normalizedFilters.limit),

            totalRows: Number(response?.pagination?.totalRows || 0),

            totalPages: Math.max(Number(response?.pagination?.totalPages || 1), 1),

            hasPreviousPage: Boolean(response?.pagination?.hasPreviousPage),

            hasNextPage: Boolean(response?.pagination?.hasNextPage),
          },

          generatedAt: response?.generatedAt || null,
        });

        if (responsePage !== normalizedFilters.page) {
          setFilters((previousFilters) => ({
            ...previousFilters,
            page: responsePage,
          }));
        }
      } catch (requestError) {
        if (requestId !== reportRequestIdRef.current) {
          return;
        }

        console.error('Product performance report error:', requestError);

        setError(requestError?.message || t('productPerformance.errors.reportLoadFailed'));

        setReport((previousReport) => ({
          ...previousReport,
          rows: [],
        }));
      } finally {
        if (requestId === reportRequestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [normalizedFilters]
  );

  useEffect(() => {
    updateUrl(normalizedFilters);
  }, [normalizedFilters, updateUrl]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const searchDelay = firstLoadRef.current || !normalizedFilters.search.trim() ? 0 : 400;

    searchTimeoutRef.current = setTimeout(() => {
      loadReport();
      firstLoadRef.current = false;
    }, searchDelay);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [loadReport, normalizedFilters.search]);

  useEffect(() => {
    return () => {
      reportRequestIdRef.current += 1;
      detailsRequestIdRef.current += 1;

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleFilterChange = useCallback((name, value) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      [name]: value,
      page: name === 'page' ? Number(value) : 1,
    }));
  }, []);

  const handleFiltersChange = useCallback((changes) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      ...changes,

      page: Object.prototype.hasOwnProperty.call(changes, 'page') ? Number(changes.page) : 1,
    }));
  }, []);

  const handleViewChange = useCallback((view) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      view,
      page: 1,
    }));
  }, []);

  const handleSortChange = useCallback((sortBy, sortOrder) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      sortBy,
      sortOrder,
      page: 1,
    }));
  }, []);

  const handlePageChange = useCallback((page) => {
    const nextPage = Math.max(Number(page) || 1, 1);

    setFilters((previousFilters) => ({
      ...previousFilters,
      page: nextPage,
    }));
  }, []);

  const handleLimitChange = useCallback((limit) => {
    const nextLimit = Math.min(Math.max(Number(limit) || DEFAULT_FILTERS.limit, 1), 100);

    setFilters((previousFilters) => ({
      ...previousFilters,
      limit: nextLimit,
      page: 1,
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({
      ...DEFAULT_FILTERS,
    });
  }, []);

  const handleRefresh = useCallback(() => {
    loadReport({
      showRefreshLoader: true,
    });
  }, [loadReport]);

  const handleOpenProduct = useCallback(async (productId) => {
    if (!productId) {
      return;
    }

    const requestId = detailsRequestIdRef.current + 1;
    detailsRequestIdRef.current = requestId;

    setDrawerState({
      isOpen: true,
      loading: true,
      error: '',
      data: null,
      productId,
    });

    try {
      const response = await fetchProductPerformanceDetails(productId);

      if (requestId !== detailsRequestIdRef.current) {
        return;
      }

      setDrawerState({
        isOpen: true,
        loading: false,
        error: '',
        data: response,
        productId,
      });
    } catch (requestError) {
      if (requestId !== detailsRequestIdRef.current) {
        return;
      }

      console.error('Product performance details error:', requestError);

      setDrawerState({
        isOpen: true,
        loading: false,

        error: requestError?.message || t('productPerformance.errors.detailsLoadFailed'),

        data: null,
        productId,
      });
    }
  }, []);

  const handleCloseDrawer = useCallback(() => {
    detailsRequestIdRef.current += 1;
    setDrawerState(createInitialDrawerState());
  }, []);

  const hasRows = report.rows.length > 0;

  const hasActiveFilters = useMemo(() => {
    return (
      normalizedFilters.search !== DEFAULT_FILTERS.search ||
      normalizedFilters.categoryId !== DEFAULT_FILTERS.categoryId ||
      normalizedFilters.startDate !== DEFAULT_FILTERS.startDate ||
      normalizedFilters.endDate !== DEFAULT_FILTERS.endDate ||
      normalizedFilters.deadAfterDays !== DEFAULT_FILTERS.deadAfterDays ||
      normalizedFilters.hideZeroStock !== DEFAULT_FILTERS.hideZeroStock ||
      normalizedFilters.inStockOnly !== DEFAULT_FILTERS.inStockOnly ||
      normalizedFilters.includeNegativeStock !== DEFAULT_FILTERS.includeNegativeStock
    );
  }, [normalizedFilters]);

  return (
    <div className="min-h-full bg-gray-100 p-0">
      <div className="mx-auto max-w-[1800px] space-y-1">
        <ProductPerformanceTabs
          value={normalizedFilters.view}
          summary={report.summary}
          disabled={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onChange={handleViewChange}
        />

        <ProductPerformanceSummaryCards
          summary={report.summary}
          loading={loading}
          activeView={normalizedFilters.view}
          onViewChange={handleViewChange}
        />

        <ProductPerformanceFilters
          filters={normalizedFilters}
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          onChange={handleFilterChange}
          onMultipleChange={handleFiltersChange}
          onReset={handleResetFilters}
        />

        {error && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-medium text-red-700">{error}</p>

            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              {t('common.refresh')}
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {!loading && !error && !hasRows ? (
            <ProductPerformanceEmptyState
              hasActiveFilters={hasActiveFilters}
              activeView={normalizedFilters.view}
              onReset={handleResetFilters}
            />
          ) : (
            <ProductPerformanceTable
              rows={report.rows}
              loading={loading}
              sortBy={normalizedFilters.sortBy}
              sortOrder={normalizedFilters.sortOrder}
              onSortChange={handleSortChange}
              onProductClick={handleOpenProduct}
            />
          )}

          <ProductPerformancePagination
            pagination={report.pagination}
            loading={loading}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </section>
      </div>

      <ProductPerformanceDrawer
        isOpen={drawerState.isOpen}
        loading={drawerState.loading}
        error={drawerState.error}
        data={drawerState.data}
        onClose={handleCloseDrawer}
        onRetry={() => handleOpenProduct(drawerState.productId)}
      />
    </div>
  );
};

export default ProductPerformancePage;
