import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getInvoices, deleteInvoice } from '../services/salesService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { formatBusinessDateForDisplay } from '../utils/localDateTime';

const SalesInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalInvoices: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const [summary, setSummary] = useState({
    totalSales: 0,
  });

  const navigate = useNavigate();

  const canCreateSales = hasPermission('sales.create');
  const canEditSales = hasPermission('sales.edit');
  const canDeleteSales = hasPermission('sales.delete');

  const fetchInvoices = useCallback(
    async (requestedPage = page) => {
      try {
        setLoading(true);

        const token = localStorage.getItem('token');

        const data = await getInvoices(token, {
          page: requestedPage,
          limit: 50,
          search,
          status: statusFilter,
          dateFilter,
          fromDate: dateFilter === 'custom' ? fromDate : '',
          toDate: dateFilter === 'custom' ? toDate : '',
        });

        setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);

        setPagination(
          data?.pagination || {
            page: requestedPage,
            limit: 50,
            totalInvoices: 0,
            totalPages: 1,
            hasPreviousPage: requestedPage > 1,
            hasNextPage: false,
          }
        );

        setSummary({
          totalSales: Number(data?.summary?.totalSales || 0),
        });
      } catch (err) {
        console.error('Invoice fetch error:', err);

        setInvoices([]);

        setPagination({
          page: requestedPage,
          limit: 50,
          totalInvoices: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        });

        setSummary({
          totalSales: 0,
        });

        alert(t('alerts.fetchInvoices') + ': ' + err.message);
      } finally {
        setLoading(false);
      }
    },
    [page, search, statusFilter, dateFilter, fromDate, toDate]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices(page);
    }, 400);

    return () => clearTimeout(timer);
  }, [page, search, statusFilter, dateFilter, fromDate, toDate, fetchInvoices]);

  const getPartyOrCustomerName = (inv) => {
    if (inv.partyId) {
      const partyName =
        typeof inv.partyId === 'object' ? inv.partyId?.name : inv.partyName || inv.customerName;

      return partyName ? `${partyName} 🟣 Party` : inv.customerName || '-';
    }

    return inv.customerName || inv.customerId?.name || '-';
  };

  const handleDateFilterChange = (value) => {
    setDateFilter(value);
    setPage(1);

    if (value !== 'custom') {
      setFromDate('');
      setToDate('');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(search || statusFilter || dateFilter || fromDate || toDate);
  }, [search, statusFilter, dateFilter, fromDate, toDate]);

  const handleDelete = async (id) => {
    if (!canDeleteSales) {
      alert('You do not have permission to delete sales invoices');
      return;
    }

    if (!window.confirm('Delete invoice?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await deleteInvoice(id, token);

      if (!res || res.error) {
        alert('Delete failed');
        return;
      }

      if (invoices.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await fetchInvoices(page);
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting invoice');
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center gap-3 mb-4">
        <h2 className="text-xl font-bold">📦 {t('sales.invoiceList')}</h2>

        {canCreateSales && (
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition whitespace-nowrap"
            onClick={() => navigate('/sales')}
          >
            + {t('sales.newInvoice')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <input
          type="text"
          placeholder={t('sales.searchInvoice')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-100"
        />

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border border-gray-300 p-2 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">{t('sales.allStatus')}</option>
          <option value="Paid">{t('sales.paid')}</option>
          <option value="Unpaid">{t('sales.unpaid')}</option>
          <option value="Partial">{t('sales.partial')}</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => handleDateFilterChange(e.target.value)}
          className="border border-gray-300 p-2 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="this_week">This Week</option>
          <option value="last_week">Last Week</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="this_year">This Year</option>
          <option value="last_year">Last Year</option>
          <option value="custom">Custom Date</option>
        </select>

        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🧹 Clear
        </button>

        <div className="border border-blue-200 bg-blue-50 rounded px-3 py-2 flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs text-gray-600 whitespace-nowrap">Total Sales</span>

          <span className="font-bold text-blue-700 truncate">
            Rs.{' '}
            {Number(summary.totalSales || 0).toLocaleString('en-PK', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {dateFilter === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 lg:max-w-2xl">
          <div>
            <div className="text-xs text-gray-500 mb-1">From Date</div>

            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-1">To Date</div>

            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full border border-gray-300 p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-center gap-3 text-sm text-gray-600 mb-3">
        <span>
          {t('totalInvoices')}: {pagination.totalInvoices}
        </span>

        {loading && <span className="text-blue-600">Loading...</span>}
      </div>

      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full border text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 md:p-2">{t('billNo')}</th>

              <th className="border px-2 py-1 md:p-2">{t('date')}</th>

              <th className="border px-2 py-1 md:p-2">{t('customer')}</th>

              <th className="hidden md:table-cell border px-2 py-1 md:p-2">{t('total')}</th>

              <th className="hidden md:table-cell border px-2 py-1 md:p-2">{t('paid')}</th>

              <th className="border px-2 py-1 md:p-2">{t('balance')}</th>

              <th className="hidden md:table-cell border px-2 py-1 md:p-2">{t('status')}</th>

              <th className="border px-2 py-1 md:p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              invoices.map((inv) => {
                const totalAmount = Number(inv.totalAmount || 0);
                const paidAmount = Number(inv.paidAmount || 0);
                const balance = totalAmount - paidAmount;

                return (
                  <tr key={inv._id} className="text-center text-xs md:text-sm hover:bg-gray-50">
                    <td className="border px-2 py-1 md:p-2">
                      <div className="flex flex-col items-center">
                        <span>{inv.billNo}</span>

                        {inv.isOpening && (
                          <span className="text-[10px] md:text-xs bg-yellow-100 text-yellow-700 px-1 rounded mt-1">
                            Opening
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="border px-2 py-1 md:p-2">
                      {formatBusinessDateForDisplay(inv.invoiceDate)}
                    </td>

                    <td className="border px-2 py-1 md:p-2">{getPartyOrCustomerName(inv)}</td>

                    <td className="hidden md:table-cell border px-2 py-1 md:p-2 text-center">
                      Rs. {totalAmount.toFixed(2)}
                    </td>

                    <td className="hidden md:table-cell border px-2 py-1 md:p-2 text-center">
                      Rs. {paidAmount.toFixed(2)}
                    </td>

                    <td className="border px-2 py-1 md:p-2 text-center">
                      Rs. {balance.toFixed(2)}
                    </td>

                    <td className="hidden md:table-cell border px-2 py-1 md:p-2">
                      {inv.isOpening ? 'Opening' : inv.status || t('sales.unpaid')}
                    </td>

                    <td className="border px-2 py-1 md:p-2">
                      <div className="flex gap-1 md:gap-2 justify-center">
                        {canEditSales && (
                          <button
                            type="button"
                            className="bg-yellow-400 hover:bg-yellow-500 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm transition"
                            onClick={() => navigate(`/create-sale?invoiceId=${inv._id}`)}
                          >
                            {t('edit')}
                          </button>
                        )}

                        {canDeleteSales && !inv.isOpening && (
                          <button
                            type="button"
                            className="bg-red-600 hover:bg-red-700 text-white px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm transition"
                            onClick={() => handleDelete(inv._id)}
                          >
                            {t('delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

            {loading && (
              <tr>
                <td colSpan="8" className="text-center p-4">
                  Loading invoices...
                </td>
              </tr>
            )}

            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center p-4">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-3 mt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!pagination.hasPreviousPage || loading}
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            className="border px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('pagination.prev')}
          </button>

          <span className="text-sm">
            {t('pagination.page')} {pagination.page} {t('pagination.of')} {pagination.totalPages}
          </span>

          <button
            type="button"
            disabled={!pagination.hasNextPage || loading}
            onClick={() => setPage((prev) => prev + 1)}
            className="border px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesInvoiceList;
