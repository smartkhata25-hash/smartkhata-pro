import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCustomers } from '../services/customerService';
import { fetchSaleParties } from '../services/partyService';
import { getAllRefunds, deleteRefund } from '../services/refundService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const RefundInvoiceList = () => {
  const [refunds, setRefunds] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);

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
  const canViewRefunds = hasPermission('refunds.view');
  const canCreateRefunds = hasPermission('refunds.create');
  const canEditRefunds = hasPermission('refunds.edit');
  const canDeleteRefunds = hasPermission('refunds.delete');

  const getCustomerOrPartyName = useCallback(
    (refund) => {
      const partyId = typeof refund.partyId === 'object' ? refund.partyId?._id : refund.partyId;
      const customerId =
        typeof refund.customerId === 'object' ? refund.customerId?._id : refund.customerId;

      if (partyId) {
        const partyName =
          refund.partyId?.name ||
          parties.find((party) => String(party._id) === String(partyId))?.name ||
          refund.customerName;

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      if (customerId) {
        const customerName =
          refund.customerId?.name ||
          customers.find((customer) => String(customer._id) === String(customerId))?.name ||
          refund.customerName;

        return customerName || '-';
      }

      return refund.customerName || '-';
    },
    [customers, parties]
  );

  const fetchData = useCallback(async () => {
    try {
      const refundData = await getAllRefunds(token);
      const customerData = await fetchCustomers(token);
      const partyData = await fetchSaleParties(token);

      setRefunds(Array.isArray(refundData) ? refundData : []);
      setCustomers(Array.isArray(customerData) ? customerData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
    } catch (err) {
      alert(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (!canViewRefunds) {
      navigate('/dashboard');
      return;
    }

    fetchData();

    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, [fetchData, canViewRefunds, navigate]);

  useEffect(() => {
    let result = [...refunds];

    if (filters.customer) {
      result = result.filter((refund) => {
        const partyId = typeof refund.partyId === 'object' ? refund.partyId?._id : refund.partyId;
        const customerId =
          typeof refund.customerId === 'object' ? refund.customerId?._id : refund.customerId;

        return (
          String(customerId || '') === String(filters.customer) ||
          String(partyId || '') === String(filters.customer)
        );
      });
    }

    if (filters.paymentType) {
      result = result.filter(
        (refund) =>
          String(refund.paymentType || '').toLowerCase() ===
          String(filters.paymentType || '').toLowerCase()
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      result = result.filter(
        (refund) =>
          refund.billNo?.toLowerCase().includes(q) ||
          getCustomerOrPartyName(refund).toLowerCase().includes(q) ||
          refund.customerName?.toLowerCase().includes(q) ||
          refund.customerPhone?.includes(q) ||
          refund.notes?.toLowerCase().includes(q) ||
          String(refund.totalAmount || '').includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter(
        (refund) => new Date(refund.invoiceDate) >= new Date(filters.fromDate)
      );
    }

    if (filters.toDate) {
      result = result.filter((refund) => new Date(refund.invoiceDate) <= new Date(filters.toDate));
    }

    setFiltered(result);
    setCurrentPage(1);
  }, [filters, refunds, getCustomerOrPartyName]);

  const handleDelete = async (id) => {
    if (!canDeleteRefunds) {
      alert('You do not have permission to delete sale refunds');
      return;
    }
    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await deleteRefund(id, token);
      fetchData();
    } catch (err) {
      alert(t('alerts.deletePaymentFailed') + ': ' + err.message);
    }
  };

  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const currentItems = filtered.slice(startIdx, endIdx);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('purchase.refundList')}</h2>

        {canCreateRefunds && (
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => navigate('/refunds/new')}
          >
            {t('add')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.customer}
          onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
          className="border rounded p-2"
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

        <select
          value={filters.paymentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('payment.allTypes')}</option>
          <option value="cash">{t('purchase.cashRefund')}</option>
          <option value="credit">{t('purchase.adjustCredit')}</option>
          <option value="bank">{t('bank')}</option>
          <option value="online">{t('payment.online')}</option>
          <option value="cheque">{t('payment.cheque')}</option>
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
          type="button"
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
            {currentItems.map((refund) => (
              <tr key={refund._id} className="text-center">
                <td className="border p-2">
                  {refund.invoiceDate ? new Date(refund.invoiceDate).toLocaleDateString() : '-'}
                </td>

                <td className="border p-2">{refund.billNo || '-'}</td>

                <td className="border p-2">{getCustomerOrPartyName(refund)}</td>

                <td className="border p-2 text-center">
                  {Number(refund.totalAmount || 0).toFixed(2)}
                </td>

                <td className="border p-2 capitalize">{refund.paymentType || '-'}</td>

                <td className="border p-2">{refund.notes || '-'}</td>

                <td className="border p-2">
                  <div className="flex gap-2 justify-center">
                    {canEditRefunds && (
                      <button
                        className="bg-yellow-400 px-2 py-1 rounded"
                        onClick={() => navigate(`/refunds/edit/${refund._id}`)}
                      >
                        {t('edit')}
                      </button>
                    )}

                    {canDeleteRefunds && (
                      <button
                        className="bg-red-600 text-white px-2 py-1 rounded"
                        onClick={() => handleDelete(refund._id)}
                      >
                        {t('delete')}
                      </button>
                    )}
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

      <div className="flex justify-center gap-2 mt-4">
        <button
          type="button"
          disabled={currentPage === 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
        >
          ◀️ {t('previous')}
        </button>

        <span className="px-3 py-1">
          {t('page')} {currentPage} {t('of')} {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage === totalPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
        >
          {t('next')} ▶️
        </button>
      </div>
    </div>
  );
};

export default RefundInvoiceList;
