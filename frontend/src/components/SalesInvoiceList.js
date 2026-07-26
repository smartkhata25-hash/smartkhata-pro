import React, { useCallback, useEffect, useState } from 'react';
import { getInvoices, deleteInvoice } from '../services/salesService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const SalesInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
      } catch (err) {
        console.error('Invoice fetch error:', err);

        setInvoices([]);

        alert(t('alerts.fetchInvoices') + ': ' + err.message);
      } finally {
        setLoading(false);
      }
    },
    [page, search, statusFilter]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices(page);
    }, 400);

    return () => clearTimeout(timer);
  }, [page, search, statusFilter, fetchInvoices]);

  const getPartyOrCustomerName = (inv) => {
    if (inv.partyId) {
      const partyName =
        typeof inv.partyId === 'object' ? inv.partyId?.name : inv.partyName || inv.customerName;

      return partyName ? `${partyName} 🟣 Party` : inv.customerName || '-';
    }

    return inv.customerName || inv.customerId?.name || '-';
  };

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

      // اگر موجودہ صفحے پر صرف ایک Invoice تھی
      // تو Delete کے بعد پچھلے صفحے پر چلے جائیں
      if (invoices.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        // ورنہ موجودہ صفحہ دوبارہ Load کریں
        await fetchInvoices(page);
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting invoice');
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 {t('sales.invoiceList')}</h2>

        {canCreateSales && (
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => navigate('/sales')}
          >
            + {t('sales.newInvoice')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          type="text"
          placeholder={t('sales.searchInvoice')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="border p-2 rounded"
        />

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border p-2 rounded"
        >
          <option value="">{t('sales.allStatus')}</option>
          <option value="Paid">{t('sales.paid')}</option>
          <option value="Unpaid">{t('sales.unpaid')}</option>
          <option value="Partial">{t('sales.partial')}</option>
        </select>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        {t('totalInvoices')}: {pagination.totalInvoices}
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
                  <tr key={inv._id} className="text-center text-xs md:text-sm">
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
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
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
                            className="bg-yellow-400 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm"
                            onClick={() => navigate(`/create-sale?invoiceId=${inv._id}`)}
                          >
                            {t('edit')}
                          </button>
                        )}

                        {canDeleteSales && !inv.isOpening && (
                          <button
                            type="button"
                            className="bg-red-600 text-white px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm"
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
