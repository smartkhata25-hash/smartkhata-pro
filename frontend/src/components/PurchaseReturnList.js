import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSuppliers } from '../services/supplierService';
import { fetchPurchaseParties } from '../services/partyService';
import { getAllPurchaseReturns, deletePurchaseReturn } from '../services/purchaseReturnService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const PurchaseReturnList = () => {
  const [returns, setReturns] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);

  const [filters, setFilters] = useState({
    supplier: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const canViewPurchaseReturns = hasPermission('purchase_returns.view');
  const canCreatePurchaseReturns = hasPermission('purchase_returns.create');
  const canEditPurchaseReturns = hasPermission('purchase_returns.edit');
  const canDeletePurchaseReturns = hasPermission('purchase_returns.delete');

  const getSupplierOrPartyName = useCallback(
    (row) => {
      const partyId = typeof row.partyId === 'object' ? row.partyId?._id : row.partyId;
      const supplierId = typeof row.supplierId === 'object' ? row.supplierId?._id : row.supplierId;

      if (partyId) {
        const partyName =
          row.partyId?.name ||
          parties.find((party) => String(party._id) === String(partyId))?.name ||
          row.supplierName;

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      if (supplierId) {
        const supplierName =
          row.supplierId?.name ||
          suppliers.find((supplier) => String(supplier._id) === String(supplierId))?.name ||
          row.supplierName;

        return supplierName || '-';
      }

      return row.supplierName || '-';
    },
    [parties, suppliers]
  );

  const fetchData = useCallback(async () => {
    try {
      const returnData = await getAllPurchaseReturns(token);
      const supplierData = await fetchSuppliers();
      const partyData = await fetchPurchaseParties(token);

      setReturns(Array.isArray(returnData) ? returnData : []);
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
    } catch (err) {
      alert(t('alerts.expenseLoadError') + ': ' + err.message);
    }
  }, [token]);

  useEffect(() => {
    if (!canViewPurchaseReturns) {
      navigate('/dashboard');
      return;
    }

    fetchData();

    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, [fetchData, canViewPurchaseReturns, navigate]);

  useEffect(() => {
    let result = [...returns];

    if (filters.supplier) {
      result = result.filter((row) => {
        const partyId = typeof row.partyId === 'object' ? row.partyId?._id : row.partyId;
        const supplierId =
          typeof row.supplierId === 'object' ? row.supplierId?._id : row.supplierId;

        return (
          String(supplierId || '') === String(filters.supplier) ||
          String(partyId || '') === String(filters.supplier)
        );
      });
    }

    if (filters.paymentType === 'adjust') {
      result = result.filter((row) => !row.paymentType);
    } else if (filters.paymentType) {
      result = result.filter(
        (row) =>
          String(row.paymentType || '').toLowerCase() ===
          String(filters.paymentType || '').toLowerCase()
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      result = result.filter(
        (row) =>
          row.billNo?.toLowerCase().includes(q) ||
          getSupplierOrPartyName(row).toLowerCase().includes(q) ||
          row.supplierName?.toLowerCase().includes(q) ||
          row.supplierPhone?.includes(q) ||
          row.notes?.toLowerCase().includes(q) ||
          String(row.totalAmount || '').includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((row) => new Date(row.returnDate) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((row) => new Date(row.returnDate) <= new Date(filters.toDate));
    }

    setFiltered(result);
    setCurrentPage(1);
  }, [filters, returns, getSupplierOrPartyName]);

  const handleDelete = async (id) => {
    if (!canDeletePurchaseReturns) {
      alert('You do not have permission to delete purchase returns');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await deletePurchaseReturn(id, token);
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
        <h2 className="text-xl font-bold">{t('purchase.returnList')}</h2>

        {canCreatePurchaseReturns && (
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => navigate('/purchase-returns/new')}
          >
            {t('add')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.supplier}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
          className="border rounded p-2"
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

        <select
          value={filters.paymentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('payment.allTypes')}</option>
          <option value="cash">{t('purchase.cashReceived')}</option>
          <option value="online">{t('payment.online')}</option>
          <option value="cheque">{t('payment.cheque')}</option>
          <option value="adjust">{t('purchase.adjustPayable')}</option>
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
          placeholder={t('search')}
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          className="border rounded p-2"
        />

        <button
          type="button"
          onClick={() =>
            setFilters({
              supplier: '',
              paymentType: '',
              search: '',
              fromDate: '',
              toDate: '',
            })
          }
          className="bg-gray-200 rounded px-4 py-2 hover:bg-gray-300"
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
              <th className="border p-2">{t('supplier.supplier')}</th>
              <th className="border p-2">{t('amount')}</th>
              <th className="border p-2">{t('paymentType')}</th>
              <th className="border p-2">{t('description')}</th>
              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {currentItems.map((row) => (
              <tr key={row._id} className="text-center">
                <td className="border p-2">
                  {row.returnDate ? new Date(row.returnDate).toLocaleDateString() : '-'}
                </td>

                <td className="border p-2">{row.billNo || '-'}</td>

                <td className="border p-2">{getSupplierOrPartyName(row)}</td>

                <td className="border p-2">{Number(row.totalAmount || 0).toFixed(2)}</td>

                <td className="border p-2 capitalize">{row.paymentType || 'adjust'}</td>

                <td className="border p-2">{row.notes || '-'}</td>

                <td className="border p-2">
                  <div className="flex gap-2 justify-center">
                    {canEditPurchaseReturns && (
                      <button
                        className="bg-yellow-400 px-2 py-1 rounded"
                        onClick={() => navigate(`/purchase-returns/edit/${row._id}`)}
                      >
                        {t('edit')}
                      </button>
                    )}

                    {canDeletePurchaseReturns && (
                      <button
                        className="bg-red-600 text-white px-2 py-1 rounded"
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

export default PurchaseReturnList;
