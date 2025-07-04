import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const TransactionTable = ({ transactions, products, onDelete }) => {
  const [filters, setFilters] = useState({
    product: '',
    fromDate: '',
    toDate: '',
  });

  const printRef = useRef();

  const filtered = transactions.filter((t) => {
    const matchProduct = filters.product ? t.productId._id === filters.product : true;
    const txDate = new Date(t.date);
    const from = filters.fromDate ? new Date(filters.fromDate) : null;
    const to = filters.toDate ? new Date(filters.toDate) : null;
    const matchDate = (!from || txDate >= from) && (!to || txDate <= to);
    return matchProduct && matchDate;
  });

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const newWindow = window.open('', '', 'width=900,height=600');
    newWindow.document.write(`
      <html>
        <head>
          <title>Print</title>
          <style>
            .no-print { display: none !important; }
            table { width: 100%; border-collapse: collapse; font-size: 14px; }
            th, td { border: 1px solid black; padding: 6px; text-align: center; }
            h2, h3 { margin-top: 0; }
          </style>
        </head>
        <body>
          <div>${printContent}</div>
        </body>
      </html>
    `);
    newWindow.document.close();
    newWindow.focus();
    newWindow.print();
    newWindow.close();
  };

  const handlePDF = async () => {
    const input = printRef.current;
    const canvas = await html2canvas(input, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 10, width, height);
    pdf.save('Stock_Entry_Report.pdf');
  };

  return (
    <div className="mt-6 bg-white p-4 shadow rounded">
      <h3 className="text-xl font-bold mb-4">📜 Stock Entry History</h3>

      {/* 🔍 Filters */}
      <div className="no-print flex flex-wrap gap-3 mb-4">
        <select
          value={filters.product}
          onChange={(e) => setFilters({ ...filters, product: e.target.value })}
          className="border rounded px-3 py-2"
        >
          <option value="">All Products</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.fromDate}
          onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
          className="border rounded px-3 py-2"
        />
        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
          className="border rounded px-3 py-2"
        />

        <button
          onClick={() => setFilters({ product: '', fromDate: '', toDate: '' })}
          className="bg-gray-400 text-white px-3 py-2 rounded"
        >
          ❌ Clear
        </button>
        <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-2 rounded">
          🖨️ Print
        </button>
        <button onClick={handlePDF} className="bg-red-600 text-white px-3 py-2 rounded">
          📄 Export PDF
        </button>
      </div>

      {/* 🧾 Table */}
      <div id="print-section" ref={printRef}>
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Product</th>
              <th className="border p-2">Type</th>
              <th className="border p-2">Quantity</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Note</th>
              <th className="border p-2 no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-4">
                  No transactions found.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t._id}>
                  <td className="border p-2">{t.productId?.name}</td>
                  <td className="border p-2">{t.type}</td>
                  <td className="border p-2">{t.quantity}</td>
                  <td className="border p-2">{new Date(t.date).toLocaleDateString()}</td>
                  <td className="border p-2">{t.note || '-'}</td>
                  <td className="border p-2 no-print">
                    <button
                      onClick={() => {
                        const confirmDelete = window.confirm(
                          'Are you sure you want to delete this entry?'
                        );
                        if (confirmDelete) {
                          try {
                            onDelete(t._id);
                          } catch (err) {
                            console.error('Delete error:', err);
                          }
                        }
                      }}
                      className="text-red-600 hover:underline"
                    >
                      ❌ Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionTable;
