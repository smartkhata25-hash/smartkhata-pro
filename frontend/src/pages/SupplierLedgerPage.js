import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSupplierLedger } from '../services/supplierService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SupplierLedgerTable from '../components/SupplierLedgerTable';
import dayjs from 'dayjs';

export default function SupplierLedgerPage() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [type, setType] = useState('');

  const ref = useRef();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchSupplierLedger(id, start, end, type);
      setSupplier(data.supplier);
      setEntries(data.entries || []);
      console.log('📦 Entries returned from backend:', data.entries);
    } catch (err) {
      console.error('❌ Failed to load ledger:', err);
      alert('Ledger load failed.');
    } finally {
      setLoading(false);
    }
  }, [id, start, end, type]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePrint = () => {
    const w = window.open('', '', 'width=800,height=600');
    w.document.write(`<html><body>${ref.current.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Supplier Ledger', 14, 15);
    doc.text(`Name: ${supplier?.name || '-'}`, 14, 25);
    doc.text(`Phone: ${supplier?.phone || '-'}`, 14, 32);
    doc.text(`Email: ${supplier?.email || '-'}`, 14, 39);
    doc.text(`Opening Balance: Rs. ${(supplier?.openingBalance || 0).toFixed(2)}`, 14, 46);

    const tableRows = entries.map((e) => [
      dayjs(e.date).format('YYYY-MM-DD'),
      dayjs(e.date).format('HH:mm'),
      e.billNo || '-',
      e.paymentType || '-',
      e.description || '-',
      e.debit?.toFixed(2) || '0.00',
      e.credit?.toFixed(2) || '0.00',
      e.attachmentType || '-',
      e.balance?.toFixed(2) || '0.00',
    ]);

    autoTable(doc, {
      head: [
        [
          'Date',
          'Time',
          'Bill No',
          'Payment',
          'Description',
          'Debit',
          'Credit',
          'Attachment',
          'Balance',
        ],
      ],
      body: tableRows,
      startY: 55,
    });

    doc.save('Supplier_Ledger.pdf');
  };

  const handleEdit = (entry) => {
    const id = entry.referenceId;

    if (!id) {
      alert('No linked invoice.');
      return;
    }

    if (entry.sourceType === 'purchase_invoice') {
      window.location.href = `/purchase-invoice?edit=true&id=${id}`;
    } else if (entry.sourceType === 'pay_bill') {
      window.location.href = `/pay-bill?edit=true&id=${id}`;
    } else {
      alert('Unknown entry type.');
    }
  };

  const handleDelete = async (entryId) => {
    console.log('📥 handleDelete received entryId:', entryId);

    if (!window.confirm('Delete this ledger entry?')) return;

    try {
      const token = localStorage.getItem('token'); // یا جہاں سے آپ token پڑھتے ہیں

      const res = await fetch(`http://localhost:5000/api/supplier-ledger/entry/${entryId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to delete');

      alert('✅ Entry deleted successfully');
      load();
    } catch (err) {
      console.error('❌ Error deleting entry:', err);
      alert('❌ Failed to delete entry.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-xl font-bold mb-2">📘 Supplier Ledger</h2>

      {supplier ? (
        <div className="mb-4 border p-4 rounded bg-gray-50">
          <p>
            <strong>Name:</strong> {supplier.name}
          </p>
          <p>
            <strong>Phone:</strong> {supplier.phone || '-'}
          </p>
          <p>
            <strong>Email:</strong> {supplier.email || '-'}
          </p>
          <p>
            <strong>Opening Balance:</strong> Rs. {(supplier.openingBalance || 0).toFixed(2)}
          </p>
        </div>
      ) : (
        <p className="text-red-500">Supplier not found.</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All Types</option>
          <option value="invoice">Invoice</option>
          <option value="payment">Payment</option>
          <option value="opening">Opening</option>
        </select>
        <button className="btn bg-blue-600 text-white" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Load'}
        </button>
        <button
          className="btn bg-gray-400 text-white"
          onClick={() => {
            setStart('');
            setEnd('');
            setType('');
            load();
          }}
          disabled={loading}
        >
          Clear Filter
        </button>
        <button className="btn btn-secondary" onClick={handlePrint}>
          🖨️ Print
        </button>
        <button className="btn btn-secondary" onClick={handleExportPDF}>
          ⬇️ Export PDF
        </button>
      </div>

      <div ref={ref}>
        <SupplierLedgerTable
          ledgerData={entries}
          openingBalance={supplier?.openingBalance || 0}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {!loading && entries.length === 0 && (
        <p className="text-gray-500 text-center mt-4">No ledger entries found.</p>
      )}
    </div>
  );
}
