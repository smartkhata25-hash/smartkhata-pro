import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { t } from '../i18n/i18n';

const TransactionTable = ({ transactions, products, onDelete }) => {
  const [filters, setFilters] = useState({
    product: '',
    productName: '',
    fromDate: '',
    toDate: '',
  });

  const printRef = useRef();

  const filtered = transactions.filter((tx) => {
    const matchProduct = filters.product
      ? tx.productId && tx.productId._id === filters.product
      : true;

    const txDate = new Date(tx.date);
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
          <title>${t('print')}</title>
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

  const handlePDF = () => {
    const pdf = new jsPDF('p', 'mm', 'a4');

    pdf.text(t('inventory.stockHistory'), 14, 10);

    const tableColumn = [t('product'), t('type'), t('quantity'), t('date'), t('note')];

    const tableRows = [];

    filtered.forEach((tx) => {
      tableRows.push([
        tx.productId?.name || '',
        tx.type,
        tx.quantity,
        new Date(tx.date).toLocaleDateString(),
        tx.note || '-',
      ]);
    });

    autoTable(pdf, {
      head: [tableColumn],
      body: tableRows,
      startY: 15,
      styles: {
        fontSize: 9,
        halign: 'center',
      },
      headStyles: {
        fillColor: [240, 240, 240],
      },
      margin: { left: 10, right: 10 },
      pageBreak: 'auto',
    });

    pdf.save(t('inventory.stockReport') + '.pdf');
  };

  return (
    <div className="mt-6 bg-white p-4 shadow rounded">
      {/* 🔍 Filters */}
      <div className="no-print flex flex-wrap gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <input
            type="text"
            placeholder={t('inventory.searchProduct')}
            className="border rounded px-3 py-2"
            value={filters.productName || ''}
            onChange={(e) => {
              const name = e.target.value;

              const found = products.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));

              setFilters({
                ...filters,
                productName: name,
                product: found ? found._id : '',
              });
            }}
          />
        </div>

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
          onClick={() =>
            setFilters({
              product: '',
              productName: '',
              fromDate: '',
              toDate: '',
            })
          }
          className="bg-gray-400 text-white px-3 py-2 rounded"
        >
          ❌ {t('clear')}
        </button>

        <button onClick={handlePrint} className="bg-green-600 text-white px-3 py-2 rounded">
          🖨️ {t('print')}
        </button>

        <button onClick={handlePDF} className="bg-red-600 text-white px-3 py-2 rounded">
          📄 {t('pdf')}
        </button>
      </div>

      {/* 🧾 Table */}
      <div id="print-section" ref={printRef}>
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2 text-center">{t('product')}</th>

              <th className="border p-2 text-center">{t('type')}</th>

              <th className="border p-2 text-center">{t('quantity')}</th>

              <th className="border p-2 text-center">{t('date')}</th>

              <th className="border p-2 text-center">{t('note')}</th>

              <th className="border p-2 no-print text-center">{t('action')}</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-4">
                  {t('inventory.noTransactions')}
                </td>
              </tr>
            ) : (
              filtered.map((tx) => (
                <tr key={tx._id} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50">
                  <td className="border p-2 text-center">{tx.productId?.name}</td>

                  <td className="border p-2 text-center">{tx.type}</td>

                  <td className="border p-2 text-center">{tx.quantity}</td>

                  <td className="border p-2 text-center">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>

                  <td className="border p-2 text-center">{tx.note || '-'}</td>

                  <td className="border p-2 no-print text-center">
                    <button
                      onClick={() => {
                        const confirmDelete = window.confirm(t('alerts.deleteTransaction'));

                        if (confirmDelete) {
                          try {
                            onDelete(tx._id);
                          } catch (err) {
                            console.error('Delete error:', err);
                          }
                        }
                      }}
                      className="bg-red-600 text-white px-2 py-1 rounded"
                    >
                      {t('delete')}
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
