import React, { useEffect, useState } from 'react';

import ProductModal from '../components/ProductModal';
import ProductTable from '../components/ProductTable';
import LowStockModal from '../components/LowStockModal';
import MultipleProductForm from '../components/MultipleProductForm';

import { useLocation } from 'react-router-dom';
import { fetchProducts } from '../services/inventoryService';
import { t } from '../i18n/i18n';

const InventoryPage = () => {
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [showMultipleForm, setShowMultipleForm] = useState(false);
  const isMobile = window.innerWidth <= 768;

  const location = useLocation();

  // 🔁 Load Products
  const loadProducts = async () => {
    const data = await fetchProducts();
    setProducts(data);
  };

  useEffect(() => {
    loadProducts();

    const query = new URLSearchParams(location.search);

    if (query.get('bulk') === 'true') {
      setShowMultipleForm(true);
    }

    if (query.get('new') === 'true') {
      setEditProduct(null);
      setShowModal(true);
    }

    if (query.get('lowstock') === 'true') {
      setShowLowStock(true);
    }
  }, [location]);

  // ➕ Add Product
  const handleAdd = async (closeModal = true) => {
    await loadProducts();

    if (closeModal) {
      setShowModal(false);
    }
  };
  // ✏️ Update Product
  const handleUpdate = (updatedProduct) => {
    setProducts(products.map((p) => (p._id === updatedProduct._id ? updatedProduct : p)));
    setShowModal(false);
  };

  // ❌ Delete Product
  const handleDelete = (id) => {
    const confirm = window.confirm(t('alerts.deleteProductConfirm'));
    if (!confirm) return;
    setProducts(products.filter((p) => p._id !== id));
  };

  // ✏️ Edit Product
  const handleEdit = (product) => {
    setEditProduct(product);
    setShowModal(true);
  };

  return (
    <div
      style={{
        padding: isMobile ? '4px 5px' : '4px 20px 20px 20px',

        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {!showMultipleForm && (
        <>
          {/* ⚠️ Low Stock Modal */}
          <LowStockModal
            open={showLowStock}
            onClose={() => setShowLowStock(false)}
            products={products}
          />

          {/* 🟢 Product Modal */}
          <ProductModal
            open={showModal}
            onClose={() => {
              setShowModal(false);
              setEditProduct(null);
            }}
            onAdd={handleAdd}
            editProduct={editProduct}
            onUpdate={handleUpdate}
            clearEdit={() => setEditProduct(null)}
          />

          {/* 📋 Product Table */}
          <ProductTable
            products={products}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddClick={() => {
              setEditProduct(null);
              setShowModal(true);
            }}
            onLowStockClick={() => setShowLowStock(true)}
            onBulkClick={() => setShowMultipleForm((prev) => !prev)}
          />
        </>
      )}

      {/* 🧾 Bulk Add Products */}
      {showMultipleForm && (
        <MultipleProductForm
          onBulkAdd={(newProducts) => {
            setProducts((prev) => [...prev, ...newProducts]);
          }}
          onClose={() => setShowMultipleForm(false)}
        />
      )}
    </div>
  );
};

export default InventoryPage;
