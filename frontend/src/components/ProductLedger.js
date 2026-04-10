import React, { useEffect, useState, useRef } from 'react';
import { fetchProductLedger } from '../services/productLedgerService';
import { fetchProducts } from '../services/inventoryService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const ProductLedger = ({ productId }) => {
  const [ledger, setLedger] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(productId || '');
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const selected = products.find((p) => p._id === selectedProduct);
    if (selected) {
      setProductSearch(selected.name);
    }
  }, [selectedProduct, products]);
  const tableRef = useRef();
  const navigate = useNavigate();

  const loadLedger = async () => {
    const data = await fetchProductLedger(selectedProduct, startDate, endDate);
    setLedger(data);
  };
  useEffect(() => {
    const loadProducts = async () => {
      const data = await fetchProducts();
      setProducts(data);
    };
    loadProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      const load = async () => {
        const data = await fetchProductLedger(selectedProduct, startDate, endDate);
        setLedger(data);
      };
      load();
    }
  }, [selectedProduct, startDate, endDate]);

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
  if (!selectedProduct) {
    return <p style={{ padding: '20px' }}>🔍 {t('inventory.selectProductMessage')}</p>;
  }

  if (!ledger) return <p>{t('common.loading')}</p>;

  const { openingStock, purchases = [], sales = [], refunds = [] } = ledger;

  const combined = [
    ...purchases.map((p) => ({
      type: 'Purchase',
      party: p.supplierName || 'Supplier',
      qty: p.quantity,
      date: new Date(p.date),
      invoiceId: p.invoiceId,
      model: 'PurchaseInvoice',
      billNo: p.billNo || '-',
    })),
    ...sales.map((s) => ({
      type: 'Sale',
      party: s.customerName || 'Customer',
      qty: s.quantity,
      date: new Date(s.date),
      invoiceId: s.invoiceId,
      model: 'Invoice',
      billNo: s.billNo || '-',
    })),
    ...refunds.map((r) => ({
      type: 'Refund',
      party: r.customerName || 'Customer',
      qty: r.quantity,
      date: new Date(r.date),
      invoiceId: r.invoiceId,
      model: 'RefundInvoice',
      billNo: r.billNo || '-',
    })),
    ...(ledger.ledger || [])
      .filter((e) => e.type === 'adjust')
      .map((a) => ({
        type: 'Adjust',
        party: t('inventory.adjust'),
        qty: a.quantity,
        date: new Date(a.date),
        invoiceId: null,
        model: null,
        billNo: a.billNo || '-',
      })),
  ].sort((a, b) => a.date - b.date);

  const filteredCombined = combined.filter((entry) => {
    const matchParty = entry.party.toLowerCase().includes(partySearch.toLowerCase());
    const matchType = filterType === 'all' || entry.type.toLowerCase() === filterType.toLowerCase();

    return matchParty && matchType;
  });

  const closing = combined.reduce((acc, entry) => {
    if (entry.type === 'Purchase' || entry.type === 'Refund') return acc + entry.qty;
    if (entry.type === 'Sale') return acc - entry.qty;
    if (entry.type === 'Adjust') return acc + entry.qty;
    return acc;
  }, openingStock);

  const handleRowClick = (entry) => {
    if (!entry.invoiceId) return;

    if (entry.model === 'PurchaseInvoice') {
      window.open(`/purchase-invoice?edit=true&id=${entry.invoiceId}`, '_blank');
    } else if (entry.model === 'Invoice') {
      navigate(`/sales?invoiceId=${entry.invoiceId}`);
    } else if (entry.model === 'RefundInvoice') {
      navigate(`/refund-invoice?edit=true&id=${entry.invoiceId}`);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 🔥 PRO TOOLBAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          marginBottom: '0px',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* 🔍 PRODUCT SEARCH */}
        <div style={{ position: 'relative' }}>
          <input
            placeholder={t('inventory.searchProduct')}
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              minWidth: '200px',
            }}
          />

          {/* 🔽 SEARCH RESULT LIST */}
          {productSearch &&
            productSearch !== products.find((p) => p._id === selectedProduct)?.name && (
              <div
                style={{
                  position: 'absolute',
                  top: '40px',
                  left: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  width: '100%',
                  zIndex: 1000,
                }}
              >
                {products
                  ?.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map((p) => (
                    <div
                      key={p._id}
                      onClick={() => {
                        setSelectedProduct(p._id);
                        setProductSearch(p.name);
                      }}
                      style={{
                        padding: '8px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee',
                      }}
                    >
                      {p.name}
                    </div>
                  ))}
              </div>
            )}
        </div>
        {/* DATE INPUT */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            padding: '7px 10px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
          }}
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{
            padding: '7px 10px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
          }}
        />

        {/* FILTER */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '7px 10px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
          }}
        >
          <option value="all">{t('common.all')}</option>
          <option value="purchase">{t('inventory.purchaseOnly')}</option>
          <option value="sale">{t('inventory.saleOnly')}</option>
          <option value="refund">{t('inventory.refundOnly')}</option>
          <option value="adjust">{t('inventory.adjustOnly')}</option>
        </select>

        {/* SEARCH */}
        <input
          placeholder={t('search')}
          value={partySearch}
          onChange={(e) => setPartySearch(e.target.value)}
          style={{
            padding: '7px 12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            minWidth: '180px',
          }}
        />

        {/* APPLY */}
        <button
          onClick={loadLedger}
          style={{
            background: 'linear-gradient(135deg,#2563eb,#1e3a8a)',
            color: '#fff',
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('common.apply')}
        </button>

        {/* PDF */}
        <button
          onClick={handlePDF}
          style={{
            background: 'linear-gradient(135deg,#0284c7,#075985)',
            color: '#fff',
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('exportPDF')}
        </button>
        <button
          onClick={() => {
            setStartDate('');
            setEndDate('');
            setPartySearch('');
            setFilterType('all');
          }}
          style={{
            background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
            color: '#fff',
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {t('clear')}
        </button>
      </div>

      {/* 🔥 TABLE */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
        }}
      >
        <div
          ref={tableRef}
          style={{
            flex: 1,
            overflowY: 'auto',
          }}
        >
          <table className="w-full text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 10 }}>
              <tr>
                <th colSpan="5" className="p-3 text-left border">
                  📦 {t('inventory.openingStock')}: {openingStock}
                </th>
              </tr>

              <tr className="bg-gray-100 text-center">
                <th className="border p-2">{t('common.date')}</th>
                <th className="border p-2">{t('common.billNo')}</th>
                <th className="border p-2">{t('common.type')}</th>
                <th className="border p-2">{t('common.party')}</th>
                <th className="border p-2">{t('common.qty')}</th>
              </tr>
            </thead>

            <tbody>
              {filteredCombined.map((entry, index) => (
                <tr
                  key={index}
                  onClick={() => handleRowClick(entry)}
                  className="text-center cursor-pointer odd:bg-white even:bg-gray-50 hover:bg-blue-50"
                  style={{
                    textDecoration: entry.invoiceId ? 'underline' : 'none',
                    backgroundColor:
                      entry.type === 'Purchase'
                        ? '#e6ffe6'
                        : entry.type === 'Sale'
                          ? '#ffe6e6'
                          : entry.type === 'Refund'
                            ? '#e6f0ff'
                            : '#fff7e6',
                  }}
                >
                  <td className="border p-2">{entry.date.toLocaleDateString()}</td>
                  <td className="border p-2">{entry.billNo}</td>
                  <td className="border p-2">{entry.type}</td>
                  <td className="border p-2">{entry.party}</td>
                  <td className="border p-2">
                    {entry.type === 'Sale'
                      ? `- ${entry.qty}`
                      : entry.type === 'Adjust'
                        ? `${entry.qty > 0 ? '+' : ''}${entry.qty}`
                        : `+ ${entry.qty}`}
                  </td>
                </tr>
              ))}

              <tr className="font-bold bg-gray-100">
                <td colSpan="3" className="border p-2">
                  {t('inventory.closingStock')}
                </td>
                <td colSpan="2" className="border p-2">
                  {closing}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductLedger;
