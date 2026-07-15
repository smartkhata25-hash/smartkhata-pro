import React, { useEffect, useState } from 'react';

import ProductModal from '../components/ProductModal';
import ProductTable from '../components/ProductTable';
import LowStockModal from '../components/LowStockModal';
import MultipleProductForm from '../components/MultipleProductForm';

import { useLocation } from 'react-router-dom';
import { fetchProducts } from '../services/inventoryService';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const InventoryPage = () => {
  const [products, setProducts] = useState(() => {
    const saved = sessionStorage.getItem('products');
    return saved ? JSON.parse(saved) : [];
  });
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [showMultipleForm, setShowMultipleForm] = useState(false);
  const isMobile = window.innerWidth <= 768;

  const location = useLocation();

  const canViewInventory = hasPermission('inventory.view');

  const canCreateProducts = hasPermission('products.create');
  const canEditProducts = hasPermission('products.edit');
  const canBulkCreateProducts = hasPermission('products.bulk_create');

  // 🔁 Load Products
  const loadProducts = async () => {
    const data = await fetchProducts();
    setProducts(data);
    sessionStorage.setItem('products', JSON.stringify(data));
  };

  useEffect(() => {
    loadProducts();

    const query = new URLSearchParams(location.search);

    if (query.get('bulk') === 'true' && canBulkCreateProducts) {
      setShowMultipleForm(true);
    }

    if (query.get('new') === 'true' && canCreateProducts) {
      setEditProduct(null);
      setShowModal(true);
    }

    if (query.get('lowstock') === 'true' && canViewInventory) {
      setShowLowStock(true);
    }
  }, [location, canBulkCreateProducts, canCreateProducts, canViewInventory]);

  // ➕ Add Product
  const handleAdd = async (closeModal = true) => {
    await loadProducts();

    if (closeModal) {
      setShowModal(false);
    }
  };
  // ✏️ Update Product
  const handleUpdate = (updatedProducts) => {
    setProducts(updatedProducts);

    sessionStorage.setItem('products', JSON.stringify(updatedProducts));

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
    if (!canEditProducts) {
      alert('You do not have permission to edit products');
      return;
    }

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
              if (!canCreateProducts) return;

              setEditProduct(null);
              setShowModal(true);
            }}
            onLowStockClick={() => {
              if (!canViewInventory) return;

              setShowLowStock(true);
            }}
            onBulkClick={() => {
              if (!canBulkCreateProducts) return;

              setShowMultipleForm((prev) => !prev);
            }}
          />
        </>
      )}

      {/* 🧾 Bulk Add Products */}
      {canBulkCreateProducts && showMultipleForm && (
        <MultipleProductForm
          onBulkAdd={(updatedProducts) => {
            setProducts(updatedProducts);

            sessionStorage.setItem('products', JSON.stringify(updatedProducts));
          }}
          onClose={() => setShowMultipleForm(false)}
        />
      )}
    </div>
  );
};

export default InventoryPage;
