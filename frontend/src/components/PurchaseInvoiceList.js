import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { formatBusinessDateForDisplay } from '../utils/localDateTime';
import { FaEdit, FaTrash } from 'react-icons/fa';

const PurchaseInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [dateFilter, setDateFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState({
    totalPurchases: 0,
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalInvoices: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const navigate = useNavigate();

  const canViewPurchases = hasPermission('purchases.view');
  const canCreatePurchases = hasPermission('purchases.create');
  const canEditPurchases = hasPermission('purchases.edit');
  const canDeletePurchases = hasPermission('purchases.delete');

  const fetchInvoices = useCallback(
    async (requestedPage = page) => {
      try {
        setLoading(true);

        const data = await purchaseInvoiceService.getPurchaseInvoices({
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
          totalPurchases: Number(data?.summary?.totalPurchases || 0),
        });
      } catch (err) {
        console.error('Purchase invoices fetch error:', err);

        setInvoices([]);

        setSummary({
          totalPurchases: 0,
        });

        alert(t('alerts.emptyServerResponse'));
      } finally {
        setLoading(false);
      }
    },
    [page, search, statusFilter, dateFilter, fromDate, toDate]
  );

  useEffect(() => {
    if (!canViewPurchases) {
      navigate('/dashboard');
      return;
    }

    const timer = setTimeout(() => {
      fetchInvoices(page);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    canViewPurchases,
    navigate,
    page,
    search,
    statusFilter,
    dateFilter,
    fromDate,
    toDate,
    fetchInvoices,
  ]);

  const getSupplierOrPartyName = (inv) => {
    if (inv.partyId) {
      const partyName =
        typeof inv.partyId === 'object' ? inv.partyId?.name : inv.partyName || inv.supplierName;

      return partyName ? `${partyName} 🟣 Party` : inv.supplierName || '-';
    }

    return inv.supplierName || inv.supplier?.name || '-';
  };

  const formatMobileDate = (value) => {
    if (!value) return '-';

    const raw = String(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year.slice(-2)}`;
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = String(parsed.getFullYear()).slice(-2);

      return `${day}/${month}/${year}`;
    }

    return formatBusinessDateForDisplay(value);
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
    if (!canDeletePurchases) {
      alert('You do not have permission to delete purchase invoices');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await purchaseInvoiceService.deletePurchaseInvoice(id);

      if (invoices.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await fetchInvoices(page);
      }
    } catch (err) {
      console.error(err);
      alert(t('alerts.deletePaymentFailed'));
    }
  };

  return (
    <div className="p-2 sm:p-3 md:p-4 bg-white shadow rounded min-w-0 overflow-hidden">
      <style>{`
        @media (max-width: 767px) {
          .purchase-list-mobile-control {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 40px !important;
            min-height: 40px !important;
            padding: 6px 10px !important;
            font-size: 13px !important;
            line-height: 20px !important;
            box-sizing: border-box !important;
            color: #334155 !important;
            background-color: #ffffff !important;
          }

          select.purchase-list-mobile-control {
            height: 40px !important;
            min-height: 40px !important;
            padding-top: 4px !important;
            padding-bottom: 4px !important;
            -webkit-appearance: menulist !important;
            appearance: auto !important;
          }

          select.purchase-list-mobile-control option {
            color: #0f172a !important;
            background: #ffffff !important;
            font-size: 13px !important;
          }

          .purchase-list-table {
            table-layout: fixed !important;
            width: 100% !important;
            min-width: 0 !important;
          }

          .purchase-col-bill {
            width: 19% !important;
          }

          .purchase-col-date {
            width: 21% !important;
          }

          .purchase-col-supplier {
            width: 42% !important;
          }

          .purchase-col-actions {
            width: 18% !important;
          }

          .purchase-mobile-date {
            white-space: nowrap !important;
            font-size: 10px !important;
            letter-spacing: -0.15px !important;
          }

          .purchase-mobile-supplier {
            font-size: 10px !important;
            line-height: 13px !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
          }

          .purchase-mobile-bill {
            font-size: 10px !important;
            line-height: 13px !important;
          }

          .purchase-list-table th,
          .purchase-list-table td {
            padding: 5px 3px !important;
          }
        }
      `}</style>

      {/* ================= HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h2 className="text-base md:text-xl font-bold">📦 {t('purchase.invoiceList')}</h2>

        {canCreatePurchases && (
          <button
            type="button"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 md:px-4 rounded text-sm md:text-base transition"
            onClick={() => navigate('/purchase-invoice')}
          >
            + {t('add')}
          </button>
        )}
      </div>

      {/* ================= FILTERS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <input
          type="text"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="purchase-list-mobile-control min-w-0 border border-gray-300 p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="purchase-list-mobile-control min-w-0 border border-gray-300 p-2 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">{t('ledger.all')}</option>
          <option value="Paid">{t('paid')}</option>
          <option value="Unpaid">{t('remaining')}</option>
          <option value="Partial">{t('credit')}</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => handleDateFilterChange(e.target.value)}
          className="purchase-list-mobile-control min-w-0 border border-gray-300 p-2 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
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
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px]"
        >
          🧹 {t('clear') || 'Clear'}
        </button>

        <div className="border border-blue-200 bg-blue-50 rounded px-3 py-2 min-h-[40px] flex items-center justify-between gap-2 min-w-0">
          <span className="hidden sm:inline text-xs text-gray-600 whitespace-nowrap">
            Total Purchases
          </span>

          <span className="sm:hidden text-xs text-gray-600 whitespace-nowrap">Total</span>

          <span className="font-bold text-blue-700 truncate">
            Rs.{' '}
            {Number(summary.totalPurchases || 0).toLocaleString('en-PK', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* ================= CUSTOM DATE ================= */}
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
              className="w-full border border-gray-300 p-2 rounded"
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
              className="w-full border border-gray-300 p-2 rounded"
            />
          </div>
        </div>
      )}

      {/* ================= SUMMARY ================= */}
      <div className="flex justify-between items-center text-sm text-gray-600 mb-3">
        <span>
          {t('totalInvoices')}: {pagination.totalInvoices}
        </span>

        {loading && <span className="text-blue-600">{t('common.loading')}</span>}
      </div>

      {/* ================= MOBILE TABLE ================= */}
      <div className="md:hidden w-full min-w-0 overflow-hidden">
        <table className="purchase-list-table w-full border text-[10px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="purchase-col-bill border">{t('billNo')}</th>

              <th className="purchase-col-date border">{t('date')}</th>

              <th className="purchase-col-supplier border">{t('supplier.supplier')}</th>

              <th className="purchase-col-actions border">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              invoices.map((inv) => (
                <tr key={inv._id} className="text-center hover:bg-gray-50">
                  <td className="purchase-col-bill purchase-mobile-bill border">
                    <div className="flex flex-col items-center justify-center">
                      <span>{inv.billNo || '-'}</span>

                      {inv.isOpening && (
                        <span className="text-[8px] bg-yellow-100 text-yellow-700 px-1 rounded mt-0.5">
                          Open
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="purchase-col-date purchase-mobile-date border">
                    {formatMobileDate(inv.invoiceDate)}
                  </td>

                  <td className="purchase-col-supplier purchase-mobile-supplier border">
                    {getSupplierOrPartyName(inv)}
                  </td>

                  <td className="purchase-col-actions border">
                    <div className="flex gap-1 justify-center items-center">
                      {canEditPurchases && (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center bg-yellow-400 hover:bg-yellow-500 rounded transition"
                          onClick={() => navigate(`/purchase-invoice/${inv._id}`)}
                          title={t('edit')}
                          aria-label={t('edit')}
                        >
                          <FaEdit aria-hidden="true" />
                        </button>
                      )}

                      {canDeletePurchases && !inv.isOpening && (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded transition"
                          onClick={() => handleDelete(inv._id)}
                          title={t('delete')}
                          aria-label={t('delete')}
                        >
                          <FaTrash aria-hidden="true" />
                        </button>
                      )}

                      {!canEditPurchases && !canDeletePurchases && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {loading && (
              <tr>
                <td colSpan="4" className="text-center p-4">
                  {t('common.loading')}
                </td>
              </tr>
            )}

            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center p-4">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= DESKTOP TABLE ================= */}
      <div className="hidden md:block overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-0 border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('billNo')}</th>

              <th className="border p-2">{t('date')}</th>

              <th className="border p-2">{t('supplier.supplier')}</th>

              <th className="border p-2">{t('total')}</th>

              <th className="border p-2">{t('paid')}</th>

              <th className="border p-2">{t('balance')}</th>

              <th className="border p-2">{t('backup.status')}</th>

              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              invoices.map((inv) => {
                const total = Number(inv.grandTotal ?? inv.totalAmount ?? 0);

                const paid = Number(inv.paidAmount ?? 0);

                const balance = total - paid;

                return (
                  <tr key={inv._id} className="text-center hover:bg-gray-50">
                    <td className="border p-2">
                      <div className="flex flex-col items-center">
                        <span>{inv.billNo || '-'}</span>

                        {inv.isOpening && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded mt-1">
                            Opening
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="border p-2 whitespace-nowrap">
                      {formatBusinessDateForDisplay(inv.invoiceDate)}
                    </td>

                    <td className="border p-2 break-words">{getSupplierOrPartyName(inv)}</td>

                    <td className="border p-2 text-center">Rs. {total.toFixed(2)}</td>

                    <td className="border p-2 text-center">Rs. {paid.toFixed(2)}</td>

                    <td className="border p-2 text-center whitespace-nowrap">
                      Rs. {balance.toFixed(2)}
                    </td>

                    <td className="border p-2">
                      {inv.isOpening ? 'Opening' : inv.status || t('remaining')}
                    </td>

                    <td className="border p-2">
                      <div className="flex gap-2 justify-center">
                        {canEditPurchases && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center bg-yellow-400 hover:bg-yellow-500 px-2 py-1 rounded text-sm transition"
                            onClick={() => navigate(`/purchase-invoice/${inv._id}`)}
                            title={t('edit')}
                            aria-label={t('edit')}
                          >
                            {t('edit')}
                          </button>
                        )}

                        {canDeletePurchases && !inv.isOpening && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-sm transition"
                            onClick={() => handleDelete(inv._id)}
                            title={t('delete')}
                            aria-label={t('delete')}
                          >
                            {t('delete')}
                          </button>
                        )}

                        {!canEditPurchases && !canDeletePurchases && (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

            {loading && (
              <tr>
                <td colSpan="8" className="text-center p-4">
                  {t('common.loading')}
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

      {/* ================= PAGINATION ================= */}
      <div className="flex justify-center items-center gap-2 mt-4">
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
          {t('pagination.next')}
        </button>
      </div>
    </div>
  );
};

export default PurchaseInvoiceList;
