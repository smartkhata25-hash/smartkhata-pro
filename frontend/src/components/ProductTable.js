// src/components/ProductTable.js
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // ✅ NEW
import { deleteProduct } from '../services/inventoryService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ProductTable = ({ products, onDelete, onEdit, onStockEntry }) => {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    stockFilter: '',
  });

  const tableRef = useRef();
  const navigate = useNavigate(); // ✅ NEW

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const filteredProducts = products.filter((p) => {
    const nameMatch = p.name.toLowerCase().includes(filters.search.toLowerCase());
    const categoryMatch = filters.category ? p.category === filters.category : true;
    const stockMatch =
      filters.stockFilter === 'low'
        ? p.stock <= p.lowStockThreshold
        : filters.stockFilter === 'zero'
        ? p.stock === 0
        : true;

    return nameMatch && categoryMatch && stockMatch;
  });

  const handleDelete = async (product) => {
    const confirm = window.confirm(`Delete "${product.name}"?`);
    if (confirm) {
      await deleteProduct(product._id);
      onDelete(product._id);
    }
  };

  const handlePrint = () => {
    const printContent = tableRef.current.innerHTML;
    const newWindow = window.open('', '', 'width=900,height=650');
    newWindow.document.write(`
      <html>
        <head><title>Inventory Report</title></head>
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

  return (
    <div>
      <h3>📋 Product List</h3>

      {/* 🔘 NEW: Stock Entry Button */}
      <div style={{ marginBottom: '10px', textAlign: 'right' }}>
        <button
          onClick={onStockEntry}
          style={{
            backgroundColor: '#6f42c1',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ➕ Stock Entry
        </button>
      </div>

      {/* 🔍 Filters + Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Search by name"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={filters.stockFilter}
          onChange={(e) => setFilters({ ...filters, stockFilter: e.target.value })}
        >
          <option value="">All Stock</option>
          <option value="low">⚠️ Low Stock</option>
          <option value="zero">❌ Out of Stock</option>
        </select>

        <button onClick={handlePrint}>🖨️ Print</button>
        <button onClick={handlePDF}>📄 Export PDF</button>
      </div>

      {/* ✅ Table Section */}
      <div id="print-section" ref={tableRef}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0', textAlign: 'center' }}>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Cost</th>
              <th>Sale</th>
              <th>Stock</th>
              <th className="no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr
                key={p._id}
                style={{ textAlign: 'center', cursor: 'pointer' }}
                onClick={() => navigate(`/product-ledger/${p._id}`)} // ✅ Navigate on row click
              >
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{p.unit}</td>
                <td>{p.unitCost}</td>
                <td>{p.salePrice}</td>
                <td>{p.stock}</td>
                <td className="no-print">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(p);
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p);
                    }}
                    style={{ marginLeft: '5px' }}
                  >
                    ❌
                  </button>
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
