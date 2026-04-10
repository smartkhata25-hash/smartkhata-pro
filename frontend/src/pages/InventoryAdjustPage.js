import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts, adjustInventory, adjustInventoryBulk } from '../services/inventoryService';
import { t } from '../i18n/i18n';

const InventoryAdjustPage = () => {
  const navigate = useNavigate();

  const [mode, setMode] = useState('SINGLE'); // SINGLE | BULK
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // ===============================
  // 🔹 SINGLE STATE
  // ===============================
  const [single, setSingle] = useState({
    productId: '',
    currentQty: 0,
    newQty: '',
    diff: 0,
    note: '',
  });
  const [singleSearch, setSingleSearch] = useState('');
  const [singleSuggestions, setSingleSuggestions] = useState([]);
  const [singleSelectedIndex, setSingleSelectedIndex] = useState(-1);

  // ===============================
  // 🔹 BULK STATE
  // ===============================
  const createEmptyRow = () => ({
    productId: '',
    search: '',
    currentQty: 0,
    newQty: '',
    diff: 0,
    note: '',
  });

  const [rows, setRows] = useState(Array.from({ length: 5 }, createEmptyRow));
  const [bulkSuggestions, setBulkSuggestions] = useState({});
  const [bulkSelectedIndex, setBulkSelectedIndex] = useState({});

  // ===============================
  // 🔁 LOAD PRODUCTS
  // ===============================
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch {
      alert(t('alerts.productsLoadFailed'));
    }
  };

  // ===============================
  // 🔹 SINGLE HANDLERS
  // ===============================
  const handleSingleProduct = (productId) => {
    const product = products.find((p) => p._id === productId);
    if (!product) return;

    setSingle({
      productId,
      currentQty: product.stock || 0,
      newQty: '',
      diff: 0,
      note: '',
    });
  };

  const handleSingleQty = (value) => {
    const qty = Number(value);
    if (isNaN(qty) || qty < 0) {
      setSingle({ ...single, newQty: value, diff: 0 });
      return;
    }

    setSingle({
      ...single,
      newQty: value,
      diff: qty - single.currentQty,
    });
  };

  const handleSingleSave = async () => {
    if (!single.productId || single.newQty === '') {
      alert(t('alerts.productAndQtyRequired'));
      return;
    }

    if (single.diff === 0) {
      alert(t('alerts.quantityNotChanged'));
      return;
    }

    try {
      setLoading(true);

      await adjustInventory({
        productId: single.productId,
        newQty: Number(single.newQty),
        note: single.note,
      });

      alert(t('alerts.inventoryAdjusted'));

      setSingle({
        productId: '',
        currentQty: 0,
        newQty: '',
        diff: 0,
        note: '',
      });
      setSingleSearch('');
      setSingleSuggestions([]);
    } catch (err) {
      alert(err.response?.data?.message || t('alerts.adjustFailed'));
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // 🔹 BULK HELPERS
  // ===============================
  const updateRow = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;

    if (field === 'productId' && rows.some((r, i) => r.productId === value && i !== index)) {
      alert(t('alerts.productAlreadySelected'));
      return;
    }

    if (field === 'productId') {
      const product = products.find((p) => p._id === value);
      if (product) {
        updated[index].currentQty = product.stock || 0;
        updated[index].newQty = '';
        updated[index].diff = 0;
      }
    }

    if (field === 'newQty') {
      const newQtyNum = Number(value);
      if (!isNaN(newQtyNum)) {
        updated[index].diff = newQtyNum - updated[index].currentQty;
      } else {
        updated[index].diff = 0;
      }
    }

    const row = updated[index];
    const isLastTwo = index >= updated.length - 2;
    const isValid = row.productId && row.newQty !== '' && Number(row.newQty) >= 0;

    if (isLastTwo && isValid) {
      updated.push(createEmptyRow());
    }

    setRows(updated);
  };

  const handleBulkSave = async () => {
    const validRows = rows.filter(
      (r) =>
        r.productId &&
        r.newQty !== '' &&
        !isNaN(Number(r.newQty)) &&
        Number(r.newQty) >= 0 &&
        r.diff !== 0
    );

    if (validRows.length === 0) {
      alert(t('alerts.noValidRows'));
      return;
    }

    try {
      setLoading(true);

      await adjustInventoryBulk(
        validRows.map((r) => ({
          productId: r.productId,
          newQty: Number(r.newQty),
          note: r.note,
        }))
      );

      alert(t('alerts.bulkInventoryAdjusted'));
      await loadProducts();

      setRows(Array.from({ length: 5 }, createEmptyRow));
    } catch (err) {
      alert(err.response?.data?.message || t('alerts.bulkAdjustFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setRows(Array.from({ length: 5 }, createEmptyRow));
  };

  // ===============================
  // 🧾 UI
  // ===============================
  return (
    <div
      style={{
        padding: '20px',
        background: '#f3f4f6',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={() => navigate('/inventory')}
          style={{
            background: 'linear-gradient(135deg,#2563eb,#1e3a8a)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {t('inventory.backToInventory')}
        </button>
      </div>

      {/* MODE SWITCH */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '20px',
          fontWeight: '500',
        }}
      >
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'SINGLE'} onChange={() => setMode('SINGLE')} />{' '}
          {t('inventory.singleAdjust')}
        </label>

        <label style={{ cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'BULK'} onChange={() => setMode('BULK')} />{' '}
          {t('inventory.bulkAdjust')}
        </label>
      </div>

      {/* ================= SINGLE ================= */}
      {mode === 'SINGLE' && (
        <div
          style={{
            maxWidth: '420px',
            background: '#f9fafb',
            padding: '20px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginBottom: '15px' }}>{t('inventory.singleInventoryAdjust')}</h3>

          {/* 🔍 Product Search */}
          <div style={{ position: 'relative', marginBottom: '6px' }}>
            <input
              placeholder={t('inventory.searchProduct')}
              value={singleSearch}
              onChange={(e) => {
                const val = e.target.value;
                setSingleSearch(val);

                if (!val) {
                  setSingleSuggestions([]);
                  setSingleSelectedIndex(-1);
                  return;
                }

                const matches = products.filter((p) =>
                  p.name.toLowerCase().includes(val.toLowerCase())
                );

                setSingleSuggestions(matches);
                setSingleSelectedIndex(0);
              }}
              onKeyDown={(e) => {
                if (singleSuggestions.length === 0) return;

                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSingleSelectedIndex((prev) =>
                    prev < singleSuggestions.length - 1 ? prev + 1 : 0
                  );
                }

                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSingleSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : singleSuggestions.length - 1
                  );
                }

                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  const selected = singleSuggestions[singleSelectedIndex];
                  if (selected) {
                    handleSingleProduct(selected._id);
                    setSingleSearch(selected.name);
                    setSingleSuggestions([]);
                    setSingleSelectedIndex(-1);
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                outline: 'none',
                background: '#fff',
                marginBottom: '10px',
              }}
            />
            {singleSuggestions.length > 0 && (
              <ul
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 10,
                  background: '#fff',
                  border: '1px solid #ccc',
                  width: '100%',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                }}
              >
                {singleSuggestions.map((p, i) => (
                  <li
                    key={p._id}
                    onClick={() => {
                      handleSingleProduct(p._id);
                      setSingleSearch(p.name);
                      setSingleSuggestions([]);
                      setSingleSelectedIndex(-1);
                    }}
                    style={{
                      padding: '6px',
                      cursor: 'pointer',
                      background: i === singleSelectedIndex ? '#eee' : '#fff',
                    }}
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Qty in hand */}
          <input
            value={single.currentQty}
            disabled
            placeholder={t('inventory.qtyInHand')}
            style={{
              width: '100%',
              marginBottom: '10px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />

          {/* New Qty */}
          <input
            type="number"
            placeholder={t('inventory.newQty')}
            value={single.newQty}
            onChange={(e) => handleSingleQty(e.target.value)}
            style={{
              width: '100%',
              marginBottom: '10px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />

          {/* Difference */}
          <input
            value={single.diff !== 0 ? single.diff : ''}
            disabled
            placeholder={t('inventory.difference')}
            style={{
              width: '100%',
              marginBottom: '10px',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />

          {/* Note */}
          <input
            placeholder={t('inventory.reasonOptional')}
            value={single.note}
            onChange={(e) => setSingle({ ...single, note: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              outline: 'none',
              background: '#fff',
              marginBottom: '10px',
            }}
          />

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={handleSingleSave}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg,#16a34a,#14532d)',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {loading ? t('saving') : `💾 ${t('save')}`}
            </button>

            <button
              onClick={() => {
                setSingle({
                  productId: '',
                  currentQty: 0,
                  newQty: '',
                  diff: 0,
                  note: '',
                });
                setSingleSearch('');
              }}
              style={{
                background: '#f59e0b',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🧹 {t('common.clear')}
            </button>
          </div>
        </div>
      )}

      {/* ================= BULK ================= */}
      {mode === 'BULK' && (
        <div style={{ marginTop: '15px' }}>
          <h3>{t('inventory.bulkInventoryAdjust')}</h3>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '10px',
              background: '#fff',
            }}
          >
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'center' }}>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {t('inventory.product')}
                </th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {t('inventory.qtyInHand')}
                </th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {t('inventory.newQty')}
                </th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {t('inventory.difference')}
                </th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>{t('note')}</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={index}
                  style={{
                    background:
                      row.diff > 0
                        ? '#ecfdf5'
                        : row.diff < 0
                          ? '#fef2f2'
                          : index % 2 === 0
                            ? '#ffffff'
                            : '#f9fafb',
                  }}
                >
                  {/* Product */}
                  <td style={{ border: '1px solid #ddd', padding: '6px', position: 'relative' }}>
                    <input
                      placeholder="Search product..."
                      value={row.search}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateRow(index, 'search', val);

                        if (!val) {
                          setBulkSuggestions((p) => ({ ...p, [index]: [] }));
                          setBulkSelectedIndex((p) => ({ ...p, [index]: -1 }));
                          return;
                        }

                        const matches = products.filter((p) =>
                          p.name.toLowerCase().includes(val.toLowerCase())
                        );

                        setBulkSuggestions((p) => ({ ...p, [index]: matches }));
                        setBulkSelectedIndex((p) => ({ ...p, [index]: 0 }));
                      }}
                      style={{ width: '100%', padding: '6px' }}
                    />

                    {bulkSuggestions[index]?.length > 0 && (
                      <ul
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          zIndex: 10,
                          background: '#fff',
                          border: '1px solid #ccc',
                          width: '100%',
                          maxHeight: '150px',
                          overflowY: 'auto',
                          margin: 0,
                          padding: 0,
                          listStyle: 'none',
                        }}
                      >
                        {bulkSuggestions[index].map((p, i) => (
                          <li
                            key={p._id}
                            onClick={() => {
                              updateRow(index, 'productId', p._id);
                              updateRow(index, 'search', p.name);
                              setBulkSuggestions((prev) => ({ ...prev, [index]: [] }));
                              setBulkSelectedIndex((p) => ({ ...p, [index]: -1 }));
                            }}
                            style={{
                              padding: '6px',
                              cursor: 'pointer',
                              background: i === bulkSelectedIndex[index] ? '#eee' : '#fff',
                            }}
                          >
                            {p.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>

                  {/* Qty in hand */}
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>
                    <input
                      value={row.currentQty}
                      disabled
                      style={{ width: '100%', textAlign: 'center' }}
                    />
                  </td>

                  {/* New Qty */}
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>
                    <input
                      type="number"
                      value={row.newQty}
                      onChange={(e) => updateRow(index, 'newQty', e.target.value)}
                      style={{ width: '100%', textAlign: 'center' }}
                    />
                  </td>

                  {/* Diff */}
                  <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>
                    <input
                      value={row.diff > 0 ? `+${row.diff}` : row.diff < 0 ? row.diff : ''}
                      disabled
                      style={{ width: '100%', textAlign: 'center' }}
                    />
                  </td>

                  {/* Note */}
                  <td style={{ border: '1px solid #ddd', padding: '6px' }}>
                    <input
                      placeholder="Note"
                      value={row.note}
                      onChange={(e) => updateRow(index, 'note', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '10px' }}>
            <button
              onClick={handleBulkSave}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg,#16a34a,#14532d)',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {loading ? t('saving') : `💾 ${t('inventory.saveAll')}`}
            </button>

            <button
              onClick={handleClear}
              style={{
                marginLeft: '10px',
                background: '#f59e0b',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🧹 {t('clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryAdjustPage;
