import React, { useCallback, useEffect, useState } from 'react';
import { getAllPayBills, deletePayBill } from '../services/payBillService';
import { fetchSuppliers } from '../services/supplierService';
import { fetchPurchaseParties } from '../services/partyService';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n';

const PayBillList = () => {
  const [bills, setBills] = useState([]);
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

  const navigate = useNavigate();

  const getBillTotal = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      return bill.paymentEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    }

    return Number(bill.amount || 0);
  }, []);

  const getPaymentTypes = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      return bill.paymentEntries
        .map((e) => e.paymentType)
        .filter(Boolean)
        .join(', ');
    }

    return bill.paymentType || bill.paymentMode || '-';
  }, []);

  const getAccountNames = useCallback((bill) => {
    if (Array.isArray(bill.paymentEntries) && bill.paymentEntries.length > 0) {
      return bill.paymentEntries
        .map((e) => e.account?.name || e.accountName)
        .filter(Boolean)
        .join(', ');
    }

    return bill.account?.name || bill.accountName || '-';
  }, []);

  const getSupplierOrPartyName = useCallback(
    (bill) => {
      const partyId = typeof bill.partyId === 'object' ? bill.partyId?._id : bill.partyId;
      const supplierId = typeof bill.supplier === 'object' ? bill.supplier?._id : bill.supplier;

      if (partyId) {
        const partyName =
          bill.partyId?.name ||
          parties.find((party) => String(party._id) === String(partyId))?.name;

        return partyName ? `${partyName} 🟣 Party` : '-';
      }

      if (supplierId) {
        const supplierName =
          bill.supplier?.name ||
          suppliers.find((supplier) => String(supplier._id) === String(supplierId))?.name;

        return supplierName || '-';
      }

      return '-';
    },
    [parties, suppliers]
  );

  const fetchData = useCallback(async () => {
    try {
      const cachedBills = JSON.parse(localStorage.getItem('paybills') || 'null');
      const cachedSuppliers = JSON.parse(localStorage.getItem('suppliers') || 'null');
      const cachedParties = JSON.parse(localStorage.getItem('purchase_parties') || 'null');

      if (Array.isArray(cachedBills)) {
        setBills(cachedBills);
        setFiltered(cachedBills);
      }

      if (Array.isArray(cachedSuppliers)) {
        setSuppliers(cachedSuppliers);
      }

      if (Array.isArray(cachedParties)) {
        setParties(cachedParties);
      }

      const [billData, supplierData, partyData] = await Promise.all([
        getAllPayBills(),
        fetchSuppliers(),
        fetchPurchaseParties(),
      ]);

      const safeBills = Array.isArray(billData) ? billData : [];
      const safeSuppliers = Array.isArray(supplierData) ? supplierData : [];
      const safeParties = Array.isArray(partyData) ? partyData : [];

      setBills(safeBills);
      setFiltered(safeBills);
      setSuppliers(safeSuppliers);
      setParties(safeParties);

      localStorage.setItem('paybills', JSON.stringify(safeBills));
      localStorage.setItem('suppliers', JSON.stringify(safeSuppliers));
      localStorage.setItem('purchase_parties', JSON.stringify(safeParties));
    } catch (err) {
      console.error('❌ Failed to fetch bills:', err.message);
      alert(t('alerts.payBillLoadFailed'));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let result = [...bills];

    if (filters.supplier) {
      result = result.filter((bill) => {
        const partyId = typeof bill.partyId === 'object' ? bill.partyId?._id : bill.partyId;
        const supplierId = typeof bill.supplier === 'object' ? bill.supplier?._id : bill.supplier;

        return (
          String(supplierId || '') === String(filters.supplier) ||
          String(partyId || '') === String(filters.supplier)
        );
      });
    }

    if (filters.paymentType) {
      result = result.filter((bill) =>
        getPaymentTypes(bill).toLowerCase().includes(filters.paymentType.toLowerCase())
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      result = result.filter(
        (bill) =>
          bill.description?.toLowerCase().includes(q) ||
          getBillTotal(bill).toString().includes(q) ||
          getPaymentTypes(bill).toLowerCase().includes(q) ||
          getAccountNames(bill).toLowerCase().includes(q) ||
          getSupplierOrPartyName(bill).toLowerCase().includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((bill) => new Date(bill.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((bill) => new Date(bill.date) <= new Date(filters.toDate));
    }

    setFiltered(result);
  }, [filters, bills, getBillTotal, getPaymentTypes, getAccountNames, getSupplierOrPartyName]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;

    try {
      await deletePayBill(id);

      const billData = await getAllPayBills();
      const safeBills = Array.isArray(billData) ? billData : [];

      setBills(safeBills);
      setFiltered(safeBills);
      localStorage.setItem('paybills', JSON.stringify(safeBills));
    } catch (err) {
      console.error('❌ Failed to delete:', err.message);
      alert(t('alerts.deletePaymentFailed'));
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('payment.payBillList')}</h2>

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/pay-bills/new')}
        >
          {t('payment.new')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.supplier}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">Suppliers / Parties</option>

          {suppliers.map((s) => (
            <option key={`supplier-${s._id}`} value={s._id}>
              {s.name}
            </option>
          ))}

          {parties.map((p) => (
            <option key={`party-${p._id}`} value={p._id}>
              {p.name} 🟣 Party
            </option>
          ))}
        </select>

        <select
          value={filters.paymentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, paymentType: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('payment.allTypes')}</option>
          <option value="cash">{t('payment.cash')}</option>
          <option value="online">{t('payment.online')}</option>
          <option value="cheque">{t('payment.cheque')}</option>
          <option value="Cash">{t('payment.cash')}</option>
          <option value="Online">{t('payment.online')}</option>
          <option value="Cheque">{t('payment.cheque')}</option>
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
              supplier: '',
              paymentType: '',
              search: '',
              fromDate: '',
              toDate: '',
            })
          }
          className="bg-gray-300 px-3 py-1 rounded"
        >
          {t('reset')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">{t('common.date')}</th>
              <th className="border p-2">{t('supplier.supplier')}</th>
              <th className="border p-2">{t('ledger.paymentType')}</th>
              <th className="border p-2">{t('account')}</th>
              <th className="border p-2">{t('common.amount')}</th>
              <th className="border p-2">{t('common.description')}</th>
              <th className="border p-2">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((bill) => (
              <tr key={bill._id} className="text-center">
                <td className="border p-2">
                  {bill.date ? dayjs(bill.date).format('YYYY-MM-DD') : '-'}
                </td>

                <td className="border p-2 break-all">{getSupplierOrPartyName(bill)}</td>

                <td className="border p-2 capitalize">{getPaymentTypes(bill)}</td>

                <td className="border p-2">{getAccountNames(bill)}</td>

                <td className="border p-2">{getBillTotal(bill).toFixed(2)}</td>

                <td className="border p-2">{bill.description || '-'}</td>

                <td className="border p-2">
                  <div className="flex gap-2 justify-center">
                    <button
                      className="bg-yellow-400 px-2 py-1 rounded"
                      onClick={() => navigate(`/pay-bills/edit/${bill._id}`)}
                    >
                      {t('common.edit')}
                    </button>

                    <button
                      className="bg-red-600 text-white px-2 py-1 rounded"
                      onClick={() => handleDelete(bill._id)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-4">
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

export default PayBillList;
