import React, { useState, useEffect } from 'react';
import { searchPurchaseInvoices } from '../services/purchaseInvoiceService';
import { fetchSuppliers } from '../services/supplierService';
import { t } from '../i18n/i18n';

const PurchaseInvoiceSearchModal = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState({
    billNo: '',
    supplierName: '',
    supplierPhone: '',
    startDate: '',
    endDate: '',
  });

  const [results, setResults] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);

  // 🔄 Load Suppliers
  useEffect(() => {
    fetchSuppliers().then(setAllSuppliers);
  }, []);

  // 🧠 Generic change
  const handleChange = (e) => {
    setQuery({ ...query, [e.target.name]: e.target.value });
  };

  // 🔎 Supplier Auto Suggest
  const handleSupplierInput = (e) => {
    const value = e.target.value;
    handleChange(e);

    if (!value.trim()) {
      setSupplierSuggestions([]);
      setSelectedSupplierIndex(-1);
    } else {
      const filtered = allSuppliers.filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) || s.phone?.includes(value)
      );
      setSupplierSuggestions(filtered);
      setSelectedSupplierIndex(-1);
    }
  };

  // ⌨️ Keyboard Navigation
  const handleSupplierKeyDown = (e) => {
    if (supplierSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSupplierIndex((prev) => (prev < supplierSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSupplierIndex((prev) => (prev > 0 ? prev - 1 : supplierSuggestions.length - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = supplierSuggestions[selectedSupplierIndex];
      if (selected) {
        setQuery((q) => ({
          ...q,
          supplierName: selected.name,
          supplierPhone: selected.phone || '',
        }));
        setSupplierSuggestions([]);
      }
    }
  };

  // 🔍 Search
  const handleSearch = async () => {
    try {
      const searchString = Object.entries(query)
        .filter(([_, v]) => v.trim())
        .map(([k, v]) => `${k}:${v.trim()}`)
        .join(' ');

      if (!searchString) return alert(t('alerts.searchFieldRequired'));

      const data = await searchPurchaseInvoices(searchString);
      setResults(data);
    } catch (err) {
      console.error('Search error:', err);
      alert(t('alerts.searchFailed'));
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white rounded p-6 w-full max-w-md relative">
        <h3 className="text-lg font-semibold mb-4">🔍 {t('purchase.findInvoice')}</h3>

        <div className="grid grid-cols-1 gap-3 mb-4 relative">
          <input
            type="text"
            name="billNo"
            placeholder={t('billNo')}
            value={query.billNo}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <div className="relative">
            <input
              type="text"
              name="supplierName"
              placeholder={t('supplier.supplier')}
              value={query.supplierName}
              onChange={handleSupplierInput}
              onKeyDown={handleSupplierKeyDown}
              className="border p-2 rounded w-full"
              autoComplete="off"
            />

            {supplierSuggestions.length > 0 && (
              <ul className="absolute z-10 bg-white border mt-1 w-full max-h-40 overflow-auto rounded shadow">
                {supplierSuggestions.map((s, i) => (
                  <li
                    key={s._id || i}
                    onClick={() => {
                      setQuery((q) => ({
                        ...q,
                        supplierName: s.name,
                        supplierPhone: s.phone || '',
                      }));
                      setSupplierSuggestions([]);
                    }}
                    style={{
                      backgroundColor: selectedSupplierIndex === i ? '#e0f2fe' : 'white',
                      fontWeight: selectedSupplierIndex === i ? 'bold' : 'normal',
                      padding: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    {s.name} – {s.phone}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            type="text"
            name="supplierPhone"
            placeholder={t('phone')}
            value={query.supplierPhone}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="startDate"
            value={query.startDate}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="endDate"
            value={query.endDate}
            onChange={handleChange}
            className="border p-2 rounded"
          />
        </div>

        <div className="flex justify-between mb-4">
          <button type="button" onClick={handleSearch} className="btn btn-primary">
            🔍 {t('search')}
          </button>

          <button
            type="button"
            onClick={() => {
              setQuery({
                billNo: '',
                supplierName: '',
                supplierPhone: '',
                startDate: '',
                endDate: '',
              });
              setResults([]);
              setSupplierSuggestions([]);
            }}
            className="btn btn-warning text-black"
          >
            🧹 {t('clear')}
          </button>

          <button type="button" onClick={onClose} className="btn btn-secondary">
            ❌ {t('close')}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="max-h-64 overflow-y-auto border rounded">
            {results.map((inv) => (
              <li
                key={inv._id}
                onClick={() => onSelect(inv)}
                className="p-2 hover:bg-blue-100 cursor-pointer border-b"
              >
                {inv.billNo} - {inv.supplierName} ({t('date')}:{' '}
                {inv.invoiceDate || inv.date
                  ? new Date(inv.invoiceDate || inv.date).toLocaleDateString('en-GB')
                  : ''}
                )
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PurchaseInvoiceSearchModal;
