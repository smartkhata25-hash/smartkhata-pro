import React, { useState, useEffect, useRef } from 'react';
import { createProduct, updateProduct } from '../services/inventoryService';
import { getCategories, createCategory } from '../services/categoryService';
import { useNavigate, useLocation } from 'react-router-dom';
import { t } from '../i18n/i18n';

const ProductForm = ({ onAdd, editProduct, onUpdate, clearEdit, closeModal, isMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const defaultName = searchParams.get('name') || '';
  const returnTo = searchParams.get('return') || '';

  const [form, setForm] = useState({
    name: defaultName,
    rackNo: '',
    categoryId: '',
    unit: 'piece',
    unitCost: '',
    salePrice: '',
    stock: '',
    lowStockThreshold: '',
    description: '',
  });

  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const nameInputRef = useRef(null);

  // 🔁 Load categories
  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      console.error(t('alerts.categoryLoadFailed'));
    }
  };

  // ✏️ Edit case
  useEffect(() => {
    if (editProduct) {
      setForm({
        name: editProduct.name || '',
        rackNo: editProduct.rackNo || '',
        categoryId: editProduct.categoryId?._id || '',
        unit: editProduct.unit || 'piece',
        unitCost: editProduct.unitCost || '',
        salePrice: editProduct.salePrice || '',
        stock: '',
        lowStockThreshold: editProduct.lowStockThreshold || '',
        description: editProduct.description || '',
      });
    }
  }, [editProduct]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e, true); // Save & New
    }
  };
  const handleSubmit = async (e, saveNew = false) => {
    e.preventDefault();
    try {
      if (editProduct) {
        const updated = await updateProduct(editProduct._id, form);
        onUpdate?.(updated);
        clearEdit?.();
      } else {
        await createProduct(form);

        // ✅ product list reload کرو
        onAdd?.(!saveNew);

        if (returnTo) {
          navigate(returnTo);
          return;
        }
      }

      // 🔄 Reset form
      setForm({
        name: '',
        rackNo: '',
        categoryId: '',
        unit: 'piece',
        unitCost: '',
        salePrice: '',
        stock: '',
        lowStockThreshold: '',
        description: '',
      });
      setNewCategory('');

      if (!saveNew) {
        closeModal?.();
      }
    } catch (error) {
      const msg =
        error.response?.data?.error || error.response?.data?.message || '❌ Error saving product';

      // 🔔 Duplicate product case
      if (msg.toLowerCase().includes('already exists')) {
        const confirmMerge = window.confirm(t('alerts.productExists'));

        if (confirmMerge) {
          // merge logic will be implemented later
          alert(t('alerts.mergeNotImplemented'));
        }

        return;
      }

      alert(msg);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    try {
      const created = await createCategory(newCategory.trim());
      setCategories([...categories, created]);
      setForm({ ...form, categoryId: created._id });
      setNewCategory('');
    } catch (err) {
      alert(t('alerts.categoryAddFailed'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      style={{
        display: 'grid',
        gap: '15px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? '8px' : '12px',
        }}
      >
        <input
          ref={nameInputRef}
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder={t('inventory.product')}
          required
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />
        <input
          name="rackNo"
          value={form.rackNo}
          onChange={handleChange}
          placeholder={t('inventory.rack')}
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />

        {/* 🔽 Category Dropdown */}
        <select
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        >
          <option value="">{t('inventory.selectCategory')}</option>
          {categories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.name}
            </option>
          ))}
        </select>

        {/* ➕ Inline Add Category */}
        <div
          style={{
            display: 'flex',
            gap: '5px',
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <input
            placeholder={t('inventory.addCategory')}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              padding: isMobile ? '6px' : '8px',
              fontSize: isMobile ? 12 : 14,
              borderRadius: '6px',
              border: '1px solid #ccc',
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleAddCategory();
            }}
            style={{
              padding: isMobile ? '5px' : '6px 10px',
              fontSize: isMobile ? 12 : 14,
              borderRadius: '6px',
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          >
            ➕
          </button>
        </div>

        <select
          name="unit"
          value={form.unit}
          onChange={handleChange}
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        >
          <option value="piece">{t('units.piece')}</option>
          <option value="kg">{t('units.kg')}</option>
          <option value="gram">{t('units.gram')}</option>
          <option value="liter">{t('units.liter')}</option>
          <option value="meter">{t('units.meter')}</option>
          <option value="box">{t('units.box')}</option>
          <option value="dozen">{t('units.dozen')}</option>
          <option value="packet">{t('units.packet')}</option>
        </select>

        <input
          name="unitCost"
          value={form.unitCost}
          onChange={handleChange}
          placeholder={t('inventory.cost')}
          type="number"
          required
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />

        <input
          name="salePrice"
          value={form.salePrice}
          onChange={handleChange}
          placeholder={t('inventory.salePrice')}
          type="number"
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />

        <input
          name="stock"
          value={form.stock}
          onChange={handleChange}
          placeholder={t('inventory.initialStock')}
          type="number"
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />

        <input
          name="lowStockThreshold"
          value={form.lowStockThreshold}
          onChange={handleChange}
          placeholder={t('inventory.lowThreshold')}
          type="number"
          style={{
            padding: isMobile ? '6px' : '8px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            border: '1px solid #ccc',
          }}
        />
      </div>

      <textarea
        name="description"
        value={form.description}
        onChange={handleChange}
        placeholder={t('common.description')}
        rows="2"
        style={{
          resize: 'none',
          padding: isMobile ? '6px' : '8px',
          fontSize: isMobile ? 12 : 14,
          borderRadius: '6px',
          border: '1px solid #ccc',
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: '8px',
          justifyContent: isMobile ? 'space-between' : 'flex-end',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          marginTop: '10px',
        }}
      >
        {/* Save / Update */}
        <button
          type="button"
          onClick={(e) => handleSubmit(e, false)}
          style={{
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            padding: isMobile ? '6px 8px' : '8px 16px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {editProduct ? t('update') : t('save')}
        </button>

        {/* Save & New */}
        <button
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: isMobile ? '6px 8px' : '8px 16px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {t('saveNew')}
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={() =>
            setForm({
              name: '',
              rackNo: '',
              categoryId: '',
              unit: 'piece',
              unitCost: '',
              salePrice: '',
              stock: '',
              lowStockThreshold: '',
              description: '',
            })
          }
          style={{
            background: '#f59e0b',
            color: '#fff',
            border: 'none',
            padding: isMobile ? '6px 8px' : '8px 16px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {t('clear')}
        </button>

        {/* Cancel */}
        <button
          type="button"
          onClick={() => {
            clearEdit?.();
            closeModal?.();
          }}
          style={{
            background: '#6b7280',
            color: '#fff',
            border: 'none',
            padding: isMobile ? '6px 8px' : '8px 16px',
            fontSize: isMobile ? 12 : 14,
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
};

export default ProductForm;
