import React, { useEffect, useState } from 'react';
import { getAllPayBills, deletePayBill } from '../services/payBillService';
import { fetchSuppliers } from '../services/supplierService';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n';

const PayBillList = () => {
  const [bills, setBills] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [filters, setFilters] = useState({
    supplier: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const billData = await getAllPayBills();
        const supplierData = await fetchSuppliers();
        setBills(billData);
        setSuppliers(supplierData);
        setFiltered(billData);
      } catch (err) {
        console.error('❌ Failed to fetch bills:', err.message);
        alert(t('alerts.payBillLoadFailed'));
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let result = [...bills];

    if (filters.supplier) {
      result = result.filter((b) => b.supplier?._id === filters.supplier);
    }

    if (filters.paymentType) {
      result = result.filter((b) => b.paymentMode?.toLowerCase() === filters.paymentType);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (b) =>
          b.description?.toLowerCase().includes(q) ||
          b.amount?.toString().includes(q) ||
          b.paymentMode?.toLowerCase().includes(q) ||
          b.supplier?.name?.toLowerCase().includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((b) => new Date(b.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((b) => new Date(b.date) <= new Date(filters.toDate));
    }

    setFiltered(result);
  }, [filters, bills]);

  const handleDelete = async (id) => {
    if (!window.confirm(t('alerts.confirmDeletePayment'))) return;
    try {
      await deletePayBill(id);
      const billData = await getAllPayBills();
      setBills(billData);
      setFiltered(billData);
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

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.supplier}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">{t('supplier.allSuppliers')}</option>
          {suppliers.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
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
          <option value="cheque">{t('payment.cheque')}</option>
          <option value="online">{t('payment.online')}</option>
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
            setFilters({ supplier: '', paymentType: '', search: '', fromDate: '', toDate: '' })
          }
          className="bg-gray-300 px-3 py-1 rounded"
        >
          {t('reset')}
        </button>
      </div>

      {/* Table */}
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
                {/* Date */}
                <td className="border p-2">{dayjs(bill.date).format('YYYY-MM-DD')}</td>

                {/* Supplier */}
                <td className="border p-2 break-all">{bill.supplier?.name || '-'}</td>

                {/* Payment Mode (cash / online / cheque) */}
                <td className="border p-2 capitalize">{bill.paymentMode || '-'}</td>

                {/* Account (Cash / Meezan Bank / JazzCash etc) */}
                <td className="border p-2">{bill.accountName || '-'}</td>

                {/* Amount */}
                <td className="border p-2">{bill.amount ?? '0.00'}</td>

                {/* Description */}
                <td className="border p-2">{bill.description || '-'}</td>

                {/* Actions */}
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
