import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { getAllPayBills, deletePayBill } from '../services/payBillService';

import { fetchSuppliers } from '../services/supplierService';
import { fetchPurchaseParties } from '../services/partyService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const DEFAULT_FILTERS = {
  supplier: '',
  paymentType: '',
  search: '',
  fromDate: '',
  toDate: '',
};

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  totalBills: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

const PayBillList = () => {
  const navigate = useNavigate();

  const canViewPayBills = hasPermission('pay_bills.view');
  const canCreatePayBills = hasPermission('pay_bills.create');
  const canEditPayBills = hasPermission('pay_bills.edit');
  const canDeletePayBills = hasPermission('pay_bills.delete');

  const [bills, setBills] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);

  const [loading, setLoading] = useState(false);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const requestIdRef = useRef(0);

  const getBillTotal = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      return bill.paymentEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    }

    return Number(bill.amount || 0);
  }, []);

  const getPaymentTypes = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      const uniquePaymentTypes = [
        ...new Set(
          bill.paymentEntries
            .map((entry) => entry.paymentType)
            .filter(Boolean)
            .map((type) => String(type).toLowerCase())
        ),
      ];

      return uniquePaymentTypes.length > 0 ? uniquePaymentTypes.join(', ') : '-';
    }

    return bill.paymentType || bill.paymentMode || '-';
  }, []);

  const getAccountNames = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      const uniqueAccountNames = [
        ...new Set(
          bill.paymentEntries
            .map((entry) => entry.account?.name || entry.accountName)
            .filter(Boolean)
        ),
      ];

      return uniqueAccountNames.length > 0 ? uniqueAccountNames.join(', ') : '-';
    }

    return bill.account?.name || bill.accountName || '-';
  }, []);

  const getSupplierOrPartyName = useCallback(
    (bill) => {
      const partyId = typeof bill.partyId === 'object' ? bill.partyId?._id : bill.partyId;

      const supplierId = typeof bill.supplier === 'object' ? bill.supplier?._id : bill.supplier;

      if (partyId) {
        const partyName =
          bill.partyId?.name ||
          parties.find((party) => String(party._id) === String(partyId))?.name ||
          bill.supplierName;

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      if (supplierId) {
        const supplierName =
          bill.supplier?.name ||
          suppliers.find((supplier) => String(supplier._id) === String(supplierId))?.name ||
          bill.supplierName;

        return supplierName || '-';
      }

      return bill.supplierName || '-';
    },
    [parties, suppliers]
  );

  const normalisePagination = useCallback(
    (paginationData, requestedPage, requestedLimit, recordCount) => {
      if (!paginationData) {
        return {
          page: requestedPage,
          limit: requestedLimit,
          totalBills: recordCount,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        };
      }

      const page = Math.max(1, Number(paginationData.page || requestedPage));

      const limit = Math.max(1, Number(paginationData.limit || requestedLimit));

      const totalBills = Math.max(0, Number(paginationData.totalBills || 0));

      const totalPages = Math.max(
        1,
        Number(paginationData.totalPages || Math.ceil(totalBills / limit) || 1)
      );

      return {
        page,
        limit,
        totalBills,
        totalPages,
        hasPreviousPage:
          typeof paginationData.hasPreviousPage === 'boolean'
            ? paginationData.hasPreviousPage
            : page > 1,
        hasNextPage:
          typeof paginationData.hasNextPage === 'boolean'
            ? paginationData.hasNextPage
            : page < totalPages,
      };
    },
    []
  );

  const loadFilterOptions = useCallback(async () => {
    if (!canViewPayBills) return;

    try {
      setFilterOptionsLoading(true);

      let cachedSuppliers = null;
      let cachedParties = null;

      try {
        cachedSuppliers = JSON.parse(localStorage.getItem('suppliers') || 'null');

        cachedParties = JSON.parse(localStorage.getItem('purchase_parties') || 'null');
      } catch (cacheError) {
        console.warn('⚠️ Invalid Pay Bill filter cache:', cacheError.message);
      }

      if (Array.isArray(cachedSuppliers)) {
        setSuppliers(cachedSuppliers);
      }

      if (Array.isArray(cachedParties)) {
        setParties(cachedParties);
      }

      const [supplierResult, partyResult] = await Promise.allSettled([
        fetchSuppliers(),
        fetchPurchaseParties(),
      ]);

      if (supplierResult.status === 'fulfilled') {
        const safeSuppliers = Array.isArray(supplierResult.value) ? supplierResult.value : [];

        setSuppliers(safeSuppliers);

        localStorage.setItem('suppliers', JSON.stringify(safeSuppliers));
      } else {
        console.error(
          '❌ Failed to load suppliers:',
          supplierResult.reason?.message || supplierResult.reason
        );
      }

      if (partyResult.status === 'fulfilled') {
        const safeParties = Array.isArray(partyResult.value) ? partyResult.value : [];

        setParties(safeParties);

        localStorage.setItem('purchase_parties', JSON.stringify(safeParties));
      } else {
        console.error(
          '❌ Failed to load purchase parties:',
          partyResult.reason?.message || partyResult.reason
        );
      }
    } catch (error) {
      console.error('❌ Failed to load Pay Bill filters:', error.message);
    } finally {
      setFilterOptionsLoading(false);
    }
  }, [canViewPayBills]);

  const loadBills = useCallback(
    async ({ page = 1, limit = pagination.limit, showLoader = true } = {}) => {
      if (!canViewPayBills) {
        navigate('/dashboard');
        return;
      }

      const currentRequestId = requestIdRef.current + 1;

      requestIdRef.current = currentRequestId;

      try {
        if (showLoader) {
          setLoading(true);
        }

        const response = await getAllPayBills({
          page,
          limit,
          search: debouncedSearch,
          supplier: filters.supplier,
          paymentType: filters.paymentType,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
        });

        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        const safeBills = Array.isArray(response)
          ? response
          : Array.isArray(response?.bills)
            ? response.bills
            : [];

        const nextPagination = normalisePagination(
          response?.pagination,
          page,
          limit,
          safeBills.length
        );

        setBills(safeBills);
        setPagination(nextPagination);
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        console.error('❌ Failed to fetch Pay Bills:', error.message);

        setBills([]);

        alert(t('alerts.payBillLoadFailed'));
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      canViewPayBills,
      navigate,
      pagination.limit,
      debouncedSearch,
      filters.supplier,
      filters.paymentType,
      filters.fromDate,
      filters.toDate,
      normalisePagination,
    ]
  );

  useEffect(() => {
    const searchTimer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 450);

    return () => {
      window.clearTimeout(searchTimer);
    };
  }, [filters.search]);

  useEffect(() => {
    if (!canViewPayBills) {
      navigate('/dashboard');
      return;
    }

    loadFilterOptions();
  }, [canViewPayBills, navigate, loadFilterOptions]);

  useEffect(() => {
    if (!canViewPayBills) return;

    loadBills({
      page: 1,
      limit: pagination.limit,
    });

    // صرف filters بدلنے پر نئی request چلانی ہے
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canViewPayBills,
    debouncedSearch,
    filters.supplier,
    filters.paymentType,
    filters.fromDate,
    filters.toDate,
  ]);

  const handleFilterChange = useCallback((fieldName, value) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      [fieldName]: value,
    }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedSearch('');
  }, []);

  const handleLimitChange = useCallback(
    (event) => {
      const newLimit = Math.max(1, Number(event.target.value || 20));

      setPagination((previousPagination) => ({
        ...previousPagination,
        page: 1,
        limit: newLimit,
      }));

      loadBills({
        page: 1,
        limit: newLimit,
      });
    },
    [loadBills]
  );

  const handlePageChange = useCallback(
    (newPage) => {
      const pageNumber = Number(newPage);

      if (
        loading ||
        pageNumber < 1 ||
        pageNumber > pagination.totalPages ||
        pageNumber === pagination.page
      ) {
        return;
      }

      loadBills({
        page: pageNumber,
        limit: pagination.limit,
      });
    },
    [loading, pagination.page, pagination.limit, pagination.totalPages, loadBills]
  );

  const handleDelete = useCallback(
    async (id) => {
      if (!canDeletePayBills) {
        alert('You do not have permission to delete pay bills');
        return;
      }

      const confirmed = window.confirm(t('alerts.confirmDeletePayment'));

      if (!confirmed) return;

      try {
        setDeletingId(id);

        await deletePayBill(id);

        const remainingRecordsOnPage = bills.filter((bill) => bill._id !== id).length;

        const targetPage =
          remainingRecordsOnPage === 0 && pagination.page > 1
            ? pagination.page - 1
            : pagination.page;

        await loadBills({
          page: targetPage,
          limit: pagination.limit,
          showLoader: false,
        });
      } catch (error) {
        console.error('❌ Failed to delete Pay Bill:', error.message);

        alert(t('alerts.deletePaymentFailed'));
      } finally {
        setDeletingId('');
      }
    },
    [canDeletePayBills, bills, pagination.page, pagination.limit, loadBills]
  );

  const visiblePageNumbers = useMemo(() => {
    const totalPages = Math.max(1, pagination.totalPages);

    const currentPage = Math.max(1, pagination.page);

    let startPage = Math.max(1, currentPage - 2);

    let endPage = Math.min(totalPages, startPage + 4);

    startPage = Math.max(1, endPage - 4);

    return Array.from(
      {
        length: endPage - startPage + 1,
      },
      (_, index) => startPage + index
    );
  }, [pagination.page, pagination.totalPages]);

  const firstRecord = useMemo(() => {
    if (pagination.totalBills === 0) return 0;

    return (pagination.page - 1) * pagination.limit + 1;
  }, [pagination.page, pagination.limit, pagination.totalBills]);

  const lastRecord = useMemo(() => {
    return Math.min(pagination.page * pagination.limit, pagination.totalBills);
  }, [pagination.page, pagination.limit, pagination.totalBills]);

  return (
    <div className="p-3 md:p-4 bg-white shadow rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{t('payment.payBillList')}</h2>

          <p className="text-xs text-gray-500 mt-1">
            {pagination.totalBills > 0
              ? `${firstRecord}-${lastRecord} / ${pagination.totalBills}`
              : `0 ${t('common.records') || 'records'}`}
          </p>
        </div>

        {canCreatePayBills && (
          <button
            type="button"
            onClick={() => navigate('/pay-bills/new')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition"
          >
            + {t('payment.new')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.supplier}
          disabled={filterOptionsLoading}
          onChange={(event) => handleFilterChange('supplier', event.target.value)}
          className="border border-gray-300 rounded-lg p-2 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <option value="">{filterOptionsLoading ? 'Loading...' : 'Suppliers / Parties'}</option>

          {suppliers.map((supplier) => (
            <option key={`supplier-${supplier._id}`} value={supplier._id}>
              {supplier.name}
            </option>
          ))}

          {parties.map((party) => (
            <option key={`party-${party._id}`} value={party._id}>
              {party.name} 🟣 Party
            </option>
          ))}
        </select>

        <select
          value={filters.paymentType}
          onChange={(event) => handleFilterChange('paymentType', event.target.value)}
          className="border border-gray-300 rounded-lg p-2 bg-white"
        >
          <option value="">{t('payment.allTypes')}</option>

          <option value="cash">{t('payment.cash')}</option>

          <option value="online">{t('payment.online')}</option>

          <option value="cheque">{t('payment.cheque')}</option>
        </select>

        <input
          type="date"
          value={filters.fromDate}
          onChange={(event) => handleFilterChange('fromDate', event.target.value)}
          className="border border-gray-300 rounded-lg p-2"
          title="From date"
        />

        <input
          type="date"
          value={filters.toDate}
          min={filters.fromDate || undefined}
          onChange={(event) => handleFilterChange('toDate', event.target.value)}
          className="border border-gray-300 rounded-lg p-2"
          title="To date"
        />

        <input
          type="text"
          value={filters.search}
          onChange={(event) => handleFilterChange('search', event.target.value)}
          placeholder={`${t('search')} (Bill No)`}
          className="border border-gray-300 rounded-lg p-2"
        />

        <button
          type="button"
          onClick={handleClearFilters}
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded-lg transition"
        >
          {t('reset')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Rows:</span>

          <select
            value={pagination.limit}
            onChange={handleLimitChange}
            disabled={loading}
            className="border border-gray-300 rounded-lg px-2 py-1 bg-white disabled:bg-gray-100"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {loading && (
          <div className="text-sm text-blue-600 font-medium">⏳ {t('loading') || 'Loading...'}</div>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full min-w-[950px] text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border-b border-r border-gray-200 p-2 whitespace-nowrap">
                {t('common.date')}
              </th>

              <th className="border-b border-r border-gray-200 p-2 whitespace-nowrap">Bill No</th>

              <th className="border-b border-r border-gray-200 p-2">{t('supplier.supplier')}</th>

              <th className="border-b border-r border-gray-200 p-2 whitespace-nowrap">
                {t('ledger.paymentType')}
              </th>

              <th className="border-b border-r border-gray-200 p-2">{t('account')}</th>

              <th className="border-b border-r border-gray-200 p-2 whitespace-nowrap">
                {t('common.amount')}
              </th>

              <th className="border-b border-r border-gray-200 p-2">{t('common.description')}</th>

              <th className="border-b border-gray-200 p-2 whitespace-nowrap">
                {t('common.actions')}
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              bills.map((bill) => (
                <tr key={bill._id} className="text-center hover:bg-blue-50 transition">
                  <td className="border-b border-r border-gray-200 p-2 whitespace-nowrap">
                    {bill.date ? dayjs(bill.date).format('YYYY-MM-DD') : '-'}
                  </td>

                  <td className="border-b border-r border-gray-200 p-2 whitespace-nowrap">
                    {bill.billNo || '-'}
                  </td>

                  <td className="border-b border-r border-gray-200 p-2">
                    {getSupplierOrPartyName(bill)}
                  </td>

                  <td className="border-b border-r border-gray-200 p-2 capitalize">
                    {getPaymentTypes(bill)}
                  </td>

                  <td className="border-b border-r border-gray-200 p-2">{getAccountNames(bill)}</td>

                  <td className="border-b border-r border-gray-200 p-2 text-right font-medium whitespace-nowrap">
                    {getBillTotal(bill).toFixed(2)}
                  </td>

                  <td className="border-b border-r border-gray-200 p-2 text-left">
                    {bill.description || '-'}
                  </td>

                  <td className="border-b border-gray-200 p-2">
                    <div className="flex items-center justify-center gap-2">
                      {canEditPayBills && (
                        <button
                          type="button"
                          onClick={() => navigate(`/pay-bills/edit/${bill._id}`)}
                          className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-2 py-1 rounded transition"
                        >
                          {t('common.edit')}
                        </button>
                      )}

                      {canDeletePayBills && (
                        <button
                          type="button"
                          disabled={deletingId === bill._id}
                          onClick={() => handleDelete(bill._id)}
                          className={`bg-red-600 text-white px-2 py-1 rounded transition ${
                            deletingId === bill._id
                              ? 'opacity-60 cursor-not-allowed'
                              : 'hover:bg-red-700'
                          }`}
                        >
                          {deletingId === bill._id ? '...' : t('common.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {loading && (
              <tr>
                <td colSpan="8" className="text-center p-8 text-gray-500">
                  ⏳ {t('loading') || 'Loading...'}
                </td>
              </tr>
            )}

            {!loading && bills.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center p-8 text-gray-500">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <div className="text-sm text-gray-600">
            Page {pagination.page} / {pagination.totalPages}
          </div>

          <div className="flex items-center justify-center flex-wrap gap-1">
            <button
              type="button"
              disabled={!pagination.hasPreviousPage || loading}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="border border-gray-300 bg-white hover:bg-gray-100 px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>

            {visiblePageNumbers.map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                disabled={loading}
                onClick={() => handlePageChange(pageNumber)}
                className={`border px-3 py-1 rounded transition ${
                  pageNumber === pagination.page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-300 hover:bg-gray-100'
                }`}
              >
                {pageNumber}
              </button>
            ))}

            <button
              type="button"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="border border-gray-300 bg-white hover:bg-gray-100 px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayBillList;
