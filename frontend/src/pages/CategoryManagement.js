import React, { useEffect, useState } from 'react';
import {
  getCategories,
  createCategory,
  deleteCategory,
  updateCategory,
} from '../services/categoryService';
import { fetchProducts } from '../services/inventoryService';
import { t } from '../i18n/i18n';

const CategoryManagement = () => {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState('');

  // 🔁 Load categories + products
  const loadData = async () => {
    try {
      const cats = await getCategories();
      const prods = await fetchProducts();

      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      console.error(err);
      alert(t('alerts.categoriesLoadFailed'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ➕ Add Category
  const handleAdd = async () => {
    if (!name.trim()) {
      alert(t('alerts.categoryNameRequired'));
      return;
    }

    try {
      await createCategory(name.trim());
      setName('');
      loadData();
    } catch (err) {
      alert(err?.response?.data?.error || t('alerts.createFailed'));
    }
  };

  // ✏️ Update Category
  const handleUpdate = async () => {
    if (!name.trim()) {
      alert(t('alerts.categoryNameRequired'));
      return;
    }

    try {
      await updateCategory(editingId, name.trim());
      setEditingId(null);
      setName('');
      loadData();
    } catch (err) {
      alert(err?.response?.data?.error || t('alerts.updateFailed'));
    }
  };

  // ❌ Delete Category
  const handleDelete = async (catId) => {
    const used = products.some((p) => p.categoryId?._id === catId);

    if (used) {
      alert(t('alerts.categoryInUse'));
      return;
    }

    if (!window.confirm(t('alerts.deleteCategoryConfirm'))) return;

    try {
      await deleteCategory(catId);
      loadData();
    } catch (err) {
      alert(err?.response?.data?.error || t('alerts.deleteFailed'));
    }
  };

  // 🔍 Search Filter
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  // 📦 Product Count per Category
  const getProductCount = (catId) => {
    return products.filter((p) => p.categoryId?._id === catId).length;
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* Page Header */}
      <div
        style={{
          fontSize: '22px',
          fontWeight: '600',
          marginBottom: '20px',
        }}
      >
        {t('inventory.categoryManagement')}
      </div>

      {/* Card */}
      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '20px',
            gap: '10px',
          }}
        >
          {/* Search */}
          <input
            placeholder={t('inventory.searchCategory')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              width: '250px',
            }}
          />

          {/* Add / Edit */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              placeholder={t('inventory.categoryName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
              }}
            />

            {editingId ? (
              <>
                <button
                  onClick={handleUpdate}
                  style={{
                    background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {t('common.update')}
                </button>

                <button
                  onClick={() => {
                    setEditingId(null);
                    setName('');
                  }}
                  style={{
                    background: '#6b7280',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {t('cancel')}
                </button>
              </>
            ) : (
              <button
                onClick={handleAdd}
                style={{
                  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                {t('inventory.addCategory')}
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#f3f4f6',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '12px' }}>{t('inventory.categoryName')}</th>
                <th style={{ padding: '12px', width: '150px' }}>{t('inventory.products')}</th>
                <th style={{ padding: '12px', width: '200px' }}>{t('common.actions')}</th>
              </tr>
            </thead>

            <tbody>
              {filteredCategories.map((cat) => (
                <tr
                  key={cat._id}
                  style={{
                    borderTop: '1px solid #eee',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: '500' }}>{cat.name}</td>

                  <td style={{ padding: '12px' }}>{getProductCount(cat._id)}</td>

                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={() => {
                        setEditingId(cat._id);
                        setName(cat.name);
                      }}
                      style={{
                        background: '#facc15',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        marginRight: '8px',
                      }}
                    >
                      {t('edit')}
                    </button>

                    <button
                      onClick={() => handleDelete(cat._id)}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}

              {filteredCategories.length === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    style={{
                      textAlign: 'center',
                      padding: '25px',
                      color: '#777',
                    }}
                  >
                    {t('inventory.noCategories')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagement;
