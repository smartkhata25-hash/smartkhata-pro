import React, { useEffect, useState } from 'react';
import ProductForm from '../components/ProductForm';
import ProductTable from '../components/ProductTable';
import LowStockAlert from '../components/LowStockAlert';
import TransactionForm from '../components/TransactionForm';
import TransactionTable from '../components/TransactionTable';

import {
  fetchProducts,
  getAllTransactions,
  deleteTransaction
} from '../services/inventoryService';

const InventoryPage = () => {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [filter, setFilter] = useState("ALL");

  // 🔁 Load Products
  const loadProducts = async () => {
    const data = await fetchProducts();
    setProducts(data);
  };

  // 🔁 Load Transactions
  const loadTransactions = async () => {
    const data = await getAllTransactions();
    setTransactions(data);
  };

  useEffect(() => {
    loadProducts();
    loadTransactions();
  }, []);

  // ➕ Add Product
  const handleAdd = (newProduct) => {
    setProducts([...products, newProduct]);
    setShowForm(false);
  };

  // ✏️ Update Product
  const handleUpdate = (updatedProduct) => {
    setProducts(products.map(p => (p._id === updatedProduct._id ? updatedProduct : p)));
    setShowForm(false);
  };

  // ❌ Delete Product
  const handleDelete = (id) => {
    const confirm = window.confirm("Are you sure you want to delete this product?");
    if (!confirm) return;
    setProducts(products.filter(p => p._id !== id));
  };

  // ✏️ Edit Product
  const handleEdit = (product) => {
    setEditProduct(product);
    setShowForm(true);
  };

  // ➕ Transaction Added
  const handleTransactionAdd = (tx) => {
    setTransactions([tx, ...transactions]);
    loadProducts(); // update stock
    setShowTransactionForm(false);
  };

  // ❌ Delete Transaction
  const handleTransactionDelete = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this transaction?");
    if (!confirmDelete) return;
    await deleteTransaction(id);
    setTransactions(transactions.filter(t => t._id !== id));
    loadProducts(); // stock update
  };

  // 🧠 Filtered Transactions Logic
  const filteredTransactions = transactions.filter(t => {
    if (filter === 'IN') return t.type === 'IN';
    if (filter === 'OUT') return t.type === 'OUT';
    return true;
  });

  return (
    <div style={{ padding: '20px' }}>
      <h2>📦 Inventory Management</h2>

      {/* ⚠️ Toggle Low Stock */}
      <div
        onClick={() => setShowLowStock(!showLowStock)}
        style={{ cursor: 'pointer', color: 'darkred', marginBottom: '10px' }}
      >
        <h4>⚠️ Low Stock Alerts</h4>
      </div>
      {showLowStock && <LowStockAlert products={products} />}

      {/* ➕ Add Product Toggle */}
      <div
        onClick={() => {
          setEditProduct(null);
          setShowForm(!showForm);
        }}
        style={{ cursor: 'pointer', color: '#007bff', fontWeight: 'bold', marginBottom: '10px' }}
      >
        {editProduct ? '✏️ Cancel Edit' : '➕ Add New Product'}
      </div>

      {showForm && (
        <ProductForm
          onAdd={handleAdd}
          editProduct={editProduct}
          onUpdate={handleUpdate}
          clearEdit={() => setEditProduct(null)}
        />
      )}

      {/* 📋 Product Table */}
      <ProductTable
        products={products}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* ➕ Stock Entry Toggle Button */}
      <div
        onClick={() => setShowTransactionForm(!showTransactionForm)}
        style={{
          cursor: 'pointer',
          color: '#6f42c1',
          fontWeight: 'bold',
          margin: '20px 0',
          float: 'right'
        }}
      >
        {showTransactionForm ? '➖ Close Stock Entry' : '➕ Stock Entry'}
      </div>

      {/* Only show below block when toggled */}
      {showTransactionForm && (
        <>
          <TransactionForm
            products={products}
            onAdd={handleTransactionAdd}
          />

          {/* 🔽 Filter Dropdown */}
          <div style={{ margin: '20px 0' }}>
            <label><strong>Filter:</strong> </label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="IN">IN Only</option>
              <option value="OUT">OUT Only</option>
            </select>
          </div>

          <TransactionTable
            transactions={filteredTransactions}
            products={products}
            onDelete={handleTransactionDelete}
          />
        </>
      )}
    </div>
  );
};

export default InventoryPage;
