// src/components/ReceivePaymentList.js

import React, { useEffect, useState } from 'react';
import { getAllReceivePayments, deleteReceivePayment } from '../services/receivePaymentService';
import { fetchCustomers } from '../services/customerService';
import { useNavigate } from 'react-router-dom';

const ReceivePaymentList = () => {
  const [payments, setPayments] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [filters, setFilters] = useState({
    customer: '',
    paymentType: '',
    search: '',
    fromDate: '',
    toDate: '',
  });

  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const paymentData = await getAllReceivePayments();
      const customerData = await fetchCustomers();
      setPayments(paymentData);
      setCustomers(customerData);
      setFiltered(paymentData);
    } catch (err) {
      alert('❌ Error fetching data: ' + err.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let result = [...payments];

    if (filters.customer) {
      result = result.filter((p) => p.customer?._id === filters.customer);
    }

    if (filters.paymentType) {
      result = result.filter((p) => p.paymentType === filters.paymentType);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.description?.toLowerCase().includes(q) ||
          p.amount?.toString().includes(q) ||
          p.account?.name?.toLowerCase().includes(q) ||
          p.customer?.name?.toLowerCase().includes(q)
      );
    }

    if (filters.fromDate) {
      result = result.filter((p) => new Date(p.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((p) => new Date(p.date) <= new Date(filters.toDate));
    }

    setFiltered(result);
  }, [filters, payments]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    try {
      await deleteReceivePayment(id);
      fetchData();
    } catch (err) {
      alert('❌ Failed to delete payment: ' + err.message);
    }
  };

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Receive Payment List</h2>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/receive-payments/new')}
        >
          New Payment
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <select
          value={filters.customer}
          onChange={(e) => setFilters((prev) => ({ ...prev, customer: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">All Customers</option>
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Date</th>
              <th className="border p-2">Customer</th>
              <th className="border p-2">Amount</th>
              <th className="border p-2">Type</th>
              <th className="border p-2">Account</th>
              <th className="border p-2">Description</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p._id}>
                <td className="border p-2">
                  {p.date ? new Date(p.date).toLocaleDateString() : '-'}
                </td>
                <td className="border p-2">{p.customer?.name || '-'}</td>
                <td className="border p-2 text-right">{parseFloat(p.amount).toFixed(2)}</td>
                <td className="border p-2">{p.paymentType}</td>
                <td className="border p-2">{p.account?.name || '-'}</td>
                <td className="border p-2">{p.description || '-'}</td>
                <td className="border p-2 flex gap-2">
                  <button
                    className="bg-yellow-400 px-2 py-1 rounded"
                    onClick={() => navigate(`/receive-payments/edit/${p._id}`)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-red-600 text-white px-2 py-1 rounded"
                    onClick={() => handleDelete(p._id)}
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

export default ReceivePaymentList;
