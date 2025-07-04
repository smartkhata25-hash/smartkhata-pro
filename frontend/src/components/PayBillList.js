import React, { useEffect, useState } from 'react';
import { getAllPayBills, deletePayBill } from '../services/payBillService';
import { fetchSuppliers } from '../services/supplierService';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

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
        alert('Failed to load pay bills.');
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
      result = result.filter((b) => b.paymentType === filters.paymentType);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (b) =>
          b.description?.toLowerCase().includes(q) ||
          b.amount?.toString().includes(q) ||
          b.account?.name?.toLowerCase().includes(q) ||
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
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    try {
      await deletePayBill(id);
      const billData = await getAllPayBills();
      setBills(billData);
      setFiltered(billData);
    } catch (err) {
      console.error('❌ Failed to delete:', err.message);
      alert('Failed to delete payment.');
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Pay Bill List</h2>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/pay-bills/new')}
        >
          New Payment
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <select
          value={filters.supplier}
          onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">All Suppliers</option>
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
          <option value="">All Types</option>
          <option value="Cash">Cash</option>
          <option value="Cheque">Cheque</option>
          <option value="Bank">Bank</option>
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
          placeholder="Search..."
          className="border rounded p-2"
        />

        <button
          onClick={() =>
            setFilters({ supplier: '', paymentType: '', search: '', fromDate: '', toDate: '' })
          }
          className="bg-gray-300 px-3 py-1 rounded"
        >
          Reset Filters
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Date</th>
              <th className="border p-2">Supplier</th>
              <th className="border p-2">Amount</th>
              <th className="border p-2">Type</th>
              <th className="border p-2">Account</th>
              <th className="border p-2">Description</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((bill) => (
              <tr key={bill._id}>
                <td className="border p-2">{dayjs(bill.date).format('YYYY-MM-DD')}</td>
                <td className="border p-2 break-all">{bill.supplier?.name || '-'}</td>
                <td className="border p-2">{bill.amount ?? '0.00'}</td>
                <td className="border p-2">{bill.paymentType || '-'}</td>
                <td className="border p-2">{bill.account?.name || '-'}</td>
                <td className="border p-2">{bill.description || '-'}</td>
                <td className="border p-2 flex gap-2">
                  <button
                    className="bg-yellow-400 px-2 py-1 rounded"
                    onClick={() => navigate(`/pay-bills/edit/${bill._id}`)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-red-600 text-white px-2 py-1 rounded"
                    onClick={() => handleDelete(bill._id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center p-4">
                  No records found.
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
