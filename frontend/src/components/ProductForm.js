import React, { useState, useEffect } from 'react';
import { createProduct, updateProduct } from '../services/inventoryService';

const ProductForm = ({ onAdd, editProduct, onUpdate, clearEdit }) => {
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'piece',
    unitCost: '',
    salePrice: '',
    stock: '',
    lowStockThreshold: '',
    description: '',
  });

  useEffect(() => {
    if (editProduct) {
      setForm(editProduct);
    }
  }, [editProduct]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editProduct) {
        const updated = await updateProduct(editProduct._id, form);
        onUpdate(updated);
        clearEdit();
      } else {
        const product = await createProduct(form);
        onAdd(product);
      }

      setForm({
        name: '',
        category: '',
        unit: 'piece',
        unitCost: '',
        salePrice: '',
        stock: '',
        lowStockThreshold: '',
        description: '',
      });
    } catch (error) {
      alert('Error saving product');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'grid',
        gap: '10px',
        marginBottom: '30px',
        border: '1px solid #ccc',
        padding: '15px',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
      }}
    >
      <h3>{editProduct ? '✏️ Edit Product' : '➕ Add New Product'}</h3>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Product Name"
          required
        />
        <input
          name="category"
          value={form.category}
          onChange={handleChange}
          placeholder="Category"
        />
        <select name="unit" value={form.unit} onChange={handleChange}>
          <option value="piece">piece</option>
          <option value="kg">kg</option>
          <option value="gram">gram</option>
          <option value="liter">liter</option>
          <option value="meter">meter</option>
          <option value="box">box</option>
          <option value="dozen">dozen</option>
          <option value="packet">packet</option>
        </select>
        <input
          name="unitCost"
          value={form.unitCost || ""}
          onChange={handleChange}
          placeholder="Unit Cost"
          type="number"
          required
        />
        <input
          name="salePrice"
          value={form.salePrice || ""}
          onChange={handleChange}
          placeholder="Sale Price"
          type="number"
        />
        <input
          name="stock"
          value={form.stock || ""}
          onChange={handleChange}
          placeholder="Initial Stock"
          type="number"
        />
        <input
          name="lowStockThreshold"
          value={form.lowStockThreshold || ""}
          onChange={handleChange}
          placeholder="Low Stock Threshold"
          type="number"
        />
      </div>

      <textarea
        name="description"
        value={form.description}
        onChange={handleChange}
        placeholder="Description (optional)"
        rows="2"
        style={{ resize: 'none' }}
      />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit">{editProduct ? 'Update' : 'Save'}</button>
        {editProduct && (
          <button type="button" onClick={clearEdit}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default ProductForm;
