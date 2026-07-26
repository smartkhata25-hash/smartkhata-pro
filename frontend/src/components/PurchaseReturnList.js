import React, { useCallback, useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { fetchSuppliers } from '../services/supplierService';

import { fetchPurchaseParties } from '../services/partyService';

import { getAllPurchaseReturns, deletePurchaseReturn } from '../services/purchaseReturnService';

import { t } from '../i18n/i18n';

import { hasPermission } from '../utils/permissionHelper';

const PurchaseReturnList = () => {
  // ✅ صرف موجودہ page کے Purchase Returns
  const [returns, setReturns] = useState([]);

  // ✅ Supplier اور Party dropdown data
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);

  // ✅ Loading state
  const [loading, setLoading] = useState(false);

  // ✅ Filters
  const [filters, setFilters] = useState({
    supplier: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  // ✅ Backend pagination
  const [currentPage, setCurrentPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalReturns: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const itemsPerPage = 10;

  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  // ✅ Permissions
  const canViewPurchaseReturns = hasPermission('purchase_returns.view');

  const canCreatePurchaseReturns = hasPermission('purchase_returns.create');

  const canEditPurchaseReturns = hasPermission('purchase_returns.edit');

  const canDeletePurchaseReturns = hasPermission('purchase_returns.delete');

  /* =========================================================
     ✅ SUPPLIER OR PARTY NAME
  ========================================================= */
  const getSupplierOrPartyName = useCallback((row) => {
    const partyId = typeof row.partyId === 'object' ? row.partyId?._id : row.partyId;

    if (partyId) {
      return row.supplierName ? `${row.supplierName} 🟣 Party` : '-';
    }

    return row.supplierName || '-';
  }, []);

  /* =========================================================
     ✅ LOAD SUPPLIERS AND PARTIES ONLY ONCE
  ========================================================= */
  const fetchFilterOptions = useCallback(async () => {
    try {
      const [supplierData, partyData] = await Promise.all([
        fetchSuppliers(),
        fetchPurchaseParties(token),
      ]);

      // ✅ مختلف API response shapes کو safely handle کریں
      if (Array.isArray(supplierData)) {
        setSuppliers(supplierData);
      } else if (Array.isArray(supplierData?.suppliers)) {
        setSuppliers(supplierData.suppliers);
      } else if (Array.isArray(supplierData?.data)) {
        setSuppliers(supplierData.data);
      } else {
        setSuppliers([]);
      }

      if (Array.isArray(partyData)) {
        setParties(partyData);
      } else if (Array.isArray(partyData?.parties)) {
        setParties(partyData.parties);
      } else if (Array.isArray(partyData?.data)) {
        setParties(partyData.data);
      } else {
        setParties([]);
      }
    } catch (err) {
      console.error('❌ Purchase Return filter options error:', err.response?.data || err.message);

      setSuppliers([]);
      setParties([]);
    }
  }, [token]);

  /* =========================================================
     ✅ LOAD PURCHASE RETURNS FROM BACKEND
  ========================================================= */
  const fetchReturns = useCallback(
    async (pageNumber = 1) => {
      try {
        setLoading(true);

        const response = await getAllPurchaseReturns(token, {
          page: pageNumber,
          limit: itemsPerPage,
          search: filters.search,
          supplier: filters.supplier,
          paymentType: filters.paymentType,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
        });

        // ✅ New backend response
        if (Array.isArray(response?.returns)) {
          setReturns(response.returns);
        } else {
          setReturns([]);
        }

        // ✅ Pagination response
        if (response?.pagination) {
          setPagination({
            page: Number(response.pagination.page || pageNumber),

            limit: Number(response.pagination.limit || itemsPerPage),

            totalReturns: Number(response.pagination.totalReturns || 0),

            totalPages: Math.max(Number(response.pagination.totalPages || 1), 1),

            hasPreviousPage: Boolean(response.pagination.hasPreviousPage),

            hasNextPage: Boolean(response.pagination.hasNextPage),
          });
        } else {
          setPagination({
            page: pageNumber,
            limit: itemsPerPage,
            totalReturns: 0,
            totalPages: 1,
            hasPreviousPage: pageNumber > 1,
            hasNextPage: false,
          });
        }
      } catch (err) {
        console.error('❌ Get Purchase Returns Error:', err.response?.data || err.message);

        setReturns([]);

        setPagination({
          page: pageNumber,
          limit: itemsPerPage,
          totalReturns: 0,
          totalPages: 1,
          hasPreviousPage: pageNumber > 1,
          hasNextPage: false,
        });

        alert(
          `${t('alerts.expenseLoadError')}: ${
            err.response?.data?.error || err.response?.data?.detail || err.message
          }`
        );
      } finally {
        setLoading(false);
      }
    },
    [token, filters.search, filters.supplier, filters.paymentType, filters.fromDate, filters.toDate]
  );

  /* =========================================================
     ✅ PERMISSION CHECK + LOAD DROPDOWNS
  ========================================================= */
  useEffect(() => {
    if (!canViewPurchaseReturns) {
      navigate('/dashboard');
      return;
    }

    fetchFilterOptions();
  }, [canViewPurchaseReturns, navigate, fetchFilterOptions]);

  /* =========================================================
     ✅ LOAD LIST WHEN PAGE OR FILTER CHANGES
  ========================================================= */
  useEffect(() => {
    if (!canViewPurchaseReturns) return;

    // ✅ Search typing کے دوران بار بار request سے بچاؤ
    const timer = setTimeout(() => {
      fetchReturns(currentPage);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    canViewPurchaseReturns,
    currentPage,
    filters.search,
    filters.supplier,
    filters.paymentType,
    filters.fromDate,
    filters.toDate,
    fetchReturns,
  ]);

  /* =========================================================
     ✅ UPDATE FILTER
  ========================================================= */
  const updateFilter = (field, value) => {
    setFilters((previousFilters) => ({
      ...previousFilters,
      [field]: value,
    }));

    // ✅ Filter بدلنے پر پہلے page پر جائیں
    setCurrentPage(1);
  };

  /* =========================================================
     ✅ CLEAR FILTERS
  ========================================================= */
  const clearFilters = () => {
    setFilters({
      supplier: '',
      paymentType: '',
      search: '',
      fromDate: '',
      toDate: '',
    });

    setCurrentPage(1);
  };

  /* =========================================================
     ✅ DELETE PURCHASE RETURN
  ========================================================= */
  const handleDelete = async (id) => {
    if (!canDeletePurchaseReturns) {
      alert('You do not have permission to delete purchase returns');

      return;
    }

    const confirmed = window.confirm(t('alerts.confirmDeletePayment'));

    if (!confirmed) return;

    try {
      await deletePurchaseReturn(id, token);

      // ✅ اگر page پر صرف ایک record تھا
      // تو delete کے بعد پچھلے page پر جائیں
      if (returns.length === 1 && currentPage > 1) {
        setCurrentPage((previousPage) => Math.max(1, previousPage - 1));
      } else {
        await fetchReturns(currentPage);
      }
    } catch (err) {
      console.error('❌ Delete Purchase Return Error:', err.response?.data || err.message);

      alert(
        `${t('alerts.deletePaymentFailed')}: ${
          err.response?.data?.error || err.response?.data?.detail || err.message
        }`
      );
    }
  };

  /* =========================================================
     ✅ PREVIOUS PAGE
  ========================================================= */
  const goToPreviousPage = () => {
    if (loading || !pagination.hasPreviousPage || currentPage <= 1) {
      return;
    }

    setCurrentPage((previousPage) => Math.max(1, previousPage - 1));
  };

  /* =========================================================
     ✅ NEXT PAGE
  ========================================================= */
  const goToNextPage = () => {
    if (loading || !pagination.hasNextPage) {
      return;
    }

    setCurrentPage((previousPage) => Math.min(pagination.totalPages, previousPage + 1));
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      {/* =====================================================
          HEADER
      ====================================================== */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('purchase.returnList')}</h2>

        {canCreatePurchaseReturns && (
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => navigate('/purchase-returns/new')}
          >
            {t('add')}
          </button>
        )}
      </div>

      {/* =====================================================
          FILTERS
      ====================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        {/* Supplier / Party Filter */}
        <select
          value={filters.supplier}
          onChange={(event) => updateFilter('supplier', event.target.value)}
          className="border rounded p-2 bg-white"
        >
          <option value="">Suppliers / Parties</option>

          {suppliers.map((supplier) => (
            <option key={`supplier-${supplier._id}`} value={supplier._id}>
              {supplier.name}
            </option>
          ))}

          {parties.map((party) => (
            <option key={`party-${party._id}`} value={party._id}>
              {party.name} 🟣 Party
            </option>
          ))}
        </select>

        {/* Payment Type Filter */}
        <select
          value={filters.paymentType}
          onChange={(event) => updateFilter('paymentType', event.target.value)}
          className="border rounded p-2 bg-white"
        >
          <option value="">{t('payment.allTypes')}</option>

          <option value="cash">{t('purchase.cashReceived')}</option>

          <option value="bank">{t('bank')}</option>

          <option value="online">{t('payment.online')}</option>

          <option value="cheque">{t('payment.cheque')}</option>

          <option value="adjust">{t('purchase.adjustPayable')}</option>
        </select>

        {/* From Date */}
        <input
          type="date"
          value={filters.fromDate}
          onChange={(event) => updateFilter('fromDate', event.target.value)}
          className="border rounded p-2"
        />

        {/* To Date */}
        <input
          type="date"
          value={filters.toDate}
          onChange={(event) => updateFilter('toDate', event.target.value)}
          className="border rounded p-2"
        />

        {/* Search */}
        <input
          type="text"
          placeholder={t('search')}
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
          className="border rounded p-2"
        />

        {/* Clear Filters */}
        <button
          type="button"
          onClick={clearFilters}
          className="bg-gray-200 rounded px-4 py-2 hover:bg-gray-300"
        >
          🧹 {t('clear')}
        </button>
      </div>

      {/* =====================================================
          TOTAL AND LOADING
      ====================================================== */}
      <div className="flex justify-between items-center mb-3 text-sm text-gray-600">
        <span>Total Purchase Returns: {pagination.totalReturns}</span>

        {loading && <span className="font-medium">{t('common.loading')}</span>}
      </div>

      {/* =====================================================
          TABLE
      ====================================================== */}
      <div
        className="overflow-x-auto"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('date')}</th>

              <th className="border p-2">{t('billNo')}</th>

              <th className="border p-2">{t('supplier.supplier')}</th>

              <th className="border p-2">{t('amount')}</th>

              <th className="border p-2">{t('paymentType')}</th>

              <th className="border p-2">{t('description')}</th>

              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {/* ✅ Records */}
            {!loading &&
              returns.map((row) => (
                <tr key={row._id} className="text-center">
                  <td className="border p-2 whitespace-nowrap">
                    {row.returnDate ? new Date(row.returnDate).toLocaleDateString() : '-'}
                  </td>

                  <td className="border p-2">{row.billNo || '-'}</td>

                  <td className="border p-2">{getSupplierOrPartyName(row)}</td>

                  <td className="border p-2 whitespace-nowrap">
                    {Number(row.totalAmount || 0).toFixed(2)}
                  </td>

                  <td className="border p-2 capitalize">{row.paymentType || 'adjust'}</td>

                  <td className="border p-2">{row.notes || '-'}</td>

                  <td className="border p-2">
                    <div className="flex gap-2 justify-center">
                      {canEditPurchaseReturns && (
                        <button
                          type="button"
                          className="bg-yellow-400 px-2 py-1 rounded hover:bg-yellow-500"
                          onClick={() => navigate(`/purchase-returns/edit/${row._id}`)}
                        >
                          {t('edit')}
                        </button>
                      )}

                      {canDeletePurchaseReturns && (
                        <button
                          type="button"
                          className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                          onClick={() => handleDelete(row._id)}
                        >
                          {t('delete')}
                        </button>
                      )}

                      {!canEditPurchaseReturns && !canDeletePurchaseReturns && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            {/* ✅ Loading Row */}
            {loading && (
              <tr>
                <td colSpan="7" className="text-center p-5">
                  {t('common.loading')}
                </td>
              </tr>
            )}

            {/* ✅ Empty Row */}
            {!loading && returns.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-5">
                  {t('common.noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =====================================================
          PAGINATION
      ====================================================== */}
      <div className="flex justify-center items-center gap-2 mt-4">
        <button
          type="button"
          disabled={loading || !pagination.hasPreviousPage || currentPage === 1}
          className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={goToPreviousPage}
        >
          ◀️ {t('previous')}
        </button>

        <span className="px-3 py-1 text-sm">
          {t('page')} {pagination.page} {t('of')} {pagination.totalPages}
        </span>

        <button
          type="button"
          disabled={loading || !pagination.hasNextPage || currentPage >= pagination.totalPages}
          className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={goToNextPage}
        >
          {t('next')} ▶️
        </button>
      </div>
    </div>
  );
};

export default PurchaseReturnList;
