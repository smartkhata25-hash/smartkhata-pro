import React, { useEffect, useState, useRef } from 'react';
import { fetchProductLedger } from '../services/productLedgerService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ProductLedger = ({ productId }) => {
  const [ledger, setLedger] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const tableRef = useRef();

  const loadLedger = async () => {
    const data = await fetchProductLedger(productId, startDate, endDate);
    setLedger(data);
  };

  useEffect(() => {
    if (productId) loadLedger();
    // eslint-disable-next-line
  }, [productId, startDate, endDate]);

  const handlePDF = async () => {
    const input = tableRef.current;
    const canvas = await html2canvas(input);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save('Product_Ledger.pdf');
  };

  if (!ledger) return <p>Loading...</p>;

  const { product, openingStock, purchases, sales } = ledger;

  const combined = [
    ...purchases.map((p) => ({
      type: 'Purchase',
      party: p.supplierName || 'Supplier',
      qty: p.quantity,
      rate: p.rate,
      date: new Date(p.date),
      invoiceId: p.invoiceId,
      model: 'PurchaseInvoice',
    })),
    ...sales.map((s) => ({
      type: 'Sale',
      party: s.customerName,
      qty: s.quantity,
      rate: s.price,
      date: new Date(s.date),
      invoiceId: s.invoiceId,
      model: 'Invoice',
    })),
  ].sort((a, b) => a.date - b.date);

  const filteredCombined = combined.filter((entry) =>
    entry.party.toLowerCase().includes(partySearch.toLowerCase())
  );

  const closing = combined.reduce((acc, entry) => {
    return entry.type === 'Purchase' ? acc + entry.qty : acc - entry.qty;
  }, openingStock);

  const handleRowClick = (entry) => {
    if (!entry.invoiceId) return;
    if (entry.model === 'PurchaseInvoice') {
      window.open(`/purchase-invoice?id=${entry.invoiceId}`, '_blank');
    } else if (entry.model === 'Invoice') {
      window.open(`/create-sale?id=${entry.invoiceId}`, '_blank');
    }
  };

  return (
    <div>
      <h2>📘 Product Ledger</h2>
      <h3>{product.name}</h3>

      {/* Filters */}
      <div style={{ marginBottom: '15px' }}>
        <label>
          From:{' '}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label style={{ marginLeft: '10px' }}>
          To: <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button onClick={loadLedger} style={{ marginLeft: '10px' }}>
          🔄 Filter
        </button>
        <button onClick={handlePDF} style={{ marginLeft: '10px' }}>
          📄 Export PDF
        </button>
      </div>

      {/* Party Name Search */}
      <div style={{ marginBottom: '10px' }}>
        <input
          placeholder="🔍 Search by party"
          value={partySearch}
          onChange={(e) => setPartySearch(e.target.value)}
          style={{ padding: '5px', width: '200px' }}
        />
      </div>

      <div ref={tableRef}>
        <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th colSpan="5">Opening Stock: {openingStock}</th>
            </tr>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th>Date</th>
              <th>Type</th>
              <th>Party</th>
              <th>Qty</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {filteredCombined.map((entry, index) => (
              <tr
                key={index}
                onClick={() => handleRowClick(entry)}
                style={{ cursor: entry.invoiceId ? 'pointer' : 'default' }}
              >
                <td>{entry.date.toLocaleDateString()}</td>
                <td>{entry.type}</td>
                <td>{entry.party}</td>
                <td>{entry.qty}</td>
                <td>{entry.rate}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>
              <td colSpan="3">Closing Stock</td>
              <td colSpan="2">{closing}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductLedger;
