import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCustomers } from '../services/customerService';
import { getAllRefunds, deleteRefund } from '../services/refundService';
import { t } from '../i18n/i18n';

const RefundInvoiceList = () => {
  const [refunds, setRefunds] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filters, setFilters] = useState({
    customer: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchData = useCallback(async () => {
    try {
      const refundData = await getAllRefunds(token);
      const customerData = await fetchCustomers(token);
      setRefunds(refundData);
      setCustomers(customerData);
    } catch (err) {
      alert(err.message);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // ⏱️ Auto-refresh every 30 seconds
    return () => clearInterval(interval); // Cleanup
  }, [fetchData]);

  useEffect(() => {
    let result = [...refunds];

    if (filters.customer) {
      result = result.filter((r) => r.customerId === filters.customer);
    }

    if (filters.paymentType) {
      result = result.filter((r) => r.paymentType === filters.paymentType);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.billNo?.toLowerCase().includes(q) ||
          r.customerName?.toLowerCase().includes(q) ||
          r.customerPhone?.includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((r) => new Date(r.invoiceDate) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((r) => new Date(r.invoiceDate) <= new Date(filters.toDate));
    }

    setFiltered(result);
    setCurrentPage(1); // جب بھی filter change ہو، پہلی page پر چلے جائیں
  }, [filters, refunds]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;
    try {
      await deleteRefund(id, token);
      fetchData();
    } catch (err) {
      alert(t('alerts.deletePaymentFailed') + ': ' + err.message);
    }
  };

  // 🔢 Pagination logic
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const currentItems = filtered.slice(startIdx, endIdx);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('purchase.refundList')}</h2>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/refunds/new')}
        >
          {t('add')}
        </button>
      </div>

      {/* Filters + Clear Button */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.customer}
          onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('customers')}</option>
          {customers.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={filters.paymentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('payment.allTypes')}</option>
          <option value="cash">{t('purchase.cashRefund')}</option>
          <option value="credit">{t('purchase.adjustCredit')}</option>
        </select>

        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
          className="border rounded p-2"
        />

        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
          className="border rounded p-2"
        />

        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder={t('search')}
          className="border rounded p-2"
        />

        <button
          onClick={() =>
            setFilters({
              customer: '',
              paymentType: '',
              search: '',
              fromDate: '',
              toDate: '',
            })
          }
          className="bg-gray-200 text-black rounded px-4 py-2 hover:bg-gray-300"
        >
          🧹 {t('clear')}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('date')}</th>
              <th className="border p-2">{t('billNo')}</th>
              <th className="border p-2">{t('customer')}</th>
              <th className="border p-2">{t('amount')}</th>
              <th className="border p-2">{t('paymentType')}</th>
              <th className="border p-2">{t('description')}</th>
              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((r) => (
              <tr key={r._id} className="text-center">
                <td className="border p-2">{new Date(r.invoiceDate).toLocaleDateString()}</td>
                <td className="border p-2">{r.billNo}</td>
                <td className="border p-2">{r.customerName}</td>
                <td className="border p-2 text-center">{parseFloat(r.totalAmount).toFixed(2)}</td>
                <td className="border p-2 capitalize">{r.paymentType}</td>
                <td className="border p-2">{r.notes || '-'}</td>
                <td className="border p-2">
                  <div className="flex gap-2 justify-center">
                    <button
                      className="bg-yellow-400 px-2 py-1 rounded"
                      onClick={() => navigate(`/refunds/edit/${r._id}`)}
                    >
                      {t('edit')}
                    </button>
                    <button
                      className="bg-red-600 text-white px-2 py-1 rounded"
                      onClick={() => handleDelete(r._id)}
                    >
                      {t('delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {currentItems.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-4">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex justify-center gap-2 mt-4">
        <button
          disabled={currentPage === 1}
          className="px-3 py-1 border rounded"
          onClick={() => setCurrentPage((prev) => prev - 1)}
        >
          ◀️ {t('previous')}
        </button>
        <span className="px-3 py-1">
          {t('page')} {currentPage} {t('of')} {totalPages}
        </span>
        <button
          disabled={currentPage === totalPages}
          className="px-3 py-1 border rounded"
          onClick={() => setCurrentPage((prev) => prev + 1)}
        >
          {t('next')} ▶️
        </button>
      </div>
    </div>
  );
};

export default RefundInvoiceList;
