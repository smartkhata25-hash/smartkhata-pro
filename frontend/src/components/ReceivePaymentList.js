// src/components/ReceivePaymentList.js

import React, { useCallback, useEffect, useState } from 'react';
import { getAllReceivePayments, deleteReceivePayment } from '../services/receivePaymentService';
import { fetchCustomers } from '../services/customerService';
import { fetchSaleParties } from '../services/partyService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { formatBusinessDateForDisplay } from '../utils/localDateTime';

const ReceivePaymentList = () => {
  const navigate = useNavigate();

  /*
    Permissions
  */
  const canViewReceivePayments = hasPermission('receive_payments.view');
  const canCreateReceivePayments = hasPermission('receive_payments.create');
  const canEditReceivePayments = hasPermission('receive_payments.edit');
  const canDeleteReceivePayments = hasPermission('receive_payments.delete');

  /*
    Main Data
  */
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);

  /*
    Loading اور Error
  */
  const [loading, setLoading] = useState(false);
  const [dropdownLoading, setDropdownLoading] = useState(false);

  /*
    Filters
  */
  const [filters, setFilters] = useState({
    customer: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  /*
    Search Debounce
  */
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /*
    Pagination
  */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPayments: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  /*
    Payment Total
  */
  const getPaymentTotal = useCallback((payment) => {
    if (Array.isArray(payment?.paymentEntries) && payment.paymentEntries.length > 0) {
      return payment.paymentEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    }

    return Number(payment?.amount || 0);
  }, []);

  /*
    Payment Types
  */
  const getPaymentTypes = useCallback((payment) => {
    if (Array.isArray(payment?.paymentEntries) && payment.paymentEntries.length > 0) {
      const types = payment.paymentEntries.map((entry) => entry.paymentType).filter(Boolean);

      if (types.length > 0) {
        return [...new Set(types)].join(', ');
      }
    }

    return payment?.paymentType || payment?.paymentMode || '-';
  }, []);

  /*
    Account Names
  */
  const getAccountNames = useCallback((payment) => {
    if (Array.isArray(payment?.paymentEntries) && payment.paymentEntries.length > 0) {
      const accountNames = payment.paymentEntries
        .map((entry) => entry?.account?.name || entry?.accountName || '')
        .filter(Boolean);

      if (accountNames.length > 0) {
        return [...new Set(accountNames)].join(', ');
      }
    }

    return payment?.account?.name || payment?.accountName || '-';
  }, []);

  /*
    Customer یا Party Name
  */
  const getPartyOrCustomerName = useCallback(
    (payment) => {
      const rawPartyId =
        typeof payment?.partyId === 'object' ? payment?.partyId?._id : payment?.partyId;

      if (rawPartyId) {
        const populatedPartyName =
          typeof payment?.partyId === 'object' ? payment?.partyId?.name : '';

        const localPartyName = parties.find(
          (party) => String(party?._id) === String(rawPartyId)
        )?.name;

        const partyName = populatedPartyName || localPartyName || payment?.customerName || '';

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      const rawCustomerId =
        typeof payment?.customer === 'object' ? payment?.customer?._id : payment?.customer;

      const populatedCustomerName =
        typeof payment?.customer === 'object' ? payment?.customer?.name : '';

      const localCustomerName = customers.find(
        (customer) => String(customer?._id) === String(rawCustomerId)
      )?.name;

      return populatedCustomerName || localCustomerName || payment?.customerName || '-';
    },
    [customers, parties]
  );

  /*
    Date Display
  */
  const formatDate = useCallback((dateValue) => {
    return formatBusinessDateForDisplay(dateValue);
  }, []);

  /*
    Error Message
  */
  const getErrorMessage = useCallback((error) => {
    return (
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Something went wrong'
    );
  }, []);

  /*
    Customers اور Parties Load کرنا
  */
  const fetchDropdownData = useCallback(async () => {
    setDropdownLoading(true);

    try {
      const [customerResponse, partyResponse] = await Promise.all([
        fetchCustomers(),
        fetchSaleParties(),
      ]);

      const customerList = Array.isArray(customerResponse)
        ? customerResponse
        : Array.isArray(customerResponse?.customers)
          ? customerResponse.customers
          : Array.isArray(customerResponse?.data)
            ? customerResponse.data
            : [];

      const partyList = Array.isArray(partyResponse)
        ? partyResponse
        : Array.isArray(partyResponse?.parties)
          ? partyResponse.parties
          : Array.isArray(partyResponse?.data)
            ? partyResponse.data
            : [];

      setCustomers(customerList);
      setParties(partyList);
    } catch (error) {
      console.error('❌ Customers / Parties Load Error:', error);

      alert(getErrorMessage(error));
    } finally {
      setDropdownLoading(false);
    }
  }, [getErrorMessage]);

  /*
    Receive Payments Load کرنا
  */
  const fetchPayments = useCallback(async () => {
    if (!canViewReceivePayments) return;

    setLoading(true);

    try {
      const response = await getAllReceivePayments({
        page,
        limit,
        search: debouncedSearch,
        customer: filters.customer,
        paymentType: filters.paymentType,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      });

      /*
        New Backend Response
      */
      if (response && Array.isArray(response.payments)) {
        const receivedPagination = response.pagination || {};

        const receivedTotalPages = Math.max(Number(receivedPagination.totalPages) || 1, 1);

        /*
          Delete یا filter کے بعد current page زیادہ ہو جائے
          تو آخری available page پر واپس جائیں
        */
        if (page > receivedTotalPages) {
          setPage(receivedTotalPages);
          return;
        }

        setPayments(response.payments);

        setPagination({
          page: Number(receivedPagination.page) || page,
          limit: Number(receivedPagination.limit) || limit,
          totalPayments: Number(receivedPagination.totalPayments) || 0,
          totalPages: receivedTotalPages,
          hasPreviousPage: receivedPagination.hasPreviousPage ?? page > 1,
          hasNextPage: receivedPagination.hasNextPage ?? page < receivedTotalPages,
        });

        return;
      }

      /*
        پرانے Backend Response کے لیے Safety
      */
      if (Array.isArray(response)) {
        setPayments(response);

        setPagination({
          page: 1,
          limit: response.length || limit,
          totalPayments: response.length,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        });

        return;
      }

      setPayments([]);

      setPagination({
        page: 1,
        limit,
        totalPayments: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    } catch (error) {
      console.error('❌ Receive Payments Load Error:', error);

      setPayments([]);

      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [
    canViewReceivePayments,
    page,
    limit,
    debouncedSearch,
    filters.customer,
    filters.paymentType,
    filters.fromDate,
    filters.toDate,
    getErrorMessage,
  ]);

  /*
    Permission Check
  */
  useEffect(() => {
    if (!canViewReceivePayments) {
      navigate('/dashboard', {
        replace: true,
      });
    }
  }, [canViewReceivePayments, navigate]);

  /*
    Dropdowns صرف ایک بار Load ہوں گے
  */
  useEffect(() => {
    if (!canViewReceivePayments) return;

    fetchDropdownData();
  }, [canViewReceivePayments, fetchDropdownData]);

  /*
    Search Debounce
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters.search]);

  /*
    Payments Filters یا Page کے مطابق Load ہوں گی
  */
  useEffect(() => {
    if (!canViewReceivePayments) return;

    fetchPayments();
  }, [canViewReceivePayments, fetchPayments]);

  /*
    Filter Change
  */
  const handleFilterChange = (field, value) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      [field]: value,
    }));

    if (field !== 'search') {
      setPage(1);
    }
  };

  /*
    Clear Filters
  */
  const handleClearFilters = () => {
    setFilters({
      customer: '',
      paymentType: '',
      search: '',
      fromDate: '',
      toDate: '',
    });

    setDebouncedSearch('');
    setPage(1);
  };

  /*
    Delete Receive Payment
  */
  const handleDelete = async (id) => {
    if (!canDeleteReceivePayments) {
      alert('You do not have permission to delete receive payments');
      return;
    }

    const confirmed = window.confirm(t('alerts.confirmDeletePayment'));

    if (!confirmed) return;

    try {
      await deleteReceivePayment(id);

      /*
        Page کی آخری item delete ہو جائے
        تو previous page پر جائیں
      */
      if (payments.length === 1 && page > 1) {
        setPage((previousPage) => Math.max(previousPage - 1, 1));
      } else {
        await fetchPayments();
      }
    } catch (error) {
      alert(`${t('alerts.deletePaymentFailed')}: ${getErrorMessage(error)}`);
    }
  };

  /*
    Previous Page
  */
  const handlePreviousPage = () => {
    if (loading || page <= 1) return;

    setPage((previousPage) => Math.max(previousPage - 1, 1));
  };

  /*
    Next Page
  */
  const handleNextPage = () => {
    if (loading || page >= pagination.totalPages) {
      return;
    }

    setPage((previousPage) => Math.min(previousPage + 1, pagination.totalPages));
  };

  /*
    Page Numbers
  */
  const getPageNumbers = () => {
    const totalPages = Math.max(pagination.totalPages || 1, 1);

    const visiblePages = 5;
    let startPage = Math.max(page - Math.floor(visiblePages / 2), 1);

    let endPage = Math.min(startPage + visiblePages - 1, totalPages);

    if (endPage - startPage + 1 < visiblePages) {
      startPage = Math.max(endPage - visiblePages + 1, 1);
    }

    const pageNumbers = [];

    for (let currentPage = startPage; currentPage <= endPage; currentPage += 1) {
      pageNumbers.push(currentPage);
    }

    return pageNumbers;
  };

  const hasActiveFilters =
    filters.customer || filters.paymentType || filters.search || filters.fromDate || filters.toDate;

  if (!canViewReceivePayments) {
    return null;
  }

  return (
    <div className="p-4 bg-white shadow rounded">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold">{t('payment.payments')}</h2>

          <p className="text-sm text-gray-500 mt-1">Total: {pagination.totalPayments}</p>
        </div>

        {canCreateReceivePayments && (
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={() => navigate('/receive-payments/new')}
          >
            {t('payment.new')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        {/* Customer / Party */}
        <select
          value={filters.customer}
          onChange={(event) => handleFilterChange('customer', event.target.value)}
          disabled={dropdownLoading}
          className="border rounded p-2 bg-white disabled:bg-gray-100"
        >
          <option value="">Customers / Parties</option>

          {customers.map((customer) => (
            <option key={`customer-${customer._id}`} value={customer._id}>
              {customer.name}
            </option>
          ))}

          {parties.map((party) => (
            <option key={`party-${party._id}`} value={party._id}>
              {party.name} 🟣 Party
            </option>
          ))}
        </select>

        {/* Payment Type */}
        <select
          value={filters.paymentType}
          onChange={(event) => handleFilterChange('paymentType', event.target.value)}
          className="border rounded p-2 bg-white"
        >
          <option value="">{t('payment.allTypes')}</option>

          <option value="cash">{t('payment.cash')}</option>

          <option value="online">{t('payment.online')}</option>

          <option value="cheque">{t('payment.cheque')}</option>
        </select>

        {/* From Date */}
        <input
          type="date"
          value={filters.fromDate}
          onChange={(event) => handleFilterChange('fromDate', event.target.value)}
          className="border rounded p-2"
        />

        {/* To Date */}
        <input
          type="date"
          value={filters.toDate}
          onChange={(event) => handleFilterChange('toDate', event.target.value)}
          className="border rounded p-2"
        />

        {/* Search */}
        <input
          type="text"
          value={filters.search}
          onChange={(event) => handleFilterChange('search', event.target.value)}
          placeholder={t('search')}
          className="border rounded p-2"
        />

        {/* Clear Filters */}
        <button
          type="button"
          onClick={handleClearFilters}
          disabled={!hasActiveFilters || loading}
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear Filters
        </button>
      </div>

      {/* Page Limit */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Show</span>

          <select
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="border rounded px-2 py-1 bg-white"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <span className="text-sm text-gray-600">records</span>
        </div>

        <div className="text-sm text-gray-600">
          Page {pagination.page || page} of {pagination.totalPages || 1}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('date')}</th>

              <th className="border p-2">{t('customer')}</th>

              <th className="border p-2">{t('expense.paymentMode')}</th>

              <th className="border p-2">{t('account')}</th>

              <th className="border p-2">{t('amount')}</th>

              <th className="border p-2">{t('description')}</th>

              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {/* Loading */}
            {loading && (
              <tr>
                <td colSpan="7" className="text-center p-6 text-gray-500">
                  Loading...
                </td>
              </tr>
            )}

            {/* Records */}
            {!loading &&
              payments.map((payment) => (
                <tr key={payment._id} className="text-center hover:bg-gray-50">
                  <td className="border p-2 whitespace-nowrap">{formatDate(payment.date)}</td>

                  <td className="border p-2">{getPartyOrCustomerName(payment)}</td>

                  <td className="border p-2 capitalize">{getPaymentTypes(payment)}</td>

                  <td className="border p-2">{getAccountNames(payment)}</td>

                  <td className="border p-2 text-center whitespace-nowrap">
                    {getPaymentTotal(payment).toFixed(2)}
                  </td>

                  <td className="border p-2">{payment.description || '-'}</td>

                  <td className="border p-2">
                    <div className="flex gap-2 justify-center">
                      {canEditReceivePayments && (
                        <button
                          type="button"
                          className="bg-yellow-400 hover:bg-yellow-500 px-2 py-1 rounded"
                          onClick={() => navigate(`/receive-payments/edit/${payment._id}`)}
                        >
                          {t('edit')}
                        </button>
                      )}

                      {canDeleteReceivePayments && (
                        <button
                          type="button"
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
                          onClick={() => handleDelete(payment._id)}
                        >
                          {t('delete')}
                        </button>
                      )}

                      {!canEditReceivePayments && !canDeleteReceivePayments && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {/* No Records */}
            {!loading && payments.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-6 text-gray-500">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && pagination.totalPayments > 0 && (
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mt-4">
          <div className="text-sm text-gray-600">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, pagination.totalPayments)}{' '}
            of {pagination.totalPayments}
          </div>

          <div className="flex flex-wrap justify-center items-center gap-2">
            {/* Previous */}
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={page <= 1 || !pagination.hasPreviousPage}
              className="border px-3 py-1 rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            {/* First Page */}
            {getPageNumbers()[0] > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  className="border px-3 py-1 rounded bg-white hover:bg-gray-100"
                >
                  1
                </button>

                {getPageNumbers()[0] > 2 && <span className="px-1">...</span>}
              </>
            )}

            {/* Page Numbers */}
            {getPageNumbers().map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                className={`border px-3 py-1 rounded ${
                  pageNumber === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-gray-100'
                }`}
              >
                {pageNumber}
              </button>
            ))}

            {/* Last Page */}
            {getPageNumbers()[getPageNumbers().length - 1] < pagination.totalPages && (
              <>
                {getPageNumbers()[getPageNumbers().length - 1] < pagination.totalPages - 1 && (
                  <span className="px-1">...</span>
                )}

                <button
                  type="button"
                  onClick={() => setPage(pagination.totalPages)}
                  className="border px-3 py-1 rounded bg-white hover:bg-gray-100"
                >
                  {pagination.totalPages}
                </button>
              </>
            )}

            {/* Next */}
            <button
              type="button"
              onClick={handleNextPage}
              disabled={page >= pagination.totalPages || !pagination.hasNextPage}
              className="border px-3 py-1 rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivePaymentList;
