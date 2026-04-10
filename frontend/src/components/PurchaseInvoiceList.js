import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import purchaseInvoiceService from '../services/purchaseInvoiceService';
import { t } from '../i18n/i18n';

const PurchaseInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const data = await purchaseInvoiceService.getPurchaseInvoices();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      alert(t('alerts.emptyServerResponse'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await purchaseInvoiceService.deletePurchaseInvoice(id);
      fetchInvoices();
    } catch (err) {
      console.error(err);
      alert(t('alerts.deletePaymentFailed'));
    }
  };

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();

    const matchesSearch =
      inv.supplierName?.toLowerCase().includes(q) || inv.billNo?.toString().includes(q);

    const matchesStatus = !statusFilter || inv.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 {t('purchase.invoiceList')}</h2>

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/purchase-invoice')}
        >
          {t('add')}
        </button>
      </div>

      {/* 🔍 Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          type="text"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border p-2"
        >
          <option value="">{t('ledger.all')}</option>
          <option value="Paid">{t('paid')}</option>
          <option value="Unpaid">{t('remaining')}</option>
          <option value="Partial">{t('credit')}</option>
        </select>
      </div>

      {/* 📋 Table */}
      <div className="overflow-x-auto">
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
            {filtered.map((inv) => {
              const total = Number(inv.totalAmount ?? inv.grandTotal ?? 0);
              const paid = Number(inv.paidAmount ?? 0);
              const balance = total - paid;

              return (
                <tr key={inv._id} className="text-center">
                  <td className="border p-2">{inv.billNo || '-'}</td>

                  <td className="border p-2">
                    {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
                  </td>

                  <td className="border p-2">{inv.supplierName || '-'}</td>

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
                      <button
                        className="bg-yellow-400 px-2 py-1 rounded"
                        onClick={() => {
                          navigate(`/purchase-invoice/${inv._id}`);
                        }}
                      >
                        {t('edit')}
                      </button>

                      <button
                        className="bg-red-600 text-white px-2 py-1 rounded"
                        onClick={() => handleDelete(inv._id)}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center p-4">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseInvoiceList;
