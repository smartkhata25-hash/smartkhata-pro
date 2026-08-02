import React, { useMemo } from 'react';

import { t } from '../../i18n/i18n';

const PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);

const getSafePositiveNumber = (value, fallback = 1) => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return Math.floor(parsedValue);
};

const getVisiblePages = (currentPage, totalPages) => {
  const safeCurrentPage = Math.min(Math.max(getSafePositiveNumber(currentPage), 1), totalPages);

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (safeCurrentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages];
  }

  if (safeCurrentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis-start',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    'ellipsis-start',
    safeCurrentPage - 1,
    safeCurrentPage,
    safeCurrentPage + 1,
    'ellipsis-end',
    totalPages,
  ];
};

const PaginationButton = ({ children, disabled = false, active = false, onClick, ariaLabel }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`
        inline-flex h-9 min-w-[36px] items-center justify-center
        rounded-lg border px-3 text-sm font-medium transition
        focus:outline-none focus:ring-2 focus:ring-blue-200
        disabled:cursor-not-allowed disabled:opacity-50
        ${
          active
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
        }
      `}
    >
      {children}
    </button>
  );
};

const ProductPerformancePagination = ({
  pagination = {},
  loading = false,
  onPageChange,
  onLimitChange,
}) => {
  const page = getSafePositiveNumber(pagination.page, 1);
  const limit = getSafePositiveNumber(pagination.limit, 25);
  const totalRows = Math.max(Number(pagination.totalRows) || 0, 0);
  const totalPages = Math.max(getSafePositiveNumber(pagination.totalPages, 1), 1);

  const normalizedPage = Math.min(page, totalPages);

  const hasPreviousPage =
    typeof pagination.hasPreviousPage === 'boolean'
      ? pagination.hasPreviousPage
      : normalizedPage > 1;

  const hasNextPage =
    typeof pagination.hasNextPage === 'boolean'
      ? pagination.hasNextPage
      : normalizedPage < totalPages;

  const visiblePages = useMemo(
    () => getVisiblePages(normalizedPage, totalPages),
    [normalizedPage, totalPages]
  );

  const startRow = totalRows === 0 ? 0 : (normalizedPage - 1) * limit + 1;

  const endRow = totalRows === 0 ? 0 : Math.min(normalizedPage * limit, totalRows);

  const handlePageChange = (nextPage) => {
    if (loading || typeof onPageChange !== 'function') {
      return;
    }

    const safeNextPage = Math.min(Math.max(getSafePositiveNumber(nextPage), 1), totalPages);

    if (safeNextPage === normalizedPage) {
      return;
    }

    onPageChange(safeNextPage);
  };

  const handleLimitChange = (event) => {
    if (loading || typeof onLimitChange !== 'function') {
      return;
    }

    const nextLimit = getSafePositiveNumber(event.target.value, 25);

    onLimitChange(nextLimit);
  };

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>
            {t('pagination.showing')}{' '}
            <strong className="font-semibold text-gray-900">{startRow}</strong> {t('common.to')}{' '}
            <strong className="font-semibold text-gray-900">{endRow}</strong> {t('pagination.of')}{' '}
            <strong className="font-semibold text-gray-900">{totalRows}</strong>
          </span>

          <label htmlFor="product-performance-page-size" className="flex items-center gap-2">
            <span>{t('productPerformance.pagination.rowsPerPage')}</span>

            <select
              id="product-performance-page-size"
              value={limit}
              onChange={handleLimitChange}
              disabled={loading}
              className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              {PAGE_SIZE_OPTIONS.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
        </div>

        <nav
          aria-label={t('productPerformance.pagination.navigationLabel')}
          className="flex flex-wrap items-center gap-2"
        >
          <PaginationButton
            disabled={loading || !hasPreviousPage}
            onClick={() => handlePageChange(normalizedPage - 1)}
            ariaLabel={t('pagination.prev')}
          >
            {t('pagination.prev')}
          </PaginationButton>

          {visiblePages.map((item) => {
            if (item === 'ellipsis-start' || item === 'ellipsis-end') {
              return (
                <span
                  key={item}
                  aria-hidden="true"
                  className="inline-flex h-9 min-w-[32px] items-center justify-center text-sm text-gray-500"
                >
                  …
                </span>
              );
            }

            return (
              <PaginationButton
                key={item}
                active={item === normalizedPage}
                disabled={loading}
                onClick={() => handlePageChange(item)}
                ariaLabel={`${t('pagination.page')} ${item}`}
              >
                {item}
              </PaginationButton>
            );
          })}

          <PaginationButton
            disabled={loading || !hasNextPage}
            onClick={() => handlePageChange(normalizedPage + 1)}
            ariaLabel={t('pagination.next')}
          >
            {t('pagination.next')}
          </PaginationButton>
        </nav>
      </div>
    </div>
  );
};

export default ProductPerformancePagination;
