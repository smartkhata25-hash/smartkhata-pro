import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCustomers } from '../services/customerService';
import { fetchSaleParties } from '../services/partyService';
import { getAllRefunds, deleteRefund } from '../services/refundService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import { formatBusinessDateForDisplay } from '../utils/localDateTime';
import { FaEdit, FaTrash } from 'react-icons/fa';

const RefundInvoiceList = () => {
  const [refunds, setRefunds] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    customer: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const [currentPage, setCurrentPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalRefunds: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const itemsPerPage = 10;

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const canViewRefunds = hasPermission('refunds.view');
  const canCreateRefunds = hasPermission('refunds.create');
  const canEditRefunds = hasPermission('refunds.edit');
  const canDeleteRefunds = hasPermission('refunds.delete');

  // ✅ List میں محفوظ customer/party name دکھانے کے لیے
  const getCustomerOrPartyName = useCallback((refund) => {
    if (refund.partyId) {
      return refund.customerName ? `${refund.customerName} 🟣 Party` : '-';
    }

    return refund.customerName || '-';
  }, []);

  // ✅ Customer اور Party filter options صرف ایک بار load ہوں گے
  const fetchFilterOptions = useCallback(async () => {
    try {
      const [customerData, partyData] = await Promise.all([
        fetchCustomers(token),
        fetchSaleParties(token),
      ]);

      setCustomers(
        Array.isArray(customerData)
          ? customerData
          : Array.isArray(customerData?.customers)
            ? customerData.customers
            : []
      );

      setParties(
        Array.isArray(partyData)
          ? partyData
          : Array.isArray(partyData?.parties)
            ? partyData.parties
            : []
      );
    } catch (err) {
      console.error('❌ Refund filter options error:', err);
    }
  }, [token]);

  // ✅ Backend pagination اور filters کے ساتھ refunds load کریں
  const fetchRefunds = useCallback(
    async (requestedPage = currentPage) => {
      try {
        setLoading(true);

        const data = await getAllRefunds(token, {
          page: requestedPage,
          limit: itemsPerPage,
          search: filters.search,
          customer: filters.customer,
          paymentType: filters.paymentType,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
        });

        setRefunds(Array.isArray(data?.refunds) ? data.refunds : []);

        setPagination(
          data?.pagination || {
            page: requestedPage,
            limit: itemsPerPage,
            totalRefunds: 0,
            totalPages: 1,
            hasPreviousPage: requestedPage > 1,
            hasNextPage: false,
          }
        );
      } catch (err) {
        console.error('❌ Refund invoices fetch error:', err.response?.data || err.message);

        setRefunds([]);

        alert(err.response?.data?.error || err.message || t('alerts.emptyServerResponse'));
      } finally {
        setLoading(false);
      }
    },
    [
      token,
      currentPage,
      filters.search,
      filters.customer,
      filters.paymentType,
      filters.fromDate,
      filters.toDate,
    ]
  );

  // ✅ Permission check اور dropdown data
  useEffect(() => {
    if (!canViewRefunds) {
      navigate('/dashboard');
      return;
    }

    fetchFilterOptions();
  }, [canViewRefunds, navigate, fetchFilterOptions]);

  // ✅ Search پر تھوڑا delay، باقی filters فوراً apply ہوں گے
  useEffect(() => {
    if (!canViewRefunds) return;

    const timer = setTimeout(() => {
      fetchRefunds(currentPage);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    canViewRefunds,
    currentPage,
    filters.search,
    filters.customer,
    filters.paymentType,
    filters.fromDate,
    filters.toDate,
    fetchRefunds,
  ]);

  const updateFilter = (name, value) => {
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));

    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      customer: '',
      paymentType: '',
      search: '',
      fromDate: '',
      toDate: '',
    });

    setCurrentPage(1);
  };

  const handleDelete = async (id) => {
    if (!canDeleteRefunds) {
      alert('You do not have permission to delete sale refunds');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeletePayment'))) {
      return;
    }

    try {
      await deleteRefund(id, token);

      // ✅ اگر موجودہ page پر صرف ایک record تھا
      // تو delete کے بعد پچھلے page پر جائیں
      if (refunds.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        await fetchRefunds(currentPage);
      }
    } catch (err) {
      console.error('❌ Delete Refund Error:', err.response?.data || err.message);

      alert(`${t('alerts.deletePaymentFailed')}: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="p-3 md:p-4 bg-white shadow rounded">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h2 className="text-base md:text-xl font-bold">{t('purchase.refundList')}</h2>

        {canCreateRefunds && (
          <button
            type="button"
            className="bg-blue-600 text-white px-3 py-2 md:px-4 rounded text-sm md:text-base"
            onClick={() => navigate('/refunds/new')}
          >
            {t('add')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 md:gap-3 mb-4">
        <select
          value={filters.customer}
          onChange={(e) => updateFilter('customer', e.target.value)}
          className="min-w-0 border rounded p-2 text-sm"
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
          onChange={(e) => updateFilter('paymentType', e.target.value)}
          className="min-w-0 border rounded p-2 text-sm"
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
          onChange={(e) => updateFilter('fromDate', e.target.value)}
          className="min-w-0 border rounded p-2 text-sm"
        />

        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => updateFilter('toDate', e.target.value)}
          className="min-w-0 border rounded p-2 text-sm"
        />

        <input
          type="text"
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          placeholder={t('search')}
          className="min-w-0 border rounded p-2 text-sm"
        />

        <button
          type="button"
          onClick={clearFilters}
          className="bg-gray-200 text-black rounded px-3 py-2 md:px-4 text-sm hover:bg-gray-300"
        >
          🧹 {t('clear')}
        </button>
      </div>

      <div className="flex justify-between items-center mb-3 text-sm text-gray-600">
        <span>Total Refunds: {pagination.totalRefunds}</span>

        {loading && <span>{t('common.loading')}</span>}
      </div>

      <div
        className="overflow-x-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table className="w-full min-w-[560px] md:min-w-0 border text-[11px] sm:text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-1.5 py-1 md:p-2">{t('date')}</th>

              <th className="border px-1.5 py-1 md:p-2">
                <span className="hidden sm:inline">{t('billNo')}</span>
                <span className="sm:hidden">Bill</span>
              </th>

              <th className="border px-1.5 py-1 md:p-2">{t('customer')}</th>

              <th className="border px-1.5 py-1 md:p-2">
                <span className="hidden sm:inline">{t('amount')}</span>
                <span className="sm:hidden">Amt.</span>
              </th>

              <th className="border px-1.5 py-1 md:p-2">
                <span className="hidden sm:inline">{t('paymentType')}</span>
                <span className="sm:hidden">Type</span>
              </th>

              <th className="hidden md:table-cell border p-2">{t('description')}</th>

              <th className="border px-1.5 py-1 md:p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
              refunds.map((refund) => (
                <tr key={refund._id} className="text-center">
                  <td className="border px-1.5 py-1 md:p-2 whitespace-nowrap">
                    {formatBusinessDateForDisplay(refund.invoiceDate)}
                  </td>

                  <td className="border px-1.5 py-1 md:p-2">{refund.billNo || '-'}</td>

                  <td className="border px-1.5 py-1 md:p-2 max-w-[112px] sm:max-w-none break-words">
                    {getCustomerOrPartyName(refund)}
                  </td>

                  <td className="border px-1.5 py-1 md:p-2 text-center whitespace-nowrap">
                    Rs. {Number(refund.totalAmount || 0).toFixed(2)}
                  </td>

                  <td className="border px-1.5 py-1 md:p-2 capitalize">{refund.paymentType || '-'}</td>

                  <td className="hidden md:table-cell border p-2">{refund.notes || '-'}</td>

                  <td className="border px-1.5 py-1 md:p-2">
                    <div className="flex gap-1 md:gap-2 justify-center">
                      {canEditRefunds && (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 md:h-auto md:w-auto items-center justify-center bg-yellow-400 p-0 md:px-2 md:py-1 rounded text-xs md:text-sm"
                          onClick={() => navigate(`/refunds/edit/${refund._id}`)}
                          title={t('edit')}
                          aria-label={t('edit')}
                        >
                          <FaEdit className="md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">{t('edit')}</span>
                        </button>
                      )}

                      {canDeleteRefunds && (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 md:h-auto md:w-auto items-center justify-center bg-red-600 text-white p-0 md:px-2 md:py-1 rounded text-xs md:text-sm"
                          onClick={() => handleDelete(refund._id)}
                          title={t('delete')}
                          aria-label={t('delete')}
                        >
                          <FaTrash className="md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">{t('delete')}</span>
                        </button>
                      )}

                      {!canEditRefunds && !canDeleteRefunds && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {loading && (
              <tr>
                <td colSpan="7" className="text-center p-4">
                  {t('common.loading')}
                </td>
              </tr>
            )}

            {!loading && refunds.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-4">
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
          className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
        >
          ◀️ {t('previous')}
        </button>

        <span className="px-3 py-1 text-sm">
          {t('page')} {pagination.page} {t('of')} {pagination.totalPages}
        </span>

        <button
          type="button"
          disabled={!pagination.hasNextPage || loading}
          className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setCurrentPage((prev) => prev + 1)}
        >
          {t('next')} ▶️
        </button>
      </div>
    </div>
  );
};

export default RefundInvoiceList;
