import React, { useEffect, useState } from 'react';
import { fetchSuppliers, deleteSupplier, importSuppliers } from '../services/supplierService';
import SupplierForm from '../components/SupplierForm';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';

const printStyles = `
@media print {
  .print-only { display: block !important; }
  .no-print { display: none !important; }
}
@media screen {
  .print-only { display: none !important; }
}
`;

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [showForm, setShowForm] = useState(false);

  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await fetchSuppliers({ search, type });
      setSuppliers(data);
      setSelected(null);
    } catch (err) {
      alert('❌ Failed to load suppliers.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete supplier?')) return;
    try {
      await deleteSupplier(id);
      load();
    } catch {
      alert('❌ Failed to delete supplier.');
    }
  };

  const handlePrint = () => window.print();

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Supplier List', 14, 15);
    const tableData = suppliers.map((s, idx) => [
      idx + 1,
      s.name,
      s.supplierType,
      s.email || '-',
      s.phone || '-',
      (Number(s.balance) || 0).toFixed(2),
      s.description || '-',
    ]);
    autoTable(doc, {
      head: [['#', 'Name', 'Type', 'Email', 'Phone', 'Description', 'Balance']],
      body: tableData,
      startY: 20,
    });
    doc.save('Supplier_List.pdf');
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        await importSuppliers(file);
        e.target.value = '';
        load();
      } catch {
        alert('❌ Failed to import file.');
      }
    }
  };

  return (
    <div className="container mx-auto p-4">
      <style>{printStyles}</style>

      <h2 className="text-2xl font-bold mb-4 no-print">Suppliers</h2>

      <div className="mb-4 no-print">
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded flex items-center"
        >
          <span className="mr-2">➕</span> {showForm ? 'Hide Form' : 'Add Supplier'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4 no-print">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email..."
          className="border p-2 rounded flex-1 min-w-[200px]"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">All Types</option>
          <option value="vendor">Vendor</option>
          <option value="blocked">Blocked</option>
          <option value="other">Other</option>
        </select>
        <button
          onClick={() => {
            setSearch('');
            setType('');
          }}
          className="bg-gray-300 hover:bg-gray-400 px-3 py-2 rounded"
        >
          Clear
        </button>
        <button
          onClick={handleExportPDF}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded"
        >
          Export PDF
        </button>
        <button
          onClick={handlePrint}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded"
        >
          Print
        </button>
        <label className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded cursor-pointer">
          Import CSV/Excel
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden />
        </label>
      </div>

      {showForm && (
        <div className="mb-6 no-print">
          <SupplierForm selected={selected} onSuccess={load} onCancel={() => setSelected(null)} />
        </div>
      )}

      <table className="min-w-full border border-gray-300 rounded-md overflow-hidden text-sm no-print">
        <thead className="bg-gray-100 text-left text-gray-700">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Phone</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Balance</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr
              key={s._id}
              className="border-b cursor-pointer hover:bg-gray-100"
              onClick={() => navigate(`/supplier-ledger/${s._id}`)}
            >
              <td className="px-4 py-2">{s.name}</td>
              <td className="px-4 py-2">{s.phone || '-'}</td>
              <td className="px-4 py-2">{s.supplierType}</td>
              <td className="px-4 py-2">{s.email || '-'}</td>
              <td className="px-4 py-2">{s.description || '-'}</td>
              <td className="px-4 py-2">{(Number(s.balance) || 0).toFixed(2)}</td>
              <td className="px-4 py-2 space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(s);
                    setShowForm(true);
                  }}
                  className="btn-sm"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(s._id);
                  }}
                  className="btn-sm btn-danger"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {suppliers.length === 0 && (
            <tr>
              <td colSpan="7" className="text-center p-4">
                No suppliers found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Print-Only Supplier List */}
      <div className="print-only mt-10">
        <h3 className="text-xl font-semibold mb-2">📋 Supplier List</h3>
        <ul className="list-disc pl-5">
          {suppliers.map((s, idx) => (
            <li key={s._id}>
              {idx + 1}. <strong>{s.name}</strong> — {s.phone || '-'} — Rs.{' '}
              {(Number(s.balance) || 0).toFixed(2)} {s.description && <>— {s.description}</>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
