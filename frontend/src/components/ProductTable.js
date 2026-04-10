import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteProduct } from '../services/inventoryService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { t } from '../i18n/i18n';

const ProductTable = ({ products, onDelete, onEdit, onAddClick, onLowStockClick, onBulkClick }) => {
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    stockFilter: '',
  });
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  // 📱 Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tableRef = useRef();
  const navigate = useNavigate();

  // 🔽 Categories from products (unique, safe)
  const categories = [
    ...new Map(
      (products || [])
        .filter((p) => p && p.categoryId && typeof p.categoryId === 'object' && p.categoryId._id)
        .map((p) => [p.categoryId._id, p.categoryId])
    ).values(),
  ];

  const filteredProducts = (products || []).filter((p) => {
    const nameMatch = (p.name || '').toLowerCase().includes(filters.search.toLowerCase());

    const categoryMatch = filters.categoryId
      ? p.categoryId && typeof p.categoryId === 'object' && p.categoryId._id === filters.categoryId
      : true;

    const stockMatch =
      filters.stockFilter === 'low'
        ? (p.stock || 0) <= (p.lowStockThreshold || 0)
        : filters.stockFilter === 'zero'
          ? (p.stock || 0) === 0
          : true;

    return nameMatch && categoryMatch && stockMatch;
  });

  const handleDelete = async (product) => {
    const confirm = window.confirm(`${t('inventory.deleteProduct')} "${product.name}"?`);
    if (!confirm) return;

    try {
      await deleteProduct(product._id);
      onDelete(product._id);
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        t('alerts.cannotDeleteProduct');

      alert(msg);
    }
  };

  const handlePrint = () => {
    const printContent = tableRef.current.innerHTML;
    const newWindow = window.open('', '', 'width=900,height=650');
    newWindow.document.write(`
      <html>
        <head><title>${t('inventory.report')}</title></head>
        <body>
          <div id="print-section">${printContent}</div>
        </body>
      </html>`);
    newWindow.document.close();
    newWindow.focus();
    newWindow.print();
    newWindow.close();
  };

  const handlePDF = async () => {
    const input = tableRef.current;
    const canvas = await html2canvas(input);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
    pdf.save('Inventory_Report.pdf');
  };

  useEffect(() => {
    if (tableRef.current) {
      tableRef.current.focus();
    }
  }, [filteredProducts]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* 🚀 Unified Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          marginBottom: '8px',
          flexWrap: 'wrap',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        {/* 🔍 Search */}
        <input
          type="text"
          placeholder={t('inventory.searchProduct')}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          style={{
            padding: '6px 8px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            minWidth: isMobile ? '100px' : '220px',
            flex: '1',
            maxWidth: isMobile ? '130px' : '320px',
            outline: 'none',
            fontSize: isMobile ? 12 : 14,
            fontWeight: isMobile ? 700 : 600,
          }}
        />

        {/* 📂 Category */}
        <div style={{ position: 'relative', width: isMobile ? '90px' : '140px' }}>
          <select
            value={filters.categoryId}
            onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
            style={{
              padding: isMobile ? '5px 6px' : '7px 10px',
              width: '100%',
              fontSize: isMobile ? 12 : 14,
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontWeight: isMobile ? 700 : 600,

              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis', // ✅ text cut ہوگا
            }}
          >
            <option value="">{t('common.all')}</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* 📦 Stock */}
        <select
          value={filters.stockFilter}
          onChange={(e) => setFilters({ ...filters, stockFilter: e.target.value })}
          style={{
            padding: isMobile ? '5px 6px' : '7px 10px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            width: isMobile ? '90px' : 'auto',
            fontSize: isMobile ? 12 : 14,
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          <option value="">{t('inventory.stock')}</option>
          <option value="low">{t('inventory.lowStock')}</option>
          <option value="zero">{t('inventory.outOfStock')}</option>
        </select>

        {/* 🔵 Add New Product */}
        <button
          onClick={onAddClick}
          style={{
            background: 'linear-gradient(135deg,#2563eb,#1e3a8a)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? 'Add' : t('inventory.addProduct')}
        </button>

        {/* 🔴 Low Stock Alerts */}
        <button
          onClick={onLowStockClick}
          style={{
            background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {t('inventory.lowStock')}
        </button>

        {/* 🟢 Bulk Add Products */}
        <button
          onClick={onBulkClick}
          style={{
            background: 'linear-gradient(135deg,#16a34a,#14532d)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? 'Bulk' : t('inventory.bulkProducts')}
        </button>

        {/* 🔧 Inventory Adjust */}
        <button
          onClick={() => navigate('/inventory-adjust')}
          style={{
            background: 'linear-gradient(135deg,#0ea5e9,#075985)',
            color: '#fff',
            padding: isMobile ? '6px 8px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? 'Adjust' : t('inventory.adjust')}
        </button>

        {/* 📜 Stock History */}
        <button
          onClick={() => navigate('/stock-history')}
          style={{
            background: 'linear-gradient(135deg,#7c3aed,#4c1d95)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? 'History' : t('inventory.stockHistory')}
        </button>

        {/* 🖨 Print */}
        <button
          onClick={handlePrint}
          style={{
            background: 'linear-gradient(135deg,#6b7280,#374151)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? '🖨' : t('print')}
        </button>

        {/* 📄 PDF */}
        <button
          onClick={handlePDF}
          style={{
            background: 'linear-gradient(135deg,#0284c7,#075985)',
            color: '#fff',
            padding: isMobile ? '5px 6px' : '7px 14px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? '📄' : t('pdf')}
        </button>
      </div>

      {/* 📊 Table */}
      <div
        id="print-section"
        ref={tableRef}
        style={{
          outline: 'none',
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        <table className="w-full border text-sm">
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: '#f3f4f6',
            }}
          >
            <tr className="bg-gray-100 text-center">
              <th className="border p-2 w-1/4">{t('inventory.product')}</th>

              <th className="border p-2 w-64">{t('inventory.category')}</th>
              <th className="border p-2 w-24">{t('inventory.rack')}</th>
              <th className="border p-2">{t('common.description')}</th>
              <th className="border p-2">{t('inventory.unit')}</th>
              <th className="border p-2">{t('inventory.cost')}</th>

              <th className="border p-2">{t('inventory.salePrice')}</th>

              <th className="border p-2 w-24">{t('inventory.stock')}</th>

              <th className="border p-2 no-print w-20">{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredProducts.map((p, index) => (
              <tr
                key={p._id}
                className={`text-center cursor-pointer odd:bg-white even:bg-gray-50 hover:bg-blue-50 ${
                  selectedRowIndex === index ? 'bg-blue-200' : ''
                }`}
                onClick={() => {
                  setSelectedRowIndex(index);
                  if (isMobile) {
                    navigate(`/product-ledger/${p._id}`);
                  }
                }}
                onDoubleClick={() => {
                  if (!isMobile) {
                    navigate(`/product-ledger/${p._id}`);
                  }
                }}
              >
                <td className="border p-2 w-1/4">{p.name}</td>

                <td className="border p-2 w-64">{p.categoryId?.name || '-'}</td>
                <td className="border p-2 w-24">{p.rackNo || '-'}</td>
                <td className="border p-2">{p.description || '-'}</td>
                <td className="border p-2">{p.unit}</td>
                <td className="border p-2">{p.unitCost}</td>
                <td className="border p-2">{p.salePrice}</td>
                <td className="border p-2 w-24">{p.stock}</td>
                <td className="border p-2 no-print w-20">
                  <div className="flex justify-center gap-2">
                    <button
                      className="bg-yellow-400 px-2 py-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(p);
                      }}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      className="bg-red-600 text-white px-2 py-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p);
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductTable;
