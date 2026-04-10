import React, { useEffect, useState } from 'react';
import { getInvoices, deleteInvoice } from '../services/salesService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const SalesInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const token = localStorage.getItem('token');
      const data = await getInvoices(token);
      setInvoices(data);
    } catch (err) {
      alert(t('alerts.fetchInvoices') + ': ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('alerts.deleteInvoiceConfirm'))) {
      const token = localStorage.getItem('token');
      await deleteInvoice(id, token);
      fetchInvoices();
    }
  };

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch =
      inv.customerName?.toLowerCase().includes(q) || inv.billNo?.toString().includes(q);

    const matchesStatus = !statusFilter || inv.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 {t('sales.invoiceList')}</h2>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/sales')}
        >
          + {t('sales.newInvoice')}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          type="text"
          placeholder={t('sales.searchInvoice')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border p-2"
        >
          <option value="">{t('sales.allStatus')}</option>
          <option value="Paid">{t('sales.paid')}</option>
          <option value="Unpaid">{t('sales.unpaid')}</option>
          <option value="Partial">{t('sales.partial')}</option>
        </select>
      </div>

      {/* Table */}
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
            {filtered.map((inv) => (
              <tr key={inv._id} className="text-center text-xs md:text-sm">
                <td className="border px-2 py-1 md:p-2">{inv.billNo}</td>
                <td className="border px-2 py-1 md:p-2">
                  {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
                </td>
                <td className="border px-2 py-1 md:p-2">{inv.customerName || '-'}</td>
                <td className="hidden md:table-cell border px-2 py-1 md:p-2 text-center">
                  Rs. {inv.totalAmount?.toFixed(2) || '0.00'}
                </td>
                <td className="hidden md:table-cell border px-2 py-1 md:p-2 text-center">
                  Rs. {inv.paidAmount?.toFixed(2) || '0.00'}
                </td>
                <td className="border px-2 py-1 md:p-2 text-center">
                  Rs. {(inv.totalAmount - inv.paidAmount)?.toFixed(2)}
                </td>
                <td className="hidden md:table-cell border px-2 py-1 md:p-2">
                  {inv.status || t('sales.unpaid')}
                </td>
                <td className="border px-2 py-1 md:p-2">
                  <div className="flex gap-1 md:gap-2 justify-center">
                    <button
                      className="bg-yellow-400 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm"
                      onClick={() => navigate(`/sales?invoiceId=${inv._id}`)}
                    >
                      {t('edit')}
                    </button>
                    <button
                      className="bg-red-600 text-white px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm"
                      onClick={() => handleDelete(inv._id)}
                    >
                      {t('delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

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

export default SalesInvoiceList;
