import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInventoryAdjustList } from '../services/inventoryService';
import { t } from '../i18n/i18n';

const InventoryAdjustListPage = () => {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    fromDate: '',
    toDate: '',
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const navigate = useNavigate();

  const loadAdjustments = async () => {
    try {
      const data = await getInventoryAdjustList();
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(err.response?.data?.message || 'Adjust list load failed');
    }
  };

  useEffect(() => {
    loadAdjustments();
  }, []);

  const filtered = useMemo(() => {
    let result = [...rows];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.adjustNo?.toLowerCase().includes(q) ||
          r.productName?.toLowerCase().includes(q) ||
          r.note?.toLowerCase().includes(q)
      );
    }

    if (filters.type) {
      result = result.filter((r) => r.type === filters.type);
    }

    if (filters.fromDate) {
      result = result.filter((r) => new Date(r.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      result = result.filter((r) => new Date(r.date) <= new Date(filters.toDate));
    }

    return result;
  }, [rows, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const currentItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  return (
    <div className="p-4 bg-white shadow rounded">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Inventory Adjust List</h2>

        <button
          onClick={() => navigate('/inventory-adjust')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + New Adjust
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <input
          type="text"
          placeholder={t('search')}
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
          className="border rounded p-2"
        />

        <select
          value={filters.type}
          onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
          className="border rounded p-2"
        >
          <option value="">All Types</option>
          <option value="ADJUST_IN">Adjust In</option>
          <option value="ADJUST_OUT">Adjust Out</option>
        </select>

        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
          className="border rounded p-2"
        />

        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
          className="border rounded p-2"
        />

        <button
          onClick={() => setFilters({ search: '', type: '', fromDate: '', toDate: '' })}
          className="bg-gray-200 text-black rounded px-4 py-2"
        >
          🧹 {t('clear')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Date</th>
              <th className="border p-2">Adjust No</th>
              <th className="border p-2">Product</th>
              <th className="border p-2">Type</th>
              <th className="border p-2">Qty</th>
              <th className="border p-2">Difference</th>
              <th className="border p-2">Note</th>
            </tr>
          </thead>

          <tbody>
            {currentItems.map((r) => (
              <tr key={r._id} className={`text-center ${r.diff > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <td className="border p-2">
                  {r.date ? new Date(r.date).toLocaleDateString() : '-'}
                </td>
                <td className="border p-2 font-semibold">{r.adjustNo}</td>
                <td className="border p-2">{r.productName}</td>
                <td className="border p-2">
                  {r.type === 'ADJUST_IN' ? 'Adjust In' : 'Adjust Out'}
                </td>
                <td className="border p-2">{r.quantity}</td>
                <td
                  className={`border p-2 font-bold ${r.diff > 0 ? 'text-green-700' : 'text-red-700'}`}
                >
                  {r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
                <td className="border p-2">{r.note}</td>
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
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          ◀️ {t('previous')}
        </button>

        <span className="px-3 py-1">
          {t('page')} {currentPage} {t('of')} {totalPages}
        </span>

        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          {t('next')} ▶️
        </button>
      </div>
    </div>
  );
};

export default InventoryAdjustListPage;
