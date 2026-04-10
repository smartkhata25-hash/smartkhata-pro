import React, { useState, useEffect, useRef } from 'react';
import { bulkCreateProducts } from '../services/inventoryService';
import { getCategories } from '../services/categoryService';
import { t } from '../i18n/i18n';

import CategoryDropdown from '../components/CategoryDropdown';
import HighlightWrapper from '../components/HighlightWrapper';

const MultipleProductForm = ({ onBulkAdd, onClose }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCell, setActiveCell] = useState(null);

  const scrollRef = useRef();
  // 📱 Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const defaultRows = Array.from({ length: 20 }, () => blankProduct());
    setProducts(defaultRows);

    loadCategories(); // 👈 یہ add کریں
  }, []);
  const loadCategories = async () => {
    const data = await getCategories();
    setCategories(data);
  };

  const blankProduct = () => ({
    name: '',
    categoryId: '',
    unit: 'piece',
    unitCost: '',
    salePrice: '',
    stock: '',
    lowStockThreshold: '',
    description: '',
  });

  const handleChange = (index, e) => {
    const updated = [...products];
    updated[index][e.target.name] = e.target.value;
    setProducts(updated);

    if (index === products.length - 1 && e.target.name === 'name' && e.target.value.trim() !== '') {
      setProducts([...products, blankProduct()]);
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  };

  const removeRow = (index) => {
    const updated = products.filter((_, i) => i !== index);
    setProducts(updated);
  };

  const handleSubmit = async (action) => {
    try {
      const cleaned = products.filter((p) => p.name && p.unitCost);
      if (cleaned.length === 0) return alert(t('alerts.noValidProducts'));

      const created = await bulkCreateProducts(cleaned);

      if (created) {
        const newProducts = Array.isArray(created) ? created : [created];

        onBulkAdd(newProducts);

        // 🔥 NEW: categories بھی update کرو
        setCategories((prev) => {
          const newCats = newProducts
            .map((p) => p.categoryId)
            .filter((c) => c && !prev.find((x) => x._id === c._id));

          return [...prev, ...newCats];
        });

        if (action === 'close') {
          onClose();
        } else if (action === 'new') {
          setProducts(Array.from({ length: 20 }, () => blankProduct()));
          scrollRef.current.scrollTop = 0;
        }
      } else {
        alert(t('alerts.emptyServerResponse'));
      }
    } catch (err) {
      alert(err?.response?.data?.error || t('alerts.productSaveError'));
    }
  };

  const handleClear = () => {
    setProducts(Array.from({ length: 20 }, () => blankProduct()));
    scrollRef.current.scrollTop = 0;
  };

  const handleKeyNavigation = (e) => {
    const inputs = Array.from(document.querySelectorAll('input, select'));
    const currentIndex = inputs.indexOf(e.target);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (inputs[currentIndex + 9]) inputs[currentIndex + 9].focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (inputs[currentIndex - 9]) inputs[currentIndex - 9].focus();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (inputs[currentIndex + 1]) inputs[currentIndex + 1].focus();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (inputs[currentIndex - 1]) inputs[currentIndex - 1].focus();
    }
  };

  return (
    <div style={{ padding: isMobile ? '2px' : '10px' }}>
      <h3 style={{ fontWeight: '700', marginBottom: '10px' }}>
        📥 {t('inventory.addMultipleProducts')}
      </h3>

      <div
        ref={scrollRef}
        style={{
          maxHeight: '70vh',
          overflowY: 'auto',
          overflowX: 'auto',
          borderRadius: isMobile ? '8px' : '12px',
          background: '#ffffff',
          boxShadow: isMobile ? 'none' : '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
        }}
      >
        <table
          style={{
            width: isMobile ? '550px' : '100%',
            borderCollapse: 'collapse',
            tableLayout: 'auto',
            fontSize: isMobile ? '11px' : '13px',
          }}
        >
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr style={{ background: '#f1f5f9' }}>
              <th
                style={{
                  width: isMobile ? '50px' : '20%',
                  border: '1px solid #d1d5db',
                  padding: '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.product')}
              </th>

              <th
                style={{
                  width: '15%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.category')}
              </th>

              <th
                style={{
                  width: '8%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.unit')}
              </th>

              <th
                style={{
                  width: '8%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.cost')}
              </th>

              <th
                style={{
                  width: '8%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.salePrice')}
              </th>

              <th
                style={{
                  width: '8%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.stock')}
              </th>

              <th
                style={{
                  width: '8%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('inventory.lowThreshold')}
              </th>

              <th
                style={{
                  width: isMobile ? '50px' : '20%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('common.description')}
              </th>

              <th
                style={{
                  width: '5%',
                  border: '1px solid #d1d5db',
                  padding: isMobile ? '3px' : '6px',
                  textAlign: 'center',
                }}
              >
                {t('common.actions')}
              </th>
            </tr>
          </thead>

          <tbody>
            {products.map((p, rowIndex) => (
              <tr key={rowIndex}>
                {[
                  'name',
                  'categoryId',
                  'unit',
                  'unitCost',
                  'salePrice',
                  'stock',
                  'lowStockThreshold',
                  'description',
                ].map((field, colIndex) => (
                  <td key={colIndex}>
                    <HighlightWrapper
                      active={activeCell?.row === rowIndex && activeCell?.col === colIndex}
                      onFocus={() => setActiveCell({ row: rowIndex, col: colIndex })}
                    >
                      {field === 'categoryId' ? (
                        <CategoryDropdown
                          categories={categories}
                          onFocus={() => setActiveCell({ row: rowIndex, col: colIndex })}
                          value={categories.find((c) => c._id === p.categoryId)?.name || ''}
                          onSelect={(cat) => {
                            const updated = [...products];
                            updated[rowIndex].categoryId = cat._id;
                            setProducts(updated);
                          }}
                          onAddCategory={(newCat) => {
                            setCategories((prev) => [...prev, newCat]);
                          }}
                        />
                      ) : field === 'unit' ? (
                        <select
                          name="unit"
                          value={p.unit}
                          onChange={(e) => handleChange(rowIndex, e)}
                          onKeyDown={handleKeyNavigation}
                          style={inputStyle(isMobile)}
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
                      ) : (
                        <input
                          name={field}
                          type="text"
                          inputMode={
                            field === 'unitCost' ||
                            field === 'salePrice' ||
                            field === 'stock' ||
                            field === 'lowStockThreshold'
                              ? 'numeric'
                              : 'text'
                          }
                          value={p[field]}
                          onChange={(e) => handleChange(rowIndex, e)}
                          onKeyDown={handleKeyNavigation}
                          style={inputStyle(isMobile)}
                        />
                      )}
                    </HighlightWrapper>
                  </td>
                ))}

                <td style={{ textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  {products.length > 1 && (
                    <button
                      onClick={() => removeRow(rowIndex)}
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '2px',
                        padding: '2px 6px',
                        cursor: 'pointer',
                      }}
                    >
                      ❌
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          marginTop: '10px',
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => handleSubmit('close')} style={btnGreen(isMobile)}>
          ✅ {t('common.saveClose')}
        </button>

        <button onClick={() => handleSubmit('new')} style={btnBlue(isMobile)}>
          💾 {t('common.saveNew')}
        </button>

        <button onClick={handleClear} style={btnOrange(isMobile)}>
          🧹 {t('common.clear')}
        </button>
      </div>
    </div>
  );
};

const inputStyle = (isMobile) => ({
  width: '100%',
  padding: isMobile ? '2px' : '4px',
  border: 'none',
  outline: 'none',
  textAlign: 'center',
  fontSize: isMobile ? '11px' : '13px',
  background: 'transparent',
});

const btnGreen = (isMobile) => ({
  background: 'linear-gradient(135deg,#22c55e,#15803d)',
  color: '#fff',
  border: 'none',
  padding: isMobile ? '5px 8px' : '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: isMobile ? '12px' : '14px',
});
const btnBlue = (isMobile) => ({
  background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)',
  color: '#fff',
  border: 'none',
  padding: isMobile ? '5px 8px' : '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: isMobile ? '12px' : '14px',
});

const btnOrange = (isMobile) => ({
  background: 'linear-gradient(135deg,#f59e0b,#b45309)',
  color: '#fff',
  border: 'none',
  padding: isMobile ? '5px 8px' : '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: isMobile ? '12px' : '14px',
});

export default MultipleProductForm;
