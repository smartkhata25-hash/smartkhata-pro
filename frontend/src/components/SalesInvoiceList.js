import React, { useEffect, useState } from 'react';
import { getInvoices, deleteInvoice } from '../services/salesService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const SalesInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const canCreateSales = hasPermission('sales.create');
  const canEditSales = hasPermission('sales.edit');
  const canDeleteSales = hasPermission('sales.delete');

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const token = localStorage.getItem('token');
      const data = await getInvoices(token);

      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(t('alerts.fetchInvoices') + ': ' + err.message);
    }
  };

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

      setInvoices((prev) => prev.filter((inv) => inv._id !== id));
    } catch (err) {
      console.error(err);
      alert('Error deleting invoice');
    }
  };

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();

    const displayName = getPartyOrCustomerName(inv).toLowerCase();

    const matchesSearch =
      displayName.includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.billNo?.toString().includes(q) ||
      inv.sourceType?.toLowerCase().includes(q);

    const matchesStatus = !statusFilter || inv.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 {t('sales.invoiceList')}</h2>

        {canCreateSales && (
          <button
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
            {filtered.map((inv) => {
              const totalAmount = Number(inv.totalAmount || 0);
              const paidAmount = Number(inv.paidAmount || 0);
              const balance = totalAmount - paidAmount;

              return (
                <tr key={inv._id} className="text-center text-xs md:text-sm">
                  <td className="border px-2 py-1 md:p-2">
                    <div className="flex flex-col items-center">
                      <span>{inv.billNo}</span>

                      {(inv.sourceType === 'opening_sale_invoice' || inv.isOpening) && (
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

                  <td className="border px-2 py-1 md:p-2 text-center">Rs. {balance.toFixed(2)}</td>

                  <td className="hidden md:table-cell border px-2 py-1 md:p-2">
                    {inv.isOpening || inv.sourceType === 'opening_sale_invoice'
                      ? 'Opening'
                      : inv.status || t('sales.unpaid')}
                  </td>

                  <td className="border px-2 py-1 md:p-2">
                    <div className="flex gap-1 md:gap-2 justify-center">
                      {canEditSales && (
                        <button
                          className="bg-yellow-400 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm"
                          onClick={() => navigate(`/create-sale?invoiceId=${inv._id}`)}
                        >
                          {t('edit')}
                        </button>
                      )}

                      {canDeleteSales &&
                        !inv.isOpening &&
                        inv.sourceType !== 'opening_sale_invoice' && (
                          <button
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
