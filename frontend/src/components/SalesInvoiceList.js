import React, { useEffect, useState } from 'react';
import { getInvoices, deleteInvoice } from '../services/salesService';
import { useNavigate } from 'react-router-dom';

const SalesInvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const token = localStorage.getItem('token');
      const data = await getInvoices(token);
      setInvoices(data);
    } catch (err) {
      alert('❌ Error fetching invoices: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this invoice?')) {
      const token = localStorage.getItem('token');
      await deleteInvoice(id, token);
      fetchInvoices();
    }
  };

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchesSearch =
      inv.customerName?.toLowerCase().includes(q) || inv.billNo?.toString().includes(q);

    const matchesStatus = !statusFilter || inv.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">📦 Sales Invoice List</h2>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => navigate('/sales')}
        >
          + New Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by customer or bill no"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border p-2"
        >
          <option value="">All Status</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Bill No</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Customer</th>
              <th className="border p-2">Total</th>
              <th className="border p-2">Paid</th>
              <th className="border p-2">Balance</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv._id}>
                <td className="border p-2">{inv.billNo}</td>
                <td className="border p-2">
                  {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}
                </td>
                <td className="border p-2">{inv.customerName || '-'}</td>
                <td className="border p-2 text-right">
                  Rs. {inv.totalAmount?.toFixed(2) || '0.00'}
                </td>
                <td className="border p-2 text-right">
                  Rs. {inv.paidAmount?.toFixed(2) || '0.00'}
                </td>
                <td className="border p-2 text-right">
                  Rs. {(inv.totalAmount - inv.paidAmount)?.toFixed(2)}
                </td>
                <td className="border p-2">{inv.status || 'Unpaid'}</td>
                <td className="border p-2 flex gap-2">
                  <button
                    className="bg-yellow-400 px-2 py-1 rounded"
                    onClick={() => navigate(`/sales?invoiceId=${inv._id}`)}
                  >
                    Edit
                  </button>
                  <button
                    className="bg-red-600 text-white px-2 py-1 rounded"
                    onClick={() => handleDelete(inv._id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center p-4">
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

export default SalesInvoiceList;
