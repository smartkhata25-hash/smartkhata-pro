import React, { useState, useEffect, useRef } from 'react';

import { createProduct, updateProduct, fetchProducts } from '../services/inventoryService';

import { getCategories, createCategory } from '../services/categoryService';

import { useNavigate, useLocation } from 'react-router-dom';

import { t } from '../i18n/i18n';

import ProductDropdown from './ProductDropdown';

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
  const [products, setProducts] = useState([]);

  const [newCategory, setNewCategory] = useState('');

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);

  const nameInputRef = useRef(null);

  // 🔁 Load categories + products
  useEffect(() => {
    loadCategories();
    loadProducts();
  }, []);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getCategories();

      setCategories(data || []);
    } catch (err) {
      console.error(t('alerts.categoryLoadFailed'));
    }
  };

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();

      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load products');
    }
  };

  // ✏️ Edit case
  useEffect(() => {
    if (!editProduct) return;

    setForm({
      name: editProduct.name || '',
      rackNo: editProduct.rackNo || '',
      categoryId: editProduct.categoryId?._id || '',
      unit: editProduct.unit || 'piece',
      unitCost: editProduct.unitCost || '',
      salePrice: editProduct.salePrice || '',
      stock: editProduct.stock || '',
      lowStockThreshold: editProduct.lowStockThreshold || '',
      description: editProduct.description || '',
    });

    setImagePreview(editProduct.image?.url || '');
    setImageFile(null);
    setRemoveImage(false);
  }, [editProduct]);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // ✅ Decimal / number fields
  // type="text" رکھا گیا ہے تاکہ mouse wheel سے amount change نہ ہو
  const handleNumberChange = (e) => {
    const { name, value } = e.target;

    if (value === '') {
      setForm((prev) => ({
        ...prev,
        [name]: '',
      }));

      return;
    }

    // صرف number + decimal
    if (!/^\d*\.?\d*$/.test(value)) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      handleSubmit(e, true);
    }
  };

  const handleSubmit = async (e, saveNew = false) => {
    e.preventDefault();

    try {
      const formData = new FormData();

      Object.keys(form).forEach((key) => {
        formData.append(key, form[key]);
      });

      if (imageFile) {
        formData.append('image', imageFile);
      }

      formData.append('removeImage', removeImage);

      if (editProduct) {
        await updateProduct(editProduct._id, formData);

        const refreshedProducts = await fetchProducts();

        onUpdate?.(refreshedProducts);

        clearEdit?.();
      } else {
        const created = await createProduct(formData);

        // ✅ Quick Add return کے لیے
        localStorage.setItem('lastCreatedProductId', created._id);

        onAdd?.(created);

        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('product-created', {
              detail: created,
            })
          );
        }, 100);

        // ✅ Purchase / Sale Invoice پر واپس
        if (returnTo) {
          navigate(returnTo);
          return;
        }
      }

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

      setImageFile(null);
      setImagePreview('');
      setNewCategory('');

      if (!saveNew) {
        closeModal?.();
      }
    } catch (error) {
      const msg =
        error.response?.data?.error || error.response?.data?.message || '❌ Error saving product';

      if (msg.toLowerCase().includes('already exists')) {
        const confirmMerge = window.confirm(t('alerts.productExists'));

        if (confirmMerge) {
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

      setCategories((prev) => [...prev, created]);

      setForm((prev) => ({
        ...prev,
        categoryId: created._id,
      }));

      setNewCategory('');
    } catch (err) {
      alert(t('alerts.categoryAddFailed'));
    }
  };

  const resetForm = () => {
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

    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
    setNewCategory('');
  };

  const inputStyle = {
    width: '100%',
    minWidth: 0,

    height: isMobile ? '38px' : '48px',

    padding: isMobile ? '6px 10px' : '8px 12px',

    fontSize: isMobile ? '13px' : '14px',

    borderRadius: '7px',
    border: '1px solid #d1d5db',

    outline: 'none',

    background: '#fff',

    boxSizing: 'border-box',
  };

  const buttonBase = {
    border: 'none',
    borderRadius: '7px',

    padding: isMobile ? '8px 10px' : '10px 18px',

    fontSize: isMobile ? '12px' : '14px',

    cursor: 'pointer',

    fontWeight: 600,

    whiteSpace: 'nowrap',
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',

        gap: isMobile ? '10px' : '14px',

        maxHeight: isMobile ? '75vh' : 'none',

        overflowY: isMobile ? 'auto' : 'visible',

        paddingRight: isMobile ? '2px' : '0',
      }}
    >
      {/* ===============================
          MAIN FIELDS
      =============================== */}

      <div
        style={{
          display: 'grid',

          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, minmax(0, 1fr))',

          gap: isMobile ? '8px' : '12px',
        }}
      >
        {/* Product Name */}

        <div
          style={{
            gridColumn: isMobile ? '1 / -1' : 'auto',

            minWidth: 0,
          }}
        >
          <ProductDropdown
            productList={products}
            value={form.name}
            showAddOption={false}
            inputStyle={inputStyle}
            onChange={(value) => {
              setForm((prev) => ({
                ...prev,
                name: value,
              }));
            }}
            onSelect={(product) => {
              setForm((prev) => ({
                ...prev,
                name: product.name,
              }));
            }}
          />

          {products.some((p) => p.name?.trim().toLowerCase() === form.name.trim().toLowerCase()) &&
            form.name.trim() !== '' && (
              <div
                style={{
                  color: '#dc2626',
                  fontSize: '11px',
                  marginTop: '4px',
                  fontWeight: 600,
                }}
              >
                ⚠️ Product already exists
              </div>
            )}
        </div>

        {/* Rack */}

        <input
          name="rackNo"
          value={form.rackNo}
          onChange={handleChange}
          placeholder={t('inventory.rack')}
          style={inputStyle}
        />

        {/* Category */}

        <select
          value={form.categoryId}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              categoryId: e.target.value,
            }))
          }
          style={inputStyle}
        >
          <option value="">{t('inventory.selectCategory')}</option>

          {categories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.name}
            </option>
          ))}
        </select>

        {/* Add Category */}

        <div
          style={{
            display: 'flex',
            gap: '6px',

            gridColumn: isMobile ? '1 / -1' : 'auto',

            minWidth: 0,
          }}
        >
          <input
            placeholder={t('inventory.addCategory')}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              ...inputStyle,
              flex: 1,
            }}
          />

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();

              handleAddCategory();
            }}
            style={{
              width: isMobile ? '44px' : '48px',

              flexShrink: 0,

              borderRadius: '7px',
              border: '1px solid #d1d5db',

              background: '#fff',

              fontSize: '19px',

              cursor: 'pointer',

              color: '#6d4ed8',
            }}
          >
            ＋
          </button>
        </div>

        {/* Unit */}

        <select name="unit" value={form.unit} onChange={handleChange} style={inputStyle}>
          <option value="piece">{t('units.piece')}</option>

          <option value="pcs">{t('units.pcs')}</option>

          <option value="pair">{t('units.pair')}</option>

          <option value="set">{t('units.set')}</option>

          <option value="dozen">{t('units.dozen')}</option>

          <option value="gross">{t('units.gross')}</option>

          <option value="kg">{t('units.kg')}</option>

          <option value="gram">{t('units.gram')}</option>

          <option value="mg">{t('units.mg')}</option>

          <option value="ton">{t('units.ton')}</option>

          <option value="liter">{t('units.liter')}</option>

          <option value="ml">{t('units.ml')}</option>

          <option value="meter">{t('units.meter')}</option>

          <option value="cm">{t('units.cm')}</option>

          <option value="mm">{t('units.mm')}</option>

          <option value="inch">{t('units.inch')}</option>

          <option value="foot">{t('units.foot')}</option>

          <option value="yard">{t('units.yard')}</option>

          <option value="sqft">{t('units.sqft')}</option>

          <option value="sqm">{t('units.sqm')}</option>

          <option value="box">{t('units.box')}</option>

          <option value="carton">{t('units.carton')}</option>

          <option value="packet">{t('units.packet')}</option>

          <option value="bag">{t('units.bag')}</option>

          <option value="bundle">{t('units.bundle')}</option>

          <option value="roll">{t('units.roll')}</option>

          <option value="sheet">{t('units.sheet')}</option>

          <option value="coil">{t('units.coil')}</option>

          <option value="bottle">{t('units.bottle')}</option>

          <option value="can">{t('units.can')}</option>

          <option value="jar">{t('units.jar')}</option>

          <option value="drum">{t('units.drum')}</option>

          <option value="tube">{t('units.tube')}</option>

          <option value="rod">{t('units.rod')}</option>

          <option value="pipe">{t('units.pipe')}</option>

          <option value="wire">{t('units.wire')}</option>

          <option value="kit">{t('units.kit')}</option>

          <option value="pack">{t('units.pack')}</option>

          <option value="ream">{t('units.ream')}</option>
        </select>

        {/* Cost */}

        <input
          name="unitCost"
          value={form.unitCost}
          onChange={handleNumberChange}
          placeholder={t('inventory.cost')}
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          style={inputStyle}
        />

        {/* Sale Price */}

        <input
          name="salePrice"
          value={form.salePrice}
          onChange={handleNumberChange}
          placeholder={t('inventory.salePrice')}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          style={inputStyle}
        />

        {/* Initial Stock */}

        <input
          name="stock"
          value={form.stock}
          onChange={handleNumberChange}
          placeholder={t('inventory.initialStock')}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          style={inputStyle}
        />

        {/* Low Threshold */}

        <input
          name="lowStockThreshold"
          value={form.lowStockThreshold}
          onChange={handleNumberChange}
          placeholder={t('inventory.lowThreshold')}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          style={inputStyle}
        />

        {/* Image */}

        <div
          style={{
            gridColumn: isMobile ? '1 / -1' : 'auto',
          }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{
              ...inputStyle,

              height: 'auto',

              padding: isMobile ? '6px' : '8px',
            }}
          />

          {imagePreview && (
            <div
              style={{
                position: 'relative',

                width: '58px',

                marginTop: '6px',
              }}
            >
              <img
                src={imagePreview}
                alt="Product Preview"
                style={{
                  width: '58px',
                  height: '58px',

                  objectFit: 'cover',

                  borderRadius: '8px',

                  border: '1px solid #ddd',
                }}
              />

              {editProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview('');

                    setImageFile(null);

                    setRemoveImage(true);
                  }}
                  style={{
                    position: 'absolute',

                    top: '-7px',
                    right: '-7px',

                    width: '21px',
                    height: '21px',

                    borderRadius: '50%',

                    border: 'none',

                    background: '#dc2626',

                    color: '#fff',

                    fontSize: '14px',

                    cursor: 'pointer',

                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===============================
          DESCRIPTION
      =============================== */}

      <textarea
        name="description"
        value={form.description}
        onChange={handleChange}
        placeholder={t('common.description')}
        rows={isMobile ? 2 : 3}
        style={{
          ...inputStyle,

          height: isMobile ? '65px' : '74px',

          resize: 'none',

          padding: '10px 12px',
        }}
      />

      {/* ===============================
          BUTTONS
      =============================== */}

      <div
        style={{
          display: 'grid',

          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)',

          gap: isMobile ? '7px' : '10px',

          justifyContent: isMobile ? 'stretch' : 'end',

          marginTop: isMobile ? '2px' : '8px',
        }}
      >
        {/* Save */}

        <button
          type="button"
          onClick={(e) => handleSubmit(e, false)}
          style={{
            ...buttonBase,

            background: '#16a34a',

            color: '#fff',
          }}
        >
          {editProduct ? t('update') : t('save')}
        </button>

        {/* Save & New */}

        <button
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          style={{
            ...buttonBase,

            background: '#2563eb',

            color: '#fff',
          }}
        >
          {t('saveNew')}
        </button>

        {/* Clear */}

        <button
          type="button"
          onClick={resetForm}
          style={{
            ...buttonBase,

            background: '#f59e0b',

            color: '#fff',
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
            ...buttonBase,

            background: '#6b7280',

            color: '#fff',
          }}
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
};

export default ProductForm;
