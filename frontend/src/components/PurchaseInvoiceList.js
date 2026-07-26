import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const PurchaseInvoiceList = () => {
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
        console.error('Purchase invoices fetch error:', err);

        setInvoices([]);

        alert(t('alerts.emptyServerResponse'));
      } finally {
        setLoading(false);
      }
    },
    [page, search, statusFilter]
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
  }, [canViewPurchases, navigate, page, search, statusFilter, fetchInvoices]);

  const getSupplierOrPartyName = (inv) => {
    if (inv.partyId) {
      const partyName =
        typeof inv.partyId === 'object' ? inv.partyId?.name : inv.partyName || inv.supplierName;

      return partyName ? `${partyName} 🟣 Party` : inv.supplierName || '-';
    }

    return inv.supplierName || inv.supplier?.name || '-';
  };

  const handleDelete = async (id) => {
    if (!canDeletePurchases) {
      alert('You do not have permission to delete purchase invoices');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await purchaseInvoiceService.deletePurchaseInvoice(id);

      // اگر موجودہ صفحے پر صرف ایک Invoice باقی تھی
      // تو Delete کے بعد پچھلے صفحے پر جائیں
      if (invoices.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        // ورنہ یہی صفحہ دوبارہ Load کریں
        await fetchInvoices(page);
      }
    } catch (err) {
      console.error(err);
      alert(t('alerts.deletePaymentFailed'));
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 {t('purchase.invoiceList')}</h2>

        {canCreatePurchases && (
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => navigate('/purchase-invoice')}
          >
            {t('add')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          type="text"
          placeholder={t('common.search')}
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
          <option value="">{t('ledger.all')}</option>
          <option value="Paid">{t('paid')}</option>
          <option value="Unpaid">{t('remaining')}</option>
          <option value="Partial">{t('credit')}</option>
        </select>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        {t('totalInvoices')}: {pagination.totalInvoices}
      </div>

      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full border text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('billNo')}</th>

              <th className="border p-2">{t('date')}</th>

              <th className="border p-2">{t('supplier.supplier')}</th>

              <th className="border p-2">{t('total')}</th>

              <th className="hidden md:table-cell border p-2">{t('paid')}</th>

              <th className="border p-2">{t('balance')}</th>

              <th className="hidden md:table-cell border p-2">{t('backup.status')}</th>

              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              invoices.map((inv) => {
                const total = Number(inv.totalAmount ?? inv.grandTotal ?? 0);

                const paid = Number(inv.paidAmount ?? 0);
                const balance = total - paid;

                return (
                  <tr key={inv._id} className="text-center">
                    <td className="border p-2">{inv.billNo || '-'}</td>

                    <td className="border p-2">
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
                    </td>

                    <td className="border p-2">{getSupplierOrPartyName(inv)}</td>

                    <td className="border p-2 text-center">Rs. {total.toFixed(2)}</td>

                    <td className="hidden md:table-cell border p-2 text-center">
                      Rs. {paid.toFixed(2)}
                    </td>

                    <td className="border p-2 text-center">Rs. {balance.toFixed(2)}</td>

                    <td className="hidden md:table-cell border p-2">
                      {inv.status || t('remaining')}
                    </td>

                    <td className="border p-2">
                      <div className="flex gap-1 md:gap-2 justify-center">
                        {canEditPurchases && (
                          <button
                            type="button"
                            className="bg-yellow-400 px-2 py-1 rounded"
                            onClick={() => navigate(`/purchase-invoice/${inv._id}`)}
                          >
                            {t('edit')}
                          </button>
                        )}

                        {canDeletePurchases && (
                          <button
                            type="button"
                            className="bg-red-600 text-white px-2 py-1 rounded"
                            onClick={() => handleDelete(inv._id)}
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
